export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

export const PASSWORD_POLICY = Object.freeze({
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
});

export type PasswordViolationCode = 'too_short' | 'too_long' | 'matches_username';

export interface PasswordPolicyViolation {
  readonly code: PasswordViolationCode;
  readonly message: string;
}

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly violations: readonly PasswordPolicyViolation[];
}

export class PasswordPolicyError extends Error {
  public readonly violations: readonly PasswordPolicyViolation[];

  public constructor(violations: readonly PasswordPolicyViolation[]) {
    super(violations.map((violation) => violation.message).join(' '));
    this.name = 'PasswordPolicyError';
    this.violations = violations;
  }
}

function passwordLength(password: string): number {
  return Array.from(password).length;
}

export function validatePassword(password: string, username: string): PasswordPolicyResult {
  const violations: PasswordPolicyViolation[] = [];
  const length = passwordLength(password);

  if (length < PASSWORD_MIN_LENGTH) {
    violations.push({
      code: 'too_short',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    });
  }

  if (length > PASSWORD_MAX_LENGTH) {
    violations.push({
      code: 'too_long',
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
    });
  }

  if (username.length > 0 && password.toLowerCase() === username.toLowerCase()) {
    violations.push({
      code: 'matches_username',
      message: 'Password must not be the same as the username',
    });
  }

  return { valid: violations.length === 0, violations };
}

export function isPasswordValid(password: string, username: string): boolean {
  return validatePassword(password, username).valid;
}

export function assertPasswordPolicy(password: string, username: string): void {
  const result = validatePassword(password, username);
  if (!result.valid) {
    throw new PasswordPolicyError(result.violations);
  }
}
