import { randomBytes as cryptoRandomBytes, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import { PasswordHasher, validatePassword, type PasswordPolicyViolation } from '@myadmin/crypto';
import type { InternalUnitOfWork, Session, User } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import { InMemoryRateLimiter } from './rate-limiter';
import type { PublicUser } from './initial-admin';

export const SESSION_COOKIE_NAME = 'myadmin_session';
export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOUCH_INTERVAL_MS = 60_000;
export const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
export const AUTH_INVALID_CREDENTIALS_MESSAGE = 'Username or password is incorrect.';

// A real Argon2id hash keeps unknown-user verification on the same expensive path.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$ze5edbzdJWdIm/VzAxNq+Qw7kJJdCi1G3ofg62PiL18$d32RNJJ6VP1UQvQckmd7OwaZtDj9jgmEG/doyzSXVfo';

export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED';

export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly retryAfterSeconds?: number;
  public readonly details?: Record<string, unknown>;

  public constructor(
    code: AuthErrorCode,
    message: string,
    retryAfterSeconds?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

export interface AuthLoginInput {
  readonly username: string;
  readonly password: string;
  readonly ipAddress: string;
}

export interface AuthLoginResult {
  readonly user: PublicUser;
  readonly token: string;
}

export interface ChangePasswordInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface AuthenticatedSession {
  readonly session: Session;
  readonly user: PublicUser;
}

export type SessionValidation =
  | { readonly authenticated: true; readonly value: AuthenticatedSession }
  | {
      readonly authenticated: false;
      readonly code: 'AUTH_UNAUTHENTICATED' | 'SESSION_EXPIRED';
    };

export type AuthStore = Pick<InternalUnitOfWork, 'users' | 'sessions' | 'audit' | 'transaction'>;

export interface AuthServiceOptions {
  readonly store: AuthStore;
  readonly passwordHasher?: PasswordHasher;
  readonly auditWriter?: AuditWriter;
  readonly loginRateLimiter?: InMemoryRateLimiter;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly randomBytes?: (size: number) => Uint8Array;
  readonly idleTimeoutMinutes?: number;
  readonly absoluteTimeoutHours?: number;
  readonly touchIntervalMs?: number;
}

function publicUser(user: User): PublicUser {
  return { id: user.id, username: user.username, role: user.role };
}

function tokenFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function idleDeadline(session: Session, idleTimeoutMinutes: number): number {
  return (session.lastSeenAt ?? session.createdAt).getTime() + idleTimeoutMinutes * 60_000;
}

function absoluteDeadline(session: Session): number {
  return session.expiresAt.getTime();
}

function isExpired(session: Session, now: Date, idleTimeoutMinutes: number): boolean {
  return (
    now.getTime() >= absoluteDeadline(session) ||
    now.getTime() >= idleDeadline(session, idleTimeoutMinutes)
  );
}

function invalidCredentials(reason: 'credentials_invalid' | 'user_inactive'): AuthError {
  // The reason is deliberately kept for the audit caller and never exposed in the error.
  void reason;
  return new AuthError('AUTH_INVALID_CREDENTIALS', AUTH_INVALID_CREDENTIALS_MESSAGE);
}

/** Local username/password authentication and opaque server-side sessions. */
export class AuthService {
  private readonly passwordHasher: PasswordHasher;
  private readonly auditWriter: AuditWriter;
  private readonly loginRateLimiter: InMemoryRateLimiter;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly randomBytes: (size: number) => Uint8Array;
  private readonly idleTimeoutMinutes: number;
  private readonly absoluteTimeoutHours: number;
  private readonly touchIntervalMs: number;

  public constructor(
    private readonly store: AuthStore,
    options: Omit<AuthServiceOptions, 'store'> = {},
  ) {
    this.passwordHasher = options.passwordHasher ?? new PasswordHasher();
    this.auditWriter = options.auditWriter ?? new AuditWriter(store.audit);
    this.loginRateLimiter = options.loginRateLimiter ?? new InMemoryRateLimiter();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.randomBytes = options.randomBytes ?? ((size) => cryptoRandomBytes(size));
    this.idleTimeoutMinutes = options.idleTimeoutMinutes ?? 720;
    this.absoluteTimeoutHours = options.absoluteTimeoutHours ?? 168;
    this.touchIntervalMs = options.touchIntervalMs ?? SESSION_TOUCH_INTERVAL_MS;

    if (!Number.isInteger(this.idleTimeoutMinutes) || this.idleTimeoutMinutes < 1) {
      throw new RangeError('Session idle timeout must be a positive integer');
    }
    if (!Number.isInteger(this.absoluteTimeoutHours) || this.absoluteTimeoutHours < 1) {
      throw new RangeError('Session absolute timeout must be a positive integer');
    }
    if (!Number.isInteger(this.touchIntervalMs) || this.touchIntervalMs < 1) {
      throw new RangeError('Session touch interval must be a positive integer');
    }
  }

  public async login(input: AuthLoginInput): Promise<AuthLoginResult> {
    const ipKey = `ip:${input.ipAddress}`;
    const usernameKey = `username:${input.username.toLowerCase()}`;
    const ipLimit = this.loginRateLimiter.consume(ipKey);
    const usernameLimit = ipLimit.allowed ? this.loginRateLimiter.consume(usernameKey) : ipLimit;
    if (!ipLimit.allowed || !usernameLimit.allowed) {
      const retryAfterSeconds = Math.max(
        ipLimit.retryAfterSeconds,
        usernameLimit.retryAfterSeconds,
      );
      throw new AuthError(
        'RATE_LIMITED',
        'Too many login attempts. Try again later.',
        retryAfterSeconds,
      );
    }

    const user = this.store.transaction(({ users }) => users.findByUsername(input.username));
    const verification = await this.passwordHasher.verify(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const reason = user?.isActive === false ? 'user_inactive' : 'credentials_invalid';
    if (!user || !user.isActive || !verification.ok) {
      this.store.transaction(() => {
        this.auditWriter.record({
          action: AuditEvents.auth.login_failed.action,
          result: 'failure',
          actorUserId: null,
          targetRef: user?.id ?? null,
          details: { usernameAttempted: input.username, reason },
        });
      });
      throw invalidCredentials(reason);
    }

    this.loginRateLimiter.reset(ipKey);
    this.loginRateLimiter.reset(usernameKey);

    if (verification.needsRehash) {
      const passwordHash = await this.passwordHasher.hash(input.password);
      const updatedAt = this.now();
      this.store.transaction(({ users }) => {
        const current = users.findById(user.id);
        if (!current || !current.isActive || current.passwordHash !== user.passwordHash) return;
        users.update({ ...current, passwordHash, updatedAt });
      });
    }

    const token = tokenFromBytes(this.randomBytes(SESSION_TOKEN_BYTES));
    const createdAt = this.now();
    const session: Session = {
      id: this.createId(),
      userId: user.id,
      tokenHash: tokenHash(token),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + this.absoluteTimeoutHours * 60 * 60_000),
      lastSeenAt: createdAt,
      revokedAt: null,
    };

    this.store.transaction(({ sessions }) => {
      sessions.create(session);
      this.auditWriter.record({
        action: AuditEvents.auth.login_succeeded.action,
        result: 'success',
        actorUserId: user.id,
        targetRef: user.id,
        details: { username: user.username },
      });
    });

    return { user: publicUser(user), token };
  }

  public validateSession(token: string | undefined): SessionValidation {
    if (!token || token.length > 512) {
      return { authenticated: false, code: 'AUTH_UNAUTHENTICATED' };
    }

    const now = this.now();
    return this.store.transaction(({ sessions, users }) => {
      const session = sessions.findByTokenHash(tokenHash(token));
      if (!session || session.revokedAt !== null) {
        return { authenticated: false, code: 'AUTH_UNAUTHENTICATED' };
      }
      if (isExpired(session, now, this.idleTimeoutMinutes)) {
        return { authenticated: false, code: 'SESSION_EXPIRED' };
      }

      const user = users.findById(session.userId);
      if (!user || !user.isActive) {
        return { authenticated: false, code: 'AUTH_UNAUTHENTICATED' };
      }

      if (
        session.lastSeenAt === null ||
        now.getTime() - session.lastSeenAt.getTime() >= this.touchIntervalMs
      ) {
        sessions.touch(session.id, now);
        return {
          authenticated: true,
          value: {
            session: { ...session, lastSeenAt: now },
            user: publicUser(user),
          },
        };
      }

      return { authenticated: true, value: { session, user: publicUser(user) } };
    });
  }

  public logout(token: string | undefined): SessionValidation {
    const authenticated = this.validateSession(token);
    if (!authenticated.authenticated) return authenticated;

    this.store.transaction(({ sessions }) => {
      sessions.revoke(authenticated.value.session.id, this.now());
      this.auditWriter.record({
        action: AuditEvents.auth.logout.action,
        result: 'success',
        actorUserId: authenticated.value.user.id,
        targetRef: authenticated.value.session.id,
        details: { username: authenticated.value.user.username },
      });
    });
    return authenticated;
  }

  public async changePassword(input: ChangePasswordInput): Promise<void> {
    const user = this.store.transaction(({ users }) => users.findById(input.userId));
    if (!user || !user.isActive) {
      throw new AuthError('AUTH_UNAUTHENTICATED', 'A valid session is required.');
    }

    const verification = await this.passwordHasher.verify(input.currentPassword, user.passwordHash);
    if (!verification.ok) {
      this.store.transaction(() => {
        this.auditWriter.record({
          action: AuditEvents.user.password_changed.action,
          result: 'failure',
          actorUserId: user.id,
          targetRef: user.id,
          details: { reason: 'current_password_invalid' },
        });
      });
      throw new AuthError('AUTH_INVALID_CREDENTIALS', 'The current password is incorrect.');
    }

    const policy = validatePassword(input.newPassword, user.username);
    if (!policy.valid) {
      this.store.transaction(() => {
        this.auditWriter.record({
          action: AuditEvents.user.password_changed.action,
          result: 'failure',
          actorUserId: user.id,
          targetRef: user.id,
          details: { reason: 'password_policy_invalid' },
        });
      });
      throw new AuthError(
        'VALIDATION_FAILED',
        'The new password does not meet the password requirements.',
        undefined,
        passwordPolicyDetails(policy.violations),
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    this.store.transaction(({ users, sessions }) => {
      const current = users.findById(user.id);
      if (!current || !current.isActive) {
        throw new AuthError('AUTH_UNAUTHENTICATED', 'A valid session is required.');
      }
      if (current.passwordHash !== user.passwordHash) {
        throw new AuthError('AUTH_INVALID_CREDENTIALS', 'The current password is incorrect.');
      }

      const updatedAt = this.now();
      users.update({ ...current, passwordHash, updatedAt });
      sessions.revokeAllForUserExcept(current.id, input.sessionId, updatedAt);
      this.auditWriter.record({
        action: AuditEvents.user.password_changed.action,
        result: 'success',
        actorUserId: current.id,
        targetRef: current.id,
        details: { username: current.username },
      });
    });
  }

  public deleteExpired(): number {
    return this.store.transaction(({ sessions }) => sessions.deleteExpired(this.now()));
  }

  public static tokenHash(token: string): string {
    return tokenHash(token);
  }

  public static publicUser(user: User): PublicUser {
    return publicUser(user);
  }
}

export { DUMMY_PASSWORD_HASH };

function passwordPolicyDetails(
  violations: readonly PasswordPolicyViolation[],
): Record<string, unknown> {
  return { fields: { newPassword: violations.map((violation) => violation.code) } };
}
