/** The API and WebSocket contract boundary. */
export const moduleName = '@myadmin/api-contract' as const;

export * from './generated/openapi';
export * from './websocket';
