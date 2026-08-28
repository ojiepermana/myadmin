import { AuditEvents, AuditWriter } from '@myadmin/audit';
import {
  PasswordHasher,
  redaction,
  validatePassword,
  type PasswordPolicyViolation,
} from '@myadmin/crypto';
import type {
  InternalUnitOfWork,
  Page,
  PageRequest,
  User,
  UserRole,
} from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  type PublicUser,
} from './initial-admin';

export interface CreateUserInput {
  readonly username: string;
  readonly password: string;
  readonly role: UserRole;
}

export interface UpdateUserRoleStatusInput {
  readonly role?: UserRole;
  readonly isActive?: boolean;
}

export interface ResetPasswordInput {
  readonly newPassword: string;
}

export interface ManagedUser extends PublicUser {
  readonly isActive: boolean;
}

export type UserManagementStore = Pick<
  InternalUnitOfWork,
  'users' | 'sessions' | 'audit' | 'transaction'
>;

export type UserManagementErrorCode =
  'VALIDATION_FAILED' | 'USERNAME_TAKEN' | 'USER_NOT_FOUND' | 'LAST_ADMIN';

export interface UserManagementErrorDetails {
  readonly [key: string]: unknown;
}

export class UserManagementError extends Error {
  public readonly code: UserManagementErrorCode;
  public readonly details?: UserManagementErrorDetails;

  public constructor(
    code: UserManagementErrorCode,
    message: string,
    details?: UserManagementErrorDetails,
  ) {
    super(message);
    this.name = 'UserManagementError';
    this.code = code;
    this.details = details;
  }
}

export interface UserManagementServiceOptions {
  readonly store: UserManagementStore;
  readonly passwordHasher?: PasswordHasher;
  readonly auditWriter?: AuditWriter;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

function managedUser(user: User): ManagedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
}

function validationDetails(
  usernameErrors: readonly string[],
  passwordErrors: readonly PasswordPolicyViolation[],
  roleError = false,
): UserManagementErrorDetails {
  return {
    fields: {
      ...(usernameErrors.length > 0 ? { username: usernameErrors } : {}),
      ...(passwordErrors.length > 0
        ? { password: passwordErrors.map((violation) => violation.code) }
        : {}),
      ...(roleError ? { role: ['invalid'] } : {}),
    },
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

function roleIsValid(role: unknown): role is UserRole {
  return role === 'admin' || role === 'user';
}

function activeAdminCount(users: User[]): number {
  return users.filter((user) => user.role === 'admin' && user.isActive).length;
}

function assertNotLastAdmin(
  users: User[],
  target: User,
  nextRole: UserRole,
  nextIsActive: boolean,
): void {
  const remainsAdmin = nextRole === 'admin' && nextIsActive;
  if (target.role === 'admin' && target.isActive && !remainsAdmin) {
    const otherActiveAdmins = users.filter(
      (user) => user.id !== target.id && user.role === 'admin' && user.isActive,
    ).length;
    if (otherActiveAdmins === 0) {
      throw new UserManagementError(
        'LAST_ADMIN',
        'The last active administrator cannot be disabled or demoted.',
      );
    }
  }
}

/** Implements the administrator user lifecycle and its security invariants. */
export class UserManagementService {
  private readonly store: UserManagementStore;
  private readonly passwordHasher: PasswordHasher;
  private readonly auditWriter: AuditWriter;
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor(options: UserManagementServiceOptions) {
    this.store = options.store;
    this.passwordHasher = options.passwordHasher ?? new PasswordHasher();
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
  }

  public list(request?: PageRequest): Page<ManagedUser> {
    return this.store.transaction(({ users }) => {
      const result = users.listPage(request);
      return { ...result, items: result.items.map(managedUser) };
    });
  }

  public async createUser(input: CreateUserInput, actorUserId: string): Promise<ManagedUser> {
    const usernameErrors = usernameViolations(input.username);
    const passwordResult = validatePassword(input.password, input.username);
    const roleError = !roleIsValid(input.role);
    if (usernameErrors.length > 0 || !passwordResult.valid || roleError) {
      throw new UserManagementError(
        'VALIDATION_FAILED',
        'The username, password, or role does not meet the user requirements.',
        validationDetails(usernameErrors, passwordResult.violations, roleError),
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
      role: input.role,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    };

    const created = this.store.transaction(({ users }) => {
      if (users.findByUsername(user.username)) {
        throw new UserManagementError('USERNAME_TAKEN', 'That username is already in use.');
      }
      users.create(user);
      this.auditWriter.record({
        action: AuditEvents.user.created.action,
        result: 'success',
        actorUserId,
        targetRef: user.id,
        details: { username: user.username, role: user.role },
      });
      return user;
    });

    return managedUser(created);
  }

  public updateUserRoleStatus(
    targetUserId: string,
    input: UpdateUserRoleStatusInput,
    actorUserId: string,
  ): ManagedUser {
    if (input.role === undefined && input.isActive === undefined) {
      throw new UserManagementError(
        'VALIDATION_FAILED',
        'At least one user attribute must be provided.',
      );
    }
    if (input.role !== undefined && !roleIsValid(input.role)) {
      throw new UserManagementError('VALIDATION_FAILED', 'The role is invalid.', {
        fields: { role: ['invalid'] },
      });
    }

    return this.store.transaction(({ users, sessions }) => {
      const user = users.findById(targetUserId);
      if (!user) throw new UserManagementError('USER_NOT_FOUND', 'The user was not found.');

      const nextRole = input.role ?? user.role;
      const nextIsActive = input.isActive ?? user.isActive;
      assertNotLastAdmin(users.list(), user, nextRole, nextIsActive);

      const changedRole = nextRole !== user.role;
      const changedStatus = nextIsActive !== user.isActive;
      if (!changedRole && !changedStatus) return managedUser(user);

      const updatedAt = this.now();
      const updated = { ...user, role: nextRole, isActive: nextIsActive, updatedAt };
      users.update(updated);

      if (changedStatus) {
        if (!nextIsActive) sessions.revokeAllForUser(user.id, updatedAt);
        this.auditWriter.record({
          action: nextIsActive
            ? AuditEvents.user.activated.action
            : AuditEvents.user.deactivated.action,
          result: 'success',
          actorUserId,
          targetRef: user.id,
          details: { username: user.username },
        });
      }
      if (changedRole) {
        this.auditWriter.record({
          action: AuditEvents.user.role_changed.action,
          result: 'success',
          actorUserId,
          targetRef: user.id,
          details: { username: user.username, from: user.role, to: nextRole },
        });
      }

      return managedUser(updated);
    });
  }

  public async resetPassword(
    targetUserId: string,
    input: ResetPasswordInput,
    actorUserId: string,
  ): Promise<void> {
    const target = this.store.transaction(({ users }) => users.findById(targetUserId));
    if (!target) throw new UserManagementError('USER_NOT_FOUND', 'The user was not found.');

    const passwordResult = validatePassword(input.newPassword, target.username);
    if (!passwordResult.valid) {
      throw new UserManagementError(
        'VALIDATION_FAILED',
        'The new password does not meet the password requirements.',
        validationDetails([], passwordResult.violations),
      );
    }

    const releasePassword = redaction.registerEphemeralSecret(input.newPassword);
    let passwordHash: string;
    try {
      passwordHash = await this.passwordHasher.hash(input.newPassword);
    } finally {
      releasePassword();
    }
    this.store.transaction(({ users, sessions }) => {
      const current = users.findById(targetUserId);
      if (!current) throw new UserManagementError('USER_NOT_FOUND', 'The user was not found.');

      const updatedAt = this.now();
      users.update({ ...current, passwordHash, updatedAt });
      sessions.revokeAllForUser(current.id, updatedAt);
      this.auditWriter.record({
        action: AuditEvents.user.password_reset.action,
        result: 'success',
        actorUserId,
        targetRef: current.id,
        details: { username: current.username },
      });
    });
  }

  public activeAdminCount(): number {
    return this.store.transaction(({ users }) => activeAdminCount(users.list()));
  }
}
