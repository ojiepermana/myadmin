import type { Observable } from 'rxjs';

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected';
export type RealtimeUnsubscribe = () => void;

/** Public realtime seam reserved for the WebSocket implementation in spec 0029. */
export interface RealtimeClient {
  readonly connectionState: Observable<RealtimeConnectionState>;
  connect(): void;
  disconnect(): void;
  subscribe(channel: string, handler: (payload: unknown) => void): RealtimeUnsubscribe;
}
