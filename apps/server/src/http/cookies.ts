/**
 * Cookie reading and session cookie shapes.
 *
 * Every route module used to carry its own `cookieValue`, and the copies had
 * drifted in a way that matters: some hardcoded the literal `'myadmin_session'`
 * instead of importing `SESSION_COOKIE_NAME`, so renaming the cookie would have
 * silently unauthenticated half the API. The parsing itself was byte identical
 * in all of them, which is exactly the kind of duplication that survives review
 * and then rots.
 *
 * Part of the server HTTP kernel (spec 0056 AC-9).
 */
import { SESSION_COOKIE_NAME } from '@myadmin/auth';

/** Reads one cookie from the request's `cookie` header. */
export function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

/** Reads the session token, always from the one cookie name auth owns. */
export function sessionToken(request: Request): string | undefined {
  return cookieValue(request, SESSION_COOKIE_NAME);
}

/** The `set-cookie` value that starts a session. */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The `set-cookie` value that clears a session, sent on every 401. */
export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
