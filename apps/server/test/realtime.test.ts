import { afterEach, describe, expect, test } from 'bun:test';
import {
  RealtimeHub,
  REALTIME_BACKPRESSURE_CLOSE_CODE,
  REALTIME_HEARTBEAT_CLOSE_CODE,
  realtimeJobEvent,
  type RealtimeSocket,
} from '../src/realtime/websocket';

class FakeSocket implements RealtimeSocket {
  public readonly messages: string[] = [];
  public readonly pings: string[] = [];
  public closed: { code?: number; reason?: string } | undefined;
  public sendResult: unknown = undefined;

  public send(message: string): unknown {
    this.messages.push(message);
    return this.sendResult;
  }

  public close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  public ping(message?: string): void {
    this.pings.push(message ?? '');
  }
}

const session = { sessionId: 'session-1', userId: 'user-1' } as const;

describe('RealtimeHub', () => {
  const hubs: RealtimeHub[] = [];

  afterEach(() => {
    for (const hub of hubs.splice(0)) hub.dispose();
  });

  test('authorizes multiplexed channels and publishes redacted events', () => {
    const hub = new RealtimeHub({
      canSubscribeJob: (userId, jobId) => userId === 'user-1' && jobId === 'job-1',
      heartbeatIntervalMs: 30,
      sessionCheckIntervalMs: 1_000,
    });
    hubs.push(hub);
    const socket = new FakeSocket();
    expect(hub.open(socket, session, () => ({ valid: true }))).toBe(true);

    hub.receive(socket, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' }));
    expect(hub.subscriptionCount(socket)).toBe(1);
    hub.receive(socket, JSON.stringify({ type: 'subscribe', channel: 'jobs.other' }));
    hub.receive(socket, JSON.stringify({ type: 'unknown', channel: 'jobs.job-1' }));

    const errors = socket.messages
      .slice(0, 2)
      .map((message) => JSON.parse(message) as Record<string, unknown>);
    expect(errors.every((message) => message['type'] === 'error')).toBe(true);
    expect(errors[0]?.['payload']).toEqual({
      code: 'CHANNEL_FORBIDDEN',
      message: 'The channel is unavailable.',
    });
    expect(socket.closed).toBeUndefined();

    hub.publish({
      event: 'job.state',
      channel: 'jobs.job-1',
      userId: 'user-1',
      payload: { jobId: 'job-1', state: 'completed', password: 'synthetic-secret' },
    });
    const event = JSON.parse(socket.messages.at(-1) ?? '') as Record<string, unknown>;
    expect(event).toMatchObject({ type: 'event', event: 'job.state', channel: 'jobs.job-1' });
    expect(JSON.stringify(event)).not.toContain('synthetic-secret');
  });

  test('limits subscriptions and closes a stalled connection after two heartbeat intervals', () => {
    let now = 1_000;
    const hub = new RealtimeHub({
      canSubscribeJob: () => true,
      heartbeatIntervalMs: 30,
      sessionCheckIntervalMs: 1_000,
      maxSubscriptionsPerConnection: 1,
      now: () => now,
    });
    hubs.push(hub);
    const socket = new FakeSocket();
    hub.open(socket, session, () => ({ valid: true }));
    hub.receive(socket, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' }));
    hub.receive(socket, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-2' }));
    expect(hub.subscriptionCount(socket)).toBe(1);
    expect(socket.messages.some((message) => message.includes('SUBSCRIPTION_LIMIT'))).toBe(true);

    now = 1_030;
    hub.heartbeatTick(socket, now);
    expect(socket.pings).toHaveLength(1);
    now = 1_060;
    hub.heartbeatTick(socket, now);
    expect(socket.closed).toEqual({
      code: REALTIME_HEARTBEAT_CLOSE_CODE,
      reason: 'REALTIME_HEARTBEAT_TIMEOUT',
    });
  });

  test('closes a peer when the outbound socket reports backpressure', () => {
    const hub = new RealtimeHub({
      canSubscribeJob: () => true,
      sessionCheckIntervalMs: 1_000,
    });
    hubs.push(hub);
    const socket = new FakeSocket();
    socket.sendResult = false;
    hub.open(socket, session, () => ({ valid: true }));
    hub.receive(socket, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' }));
    hub.publish(
      realtimeJobEvent({
        type: 'state',
        job: {
          id: 'job-1',
          ownerUserId: 'user-1',
          state: 'running',
          progress: { current: 0 },
        },
      }),
    );
    expect(socket.closed).toEqual({
      code: REALTIME_BACKPRESSURE_CLOSE_CODE,
      reason: 'REALTIME_BACKPRESSURE',
    });
  });

  test('scopes connection and query events to the session owner', () => {
    const hub = new RealtimeHub({
      canSubscribeQuery: (userId, executionId) => userId === 'user-1' && executionId === 'query-1',
      sessionCheckIntervalMs: 1_000,
    });
    hubs.push(hub);
    const first = new FakeSocket();
    const second = new FakeSocket();
    hub.open(first, session, () => ({ valid: true }));
    hub.open(second, { ...session, sessionId: 'session-2', userId: 'user-2' }, () => ({
      valid: true,
    }));
    hub.receive(first, JSON.stringify({ type: 'subscribe', channel: 'connections.status' }));
    hub.receive(second, JSON.stringify({ type: 'subscribe', channel: 'connections.status' }));
    hub.receive(first, JSON.stringify({ type: 'subscribe', channel: 'query.query-1' }));
    hub.receive(first, JSON.stringify({ type: 'subscribe', channel: 'query.query-2' }));

    hub.publish({
      event: 'connection.status',
      channel: 'connections.status',
      userId: 'user-1',
      payload: { connectionId: 'connection-1', status: 'connected' },
    });
    hub.publish({
      event: 'query.execution',
      channel: 'query.query-1',
      userId: 'user-1',
      payload: { executionId: 'query-1', state: 'running' },
    });

    expect(first.messages.filter((message) => message.includes('"type":"event"'))).toHaveLength(2);
    expect(second.messages).toHaveLength(0);
    const forbidden = first.messages
      .map((message) => JSON.parse(message) as Record<string, unknown>)
      .find((message) => message['type'] === 'error');
    expect(forbidden).toMatchObject({
      payload: { code: 'CHANNEL_FORBIDDEN', message: 'The channel is unavailable.' },
    });
    expect(JSON.stringify(forbidden?.['payload'])).not.toContain('query-2');
  });

  test('limits a user to four concurrent WebSocket connections', () => {
    const hub = new RealtimeHub({ sessionCheckIntervalMs: 1_000 });
    hubs.push(hub);
    const sockets = Array.from({ length: 5 }, () => new FakeSocket());
    for (const socket of sockets.slice(0, 4)) {
      expect(hub.open(socket, session, () => ({ valid: true }))).toBe(true);
    }
    expect(hub.open(sockets[4]!, session, () => ({ valid: true }))).toBe(false);
    expect(sockets[4]?.closed).toEqual({
      code: 4008,
      reason: 'REALTIME_CONNECTION_LIMIT',
    });
  });
});
