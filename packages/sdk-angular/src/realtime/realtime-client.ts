import { InjectionToken, Injectable, inject } from '@angular/core';
import type { RealtimeChannel, RealtimePayloadForChannel } from '@myadmin/api-contract';
import { BehaviorSubject, type Observable } from 'rxjs';
import { MYADMIN_SDK_CONFIG, type ResolvedMyadminSdkConfig } from '../providers/config';

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected';
export type RealtimeUnsubscribe = () => void;

export interface RealtimeSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSocketFactory = (url: string) => RealtimeSocketLike;

export const MYADMIN_REALTIME_SOCKET_FACTORY = new InjectionToken<RealtimeSocketFactory>(
  'MYADMIN_REALTIME_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url: string) => new WebSocket(url) as unknown as RealtimeSocketLike,
  },
);

export const MYADMIN_REALTIME_CLIENT = new InjectionToken<RealtimeClient>(
  'MYADMIN_REALTIME_CLIENT',
);

export interface RealtimeClient {
  readonly connectionState: Observable<RealtimeConnectionState>;
  connect(): void;
  disconnect(): void;
  subscribe<TChannel extends string>(
    channel: TChannel,
    handler: (
      payload: TChannel extends RealtimeChannel ? RealtimePayloadForChannel<TChannel> : unknown,
    ) => void,
  ): RealtimeUnsubscribe;
}

type MessageHandler = (payload: unknown) => void;

const CONNECTING = 0;
const OPEN = 1;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
const MAX_RECONNECT_DELAY_MS = 30_000;

function websocketUrl(baseUrl: string): string {
  const path = `${baseUrl.replace(/\/+$/, '') || ''}/ws`;
  const location = globalThis.location;
  if (!location) return path;
  const url = new URL(path, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Browser WebSocket client with one multiplexed connection and automatic recovery. */
@Injectable({ providedIn: 'root' })
export class RealtimeClientService implements RealtimeClient {
  private readonly config = inject<ResolvedMyadminSdkConfig>(MYADMIN_SDK_CONFIG);
  private readonly socketFactory = inject(MYADMIN_REALTIME_SOCKET_FACTORY);
  private readonly state = new BehaviorSubject<RealtimeConnectionState>('disconnected');
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private socket: RealtimeSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private manuallyDisconnected = true;

  public readonly connectionState = this.state.asObservable();

  public connect(): void {
    this.manuallyDisconnected = false;
    if (this.socket?.readyState === CONNECTING || this.socket?.readyState === OPEN) return;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.openSocket();
  }

  public disconnect(): void {
    this.manuallyDisconnected = true;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === CONNECTING || socket.readyState === OPEN) {
        socket.close(1000, 'CLIENT_DISCONNECT');
      }
    }
    this.setState('disconnected');
  }

  public subscribe<TChannel extends string>(
    channel: TChannel,
    handler: (
      payload: TChannel extends RealtimeChannel ? RealtimePayloadForChannel<TChannel> : unknown,
    ) => void,
  ): RealtimeUnsubscribe {
    const handlers = this.handlers.get(channel) ?? new Set<MessageHandler>();
    const callback = handler as MessageHandler;
    handlers.add(callback);
    this.handlers.set(channel, handlers);
    if (handlers.size === 1 && this.socket?.readyState === OPEN) {
      this.send({ type: 'subscribe', channel });
    }

    return () => {
      const current = this.handlers.get(channel);
      if (!current) return;
      current.delete(callback);
      if (current.size > 0) return;
      this.handlers.delete(channel);
      if (this.socket?.readyState === OPEN) {
        this.send({ type: 'unsubscribe', channel });
      }
    };
  }

  private openSocket(): void {
    if (this.manuallyDisconnected) return;
    this.setState('connecting');
    let socket: RealtimeSocketLike;
    try {
      socket = this.socketFactory(websocketUrl(this.config.baseUrl));
    } catch {
      this.handleSocketFailure();
      return;
    }

    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.setState('connected');
      for (const channel of this.handlers.keys()) {
        this.send({ type: 'subscribe', channel });
      }
    };
    socket.onmessage = (message) => {
      if (this.socket === socket) this.handleMessage(message.data);
    };
    socket.onerror = () => {
      if (this.socket === socket && socket.readyState !== OPEN) this.handleSocketFailure();
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setState('disconnected');
      if (event.code === 4001) {
        this.manuallyDisconnected = true;
        return;
      }
      if (!this.manuallyDisconnected) this.scheduleReconnect();
    };
  }

  private handleMessage(value: unknown): void {
    let message: unknown = value;
    if (typeof value === 'string') {
      try {
        message = JSON.parse(value) as unknown;
      } catch {
        return;
      }
    }
    if (!isRecord(message) || message['type'] !== 'event') return;
    const channel = message['channel'];
    if (typeof channel !== 'string') return;
    const handlers = this.handlers.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(message['payload']);
      } catch {
        // One feature handler must not prevent other subscribers from receiving events.
      }
    }
  }

  private send(message: {
    readonly type: 'subscribe' | 'unsubscribe';
    readonly channel: string;
  }): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.handleSocketFailure();
    }
  }

  private handleSocketFailure(): void {
    const socket = this.socket;
    if (!socket) {
      this.setState('disconnected');
      if (!this.manuallyDisconnected) this.scheduleReconnect();
      return;
    }
    this.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === CONNECTING || socket.readyState === OPEN) {
      socket.close();
    }
    this.setState('disconnected');
    if (!this.manuallyDisconnected) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined || this.manuallyDisconnected) return;
    const index = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
    const delay =
      this.reconnectAttempt < RECONNECT_DELAYS_MS.length
        ? (RECONNECT_DELAYS_MS[index] ?? MAX_RECONNECT_DELAY_MS)
        : MAX_RECONNECT_DELAY_MS;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }

  private setState(state: RealtimeConnectionState): void {
    if (this.state.value !== state) this.state.next(state);
  }
}
