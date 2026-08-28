import type { AuditRepository, User, UserRepository } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import {
  PasswordHasher,
  redaction,
  validatePassword,
  type PasswordPolicyViolation,
} from '@myadmin/crypto';

export interface InitialAdminInput {
  readonly username: string;
  readonly password: string;
}

export interface PublicUser {
  readonly id: string;
  readonly username: string;
  readonly role: User['role'];
}

export interface InitialAdminRepositories {
  readonly users: UserRepository;
  readonly audit: AuditRepository;
}

export interface InitialAdminStore {
  transaction<T>(operation: (repositories: InitialAdminRepositories) => T): T;
}

export type InitialAdminErrorCode = 'VALIDATION_FAILED' | 'ALREADY_INITIALIZED' | 'USERNAME_TAKEN';

export interface InitialAdminErrorDetails {
  readonly [key: string]: unknown;
}

export class InitialAdminError extends Error {
  public readonly code: InitialAdminErrorCode;
  public readonly details?: InitialAdminErrorDetails;

  public constructor(
    code: InitialAdminErrorCode,
    message: string,
    details?: InitialAdminErrorDetails,
  ) {
    super(message);
    this.name = 'InitialAdminError';
    this.code = code;
    this.details = details;
  }
}

export interface InitialAdminServiceOptions {
  readonly store: InitialAdminStore;
  readonly passwordHasher?: PasswordHasher;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export interface InitialAdminServiceResult {
  readonly user: PublicUser;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}

function usernameViolations(username: string): readonly string[] {
  const violations: string[] = [];
  const length = Array.from(username).length;

  if (length < USERNAME_MIN_LENGTH) violations.push('too_short');
  if (length > USERNAME_MAX_LENGTH) violations.push('too_long');
  if (!USERNAME_PATTERN.test(username)) violations.push('invalid_characters');

  return violations;
}

function validationDetails(
  usernameErrors: readonly string[],
  passwordErrors: readonly PasswordPolicyViolation[],
): InitialAdminErrorDetails {
  return {
    fields: {
      username: usernameErrors,
      password: passwordErrors.map((violation) => violation.code),
    },
  };
}

function activeAdmin(users: UserRepository): User | null {
  return users.list().find((user) => user.role === 'admin' && user.isActive) ?? null;
}

/** Owns the one-way claim of an empty MyAdmin instance. */
export class InitialAdminService {
  private readonly store: InitialAdminStore;
  private readonly passwordHasher: PasswordHasher;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private initialized: boolean | undefined;

  public constructor(options: InitialAdminServiceOptions) {
    this.store = options.store;
    this.passwordHasher = options.passwordHasher ?? new PasswordHasher();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
  }

  public isInitialized(): boolean {
    if (this.initialized !== undefined) return this.initialized;

    const initialized = this.store.transaction(({ users }) => activeAdmin(users) !== null);
    this.initialized = initialized;
    return initialized;
  }

  public async create(
    input: InitialAdminInput,
    correlationId?: string,
  ): Promise<InitialAdminServiceResult> {
    const usernameErrors = usernameViolations(input.username);
    const passwordResult = validatePassword(input.password, input.username);
    if (usernameErrors.length > 0 || !passwordResult.valid) {
      throw new InitialAdminError(
        'VALIDATION_FAILED',
        'The username or password does not meet the setup requirements.',
        validationDetails(usernameErrors, passwordResult.violations),
      );
    }

    const releasePassword = redaction.registerEphemeralSecret(input.password);
    let passwordHash: string;
    try {
      passwordHash = await this.passwordHasher.hash(input.password);
    } finally {
      releasePassword();
    }
    const createdAt = this.now();
    const user: User = {
      id: this.createId(),
      username: input.username,
      passwordHash,
      role: 'admin',
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    };

    const created = this.store.transaction(({ users, audit }) => {
      if (activeAdmin(users)) {
        throw new InitialAdminError(
          'ALREADY_INITIALIZED',
          'The application has already been initialized.',
        );
      }
      if (users.findByUsername(user.username)) {
        throw new InitialAdminError('USERNAME_TAKEN', 'That username is already in use.');
      }

      users.create(user);
      audit.append({
        id: this.createId(),
        occurredAt: createdAt,
        actorUserId: user.id,
        action: 'auth.initial_admin.created',
        targetType: 'user',
        targetRef: user.id,
        connectionId: null,
        result: 'success',
        correlationId: correlationId ?? null,
        details: { username: user.username },
      });
      return user;
    });

    this.initialized = true;
    return { user: publicUser(created) };
  }
}

export { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN };
