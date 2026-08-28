import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';
import { parse } from 'yaml';

type SchemaDocument = {
  components: { schemas: Record<string, Record<string, unknown>> };
};

async function protocol(): Promise<SchemaDocument> {
  return parse(
    await readFile(
      new URL(
        '../../packages/api-contract/openapi/v1/events/websocket-protocol.yaml',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as SchemaDocument;
}

describe('WebSocket protocol contract', () => {
  test('CT-0029-AC2 defines subscribe/unsubscribe commands and event/error envelopes', async () => {
    const document = await protocol();
    const schemas = document.components.schemas;
    expect(schemas['RealtimeClientCommand']).toMatchObject({ oneOf: expect.any(Array) });
    expect(schemas['RealtimeSubscribeCommand']).toMatchObject({
      required: ['type', 'channel'],
    });
    expect(schemas['RealtimeUnsubscribeCommand']).toMatchObject({
      required: ['type', 'channel'],
    });
    expect(schemas['RealtimeErrorPayload']).toMatchObject({
      required: ['code', 'message'],
    });
    expect(schemas['WebSocketMessage']).toMatchObject({
      required: ['type', 'channel', 'payload', 'correlationId'],
    });
    expect(schemas['WebSocketMessage']?.['properties']).toMatchObject({
      type: { enum: ['event', 'error'] },
    });
  });
});
