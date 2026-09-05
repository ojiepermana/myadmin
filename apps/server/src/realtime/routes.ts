/**
 * The realtime WebSocket route.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8). Registering the route no longer also registers the hub's
 * cleanup: that was a side effect hidden inside route registration, and it now
 * belongs to the lifecycle the composition root owns (AC-11).
 */

import type { AuthService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import { sameOrigin, sessionToken } from '../http';
import { REALTIME_SESSION_CLOSE_CODE, type RealtimeHub, type RealtimeSocket } from './websocket';

export function registerWebSocketRoute(
  application: AnyElysia,
  prefix: string,
  authService: AuthService,
  realtimeHub: RealtimeHub,
): AnyElysia {
  const websocketOptions = {
    beforeHandle(context: { request: Request }): Response | undefined {
      const { request } = context;
      if (!sameOrigin(request)) return new Response('WebSocket origin rejected.', { status: 403 });
      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) return new Response(validation.code, { status: 401 });
      return undefined;
    },
    open(ws: { data: { request: Request } } & RealtimeSocket) {
      const token = sessionToken(ws.data.request);
      const validation = authService.validateSession(token);
      if (!validation.authenticated) {
        ws.close(REALTIME_SESSION_CLOSE_CODE, validation.code);
        return;
      }

      realtimeHub.open(
        ws,
        {
          sessionId: validation.value.session.id,
          userId: validation.value.user.id,
        },
        () => {
          const current = authService.validateSession(token);
          return current.authenticated ? { valid: true } : { valid: false, code: current.code };
        },
      );
    },
    message(
      ws: { data: { request: Request } } & RealtimeSocket,
      message: string | ArrayBuffer | ArrayBufferView | object,
    ) {
      realtimeHub.receive(ws, message);
    },
    pong(ws: { data: { request: Request } } & RealtimeSocket) {
      realtimeHub.receivePong(ws);
    },
    close(ws: { data: { request: Request } } & RealtimeSocket) {
      realtimeHub.close(ws);
    },
  } as unknown as Parameters<AnyElysia['ws']>[1];

  const websocketApplication = application as unknown as {
    ws(path: string, options: unknown): AnyElysia;
  };
  return websocketApplication.ws(`${prefix}/ws`, websocketOptions);
}
