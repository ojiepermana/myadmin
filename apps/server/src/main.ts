import { startServer } from './app';

if (import.meta.main) {
  await startServer();
}
