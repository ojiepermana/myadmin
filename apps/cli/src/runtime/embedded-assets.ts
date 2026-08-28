import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type EmbeddedAsset = string | Uint8Array | Blob;
export type EmbeddedAssets = Readonly<Record<string, EmbeddedAsset>>;

export type AssetSource =
  { kind: 'directory'; root: string } | { kind: 'embedded'; assets: EmbeddedAssets };

export interface AssetSourceOptions {
  cwd?: string;
  embeddedAssets?: EmbeddedAssets;
  development?: boolean;
}

declare global {
  var __MYADMIN_EMBEDDED_ASSETS__: EmbeddedAssets | undefined;
}

function hasIndexAsset(assets: EmbeddedAssets): boolean {
  return Boolean(assets['/index.html'] ?? assets['index.html']);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function resolveAssetSource(options: AssetSourceOptions = {}): Promise<AssetSource> {
  const embeddedAssets = options.embeddedAssets ?? globalThis.__MYADMIN_EMBEDDED_ASSETS__;
  if (embeddedAssets && hasIndexAsset(embeddedAssets)) {
    return { kind: 'embedded', assets: embeddedAssets };
  }

  const cwd = options.cwd ?? process.cwd();
  const candidates = [join(cwd, 'dist', 'web', 'browser'), join(cwd, 'dist', 'web')];
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return { kind: 'directory', root: candidate };
    }
  }

  return { kind: 'directory', root: candidates[0] ?? join(cwd, 'dist', 'web') };
}

export async function assetExists(source: AssetSource): Promise<boolean> {
  if (source.kind === 'embedded') {
    return hasIndexAsset(source.assets);
  }

  try {
    await access(join(source.root, 'index.html'));
    return true;
  } catch {
    return false;
  }
}
