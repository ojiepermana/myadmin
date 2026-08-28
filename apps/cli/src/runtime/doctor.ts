export type DoctorStatus = 'ok' | 'warning' | 'fail';

export type DoctorDetail =
  | string
  | number
  | boolean
  | null
  | readonly DoctorDetail[]
  | { readonly [key: string]: DoctorDetail };

export interface CheckResult {
  status: DoctorStatus;
  message: string;
  action?: string;
  details?: Readonly<Record<string, DoctorDetail>>;
}

export interface DoctorCheck {
  id: string;
  title: string;
  run(): CheckResult | Promise<CheckResult>;
}

export interface DoctorCheckReport extends CheckResult {
  id: string;
  title: string;
}

function invalidCheck(message: string): never {
  throw new Error(`Invalid doctor check: ${message}`);
}

function validateCheck(check: DoctorCheck): void {
  if (!check.id.trim()) invalidCheck('id is required');
  if (!check.title.trim()) invalidCheck(`title is required for ${check.id}`);
  if (typeof check.run !== 'function') invalidCheck(`run is required for ${check.id}`);
}

function isDoctorStatus(value: unknown): value is DoctorStatus {
  return value === 'ok' || value === 'warning' || value === 'fail';
}

function normalizeResult(check: DoctorCheck, value: CheckResult): CheckResult {
  if (!isDoctorStatus(value?.status) || typeof value.message !== 'string') {
    return {
      status: 'fail',
      message: 'The check returned an invalid result.',
      action: `Fix the ${check.id} doctor check and run myadmin doctor again.`,
    };
  }
  return value;
}

export class DoctorRegistry {
  private readonly checks: DoctorCheck[] = [];

  public constructor(checks: readonly DoctorCheck[] = []) {
    for (const check of checks) {
      this.register(check);
    }
  }

  public register(check: DoctorCheck): this {
    validateCheck(check);
    if (this.checks.some((registered) => registered.id === check.id)) {
      throw new Error(`Doctor check ${check.id} is already registered`);
    }
    this.checks.push(check);
    return this;
  }

  public list(): readonly DoctorCheck[] {
    return this.checks;
  }

  public async run(): Promise<readonly DoctorCheckReport[]> {
    const reports: DoctorCheckReport[] = [];
    for (const check of this.checks) {
      try {
        const result = normalizeResult(check, await check.run());
        reports.push({ ...result, id: check.id, title: check.title });
      } catch {
        reports.push({
          id: check.id,
          title: check.title,
          status: 'fail',
          message: 'The check could not be completed.',
          action: 'Review the reported prerequisite and run myadmin doctor again.',
        });
      }
    }
    return reports;
  }
}

export function createDoctorRegistry(checks: readonly DoctorCheck[] = []): DoctorRegistry {
  return new DoctorRegistry(checks);
}
