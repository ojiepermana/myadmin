import type { TerminalPresenter } from './terminal-presenter';
import { Redaction } from '@myadmin/crypto';
import type { DoctorCheckReport, DoctorDetail, DoctorStatus } from '../runtime/doctor';

export interface DoctorSummary {
  total: number;
  ok: number;
  warning: number;
  fail: number;
}

export interface DoctorOutput {
  status: Exclude<DoctorStatus, 'warning'>;
  checks: readonly DoctorCheckReport[];
  summary: DoctorSummary;
  exitCode: 0 | 1;
}

const sensitiveKeyPattern =
  /(?:password|passphrase|secret|token|credential|authorization|cookie|private[_ -]?key|master[_ -]?key|connection[_ -]?string|dsn|sql|query)/i;

export function sanitizeDiagnosticText(value: string): string {
  const locallySanitized = value
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s,;]+/gi, '[REDACTED_CONNECTION_STRING]')
    .replace(/\b(connection string|dsn)\b(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
    .replace(
      /\b(password|passphrase|secret|token|credential|authorization|cookie|private[_ -]?key|master[_ -]?key)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
  return Redaction.redactText(locallySanitized);
}

function sanitizeDetail(value: DoctorDetail, key?: string): DoctorDetail {
  if (key && sensitiveKeyPattern.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return sanitizeDiagnosticText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDetail(item));
  }
  if (typeof value === 'object' && value !== null) {
    const sanitized: Record<string, DoctorDetail> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      sanitized[childKey] = sanitizeDetail(childValue, childKey);
    }
    return sanitized;
  }
  return value;
}

export function sanitizeDoctorReports(
  reports: readonly DoctorCheckReport[],
): readonly DoctorCheckReport[] {
  return reports.map((report) => ({
    id: report.id,
    title: sanitizeDiagnosticText(report.title),
    status: report.status,
    message: sanitizeDiagnosticText(report.message),
    ...(report.action ? { action: sanitizeDiagnosticText(report.action) } : {}),
    ...(report.details
      ? {
          details: sanitizeDetail(report.details) as Readonly<Record<string, DoctorDetail>>,
        }
      : {}),
  }));
}

export function summarizeDoctorReports(reports: readonly DoctorCheckReport[]): DoctorSummary {
  return reports.reduce<DoctorSummary>(
    (summary, report) => {
      summary[report.status] += 1;
      summary.total += 1;
      return summary;
    },
    { total: 0, ok: 0, warning: 0, fail: 0 },
  );
}

export function createDoctorOutput(reports: readonly DoctorCheckReport[]): DoctorOutput {
  const checks = sanitizeDoctorReports(reports);
  const summary = summarizeDoctorReports(checks);
  return {
    status: summary.fail === 0 ? 'ok' : 'fail',
    checks,
    summary,
    exitCode: summary.fail === 0 ? 0 : 1,
  };
}

function displayDetail(value: DoctorDetail): string {
  return typeof value === 'string'
    ? Redaction.redactText(value)
    : JSON.stringify(Redaction.redactObject(value));
}

export function formatDoctorText(output: DoctorOutput): string {
  const safeOutput = createDoctorOutput(output.checks);
  const lines = ['MyAdmin doctor'];
  for (const check of safeOutput.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.title}: ${check.message}`);
    if (check.action) {
      lines.push(`  Action: ${check.action}`);
    }
    for (const [key, value] of Object.entries(check.details ?? {})) {
      lines.push(`  ${key}: ${displayDetail(value)}`);
    }
  }
  lines.push(
    `Summary: ${safeOutput.summary.total} checks, ${safeOutput.summary.ok} ok, ${safeOutput.summary.warning} warning, ${safeOutput.summary.fail} fail`,
  );
  return lines.join('\n');
}

function stableJsonCheck(check: DoctorCheckReport): Record<string, unknown> {
  return {
    id: check.id,
    title: check.title,
    status: check.status,
    message: check.message,
    action: check.action ?? null,
    details: check.details ?? {},
  };
}

export function formatDoctorJson(output: DoctorOutput): string {
  const safeOutput = createDoctorOutput(output.checks);
  return JSON.stringify({
    status: safeOutput.status,
    checks: safeOutput.checks.map(stableJsonCheck),
    summary: safeOutput.summary,
    exitCode: safeOutput.exitCode,
  });
}

export function presentDoctorOutput(
  presenter: TerminalPresenter,
  output: DoctorOutput,
  json = false,
): void {
  presenter.info(json ? formatDoctorJson(output) : formatDoctorText(output));
}
