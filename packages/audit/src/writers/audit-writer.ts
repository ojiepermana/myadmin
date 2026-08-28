import type {
  AuditEvent,
  AuditFilter,
  AuditRepository,
  AuditResult,
  EntityId,
  JsonObject,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import { redaction, type Redaction } from '@myadmin/crypto';
import { createUuidV7 } from '@myadmin/kernel';
import { getCorrelationId } from '@myadmin/observability';
import {
  getAuditActionDefinition,
  isAuditAction,
  isRequiredAuditAction,
  type AuditAction,
} from '../events';
import { boundUsernameAttempted, validateAuditDetails } from '../policies';

export interface AuditEventDraft {
  readonly action: AuditAction;
  readonly actorUserId?: EntityId | null;
  readonly targetType?: string | null;
  readonly targetRef?: string | null;
  readonly connectionId?: EntityId | null;
  readonly details?: JsonObject | null;
}

export interface AuditRecordInput extends AuditEventDraft {
  readonly result: AuditResult;
}

export type AuditEventFactory = AuditEventDraft | (() => AuditEventDraft);
export type AuditOperation<T> = () => T | PromiseLike<T>;

export interface AuditWriterOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly getCorrelationId?: () => string | undefined;
  readonly redaction?: Pick<Redaction, 'redactObject'>;
}

export type AuditTransaction = <T>(operation: () => Promise<T>) => T | PromiseLike<T>;

export class InvalidAuditActionError extends Error {
  public readonly action: unknown;

  public constructor(action: unknown) {
    super('The audit action is not registered in the audit taxonomy');
    this.name = 'InvalidAuditActionError';
    this.action = action;
  }
}

export class AuditValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuditValidationError';
  }
}

export class AuditWriteError extends Error {
  public constructor(cause?: unknown) {
    super('The required audit event could not be written');
    this.name = 'AuditWriteError';
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

function isAuditResult(value: unknown): value is AuditResult {
  return value === 'success' || value === 'failure' || value === 'denied';
}

function resolvedDraft(event: AuditEventFactory): AuditEventDraft {
  const draft = typeof event === 'function' ? event() : event;
  if (typeof draft !== 'object' || draft === null || !isAuditAction(draft.action)) {
    throw new InvalidAuditActionError(
      typeof draft === 'object' && draft !== null ? draft.action : undefined,
    );
  }
  return draft;
}

function auditWriteError(error: unknown): AuditWriteError {
  return error instanceof AuditWriteError ? error : new AuditWriteError(error);
}

export class AuditWriter {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly getCorrelationId: () => string | undefined;
  private readonly redaction: Pick<Redaction, 'redactObject'>;

  public constructor(
    private readonly repository: AuditRepository,
    options: AuditWriterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.getCorrelationId = options.getCorrelationId ?? getCorrelationId;
    this.redaction = options.redaction ?? redaction;
  }

  public record(event: AuditRecordInput): void {
    const definition = getAuditActionDefinition(event?.action);
    if (!definition) throw new InvalidAuditActionError(event?.action);
    if (!isAuditResult(event?.result)) {
      throw new AuditValidationError('Audit result must be success, failure, or denied');
    }

    const occurredAt = this.now();
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new AuditValidationError('Audit timestamp must be a valid date');
    }

    const details = event.details ?? null;
    const candidate = {
      id: this.createId(),
      occurredAt,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType ?? definition.targetType,
      targetRef: event.targetRef ?? null,
      connectionId: event.connectionId ?? null,
      result: event.result,
      correlationId: this.getCorrelationId() ?? null,
      details,
    } satisfies AuditEvent;
    const safeEvent = this.redaction.redactObject(candidate);
    const safeDetails = boundUsernameAttempted(safeEvent.details);
    validateAuditDetails(safeDetails);

    this.repository.append({
      ...safeEvent,
      details: safeDetails,
    });
  }

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    if (filter?.action !== undefined && !isAuditAction(filter.action)) {
      throw new InvalidAuditActionError(filter.action);
    }
    return this.repository.query(filter, page);
  }

  public async withAudit<T>(
    event: AuditEventFactory,
    operation: AuditOperation<T>,
    transaction?: AuditTransaction,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = resolvedDraft(event);
      let value: T;
      try {
        value = await operation();
      } catch (operationError) {
        try {
          await this.record({ ...draft, result: 'failure' });
        } catch (auditError) {
          throw auditWriteError(auditError);
        }
        throw operationError;
      }

      try {
        await this.record({ ...draft, result: 'success' });
      } catch (auditError) {
        if (isRequiredAuditAction(draft.action)) throw auditWriteError(auditError);
      }
      return value;
    };

    return transaction ? transaction(run) : run();
  }
}

export async function withAudit<T>(
  writer: AuditWriter,
  event: AuditEventFactory,
  operation: AuditOperation<T>,
  transaction?: AuditTransaction,
): Promise<T> {
  return writer.withAudit(event, operation, transaction);
}
