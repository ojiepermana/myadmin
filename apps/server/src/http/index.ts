/**
 * Server HTTP kernel: the shared shell every route module builds responses
 * with. See `response.ts` for why it exists.
 */
export { apiError, jsonResponse } from './response';
