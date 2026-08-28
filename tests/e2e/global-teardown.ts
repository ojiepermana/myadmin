import { rm } from 'node:fs/promises';

export default async function globalTeardown(): Promise<void> {
  const directory = process.env['MYADMIN_E2E_DATA_DIR'];
  if (directory && process.env['MYADMIN_E2E_DATA_DIR_CREATED'] === '1') {
    await rm(directory, { recursive: true, force: true });
  }
}
