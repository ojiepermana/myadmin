import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type {
  AssetSource,
  EmbeddedAssetMetadata,
  EmbeddedAssets,
} from '../runtime/embedded-assets';
import { isApiPath, isSafeAssetPath, shouldUseSpaFallback } from './spa-fallback';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export interface StaticAssetOptions {
  source: AssetSource;
}

function apiNotFoundResponse(): Response {
  return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}

function assetKey(pathname: string): string {
  return pathname.replace(/^\/+/, '');
}

function embeddedAsset(assets: EmbeddedAssets, pathname: string): EmbeddedAssetValue | undefined {
  return assets[pathname] ?? assets[assetKey(pathname)] ?? assets[`/${assetKey(pathname)}`];
}

type EmbeddedAssetValue = string | Uint8Array | Blob;

function embeddedResponse(
  value: EmbeddedAssetValue,
  pathname: string,
  metadata?: Readonly<Record<string, EmbeddedAssetMetadata>>,
): Response {
  const assetMetadata = metadata?.[pathname] ?? metadata?.[assetKey(pathname)];
  return new Response(value as unknown as BodyInit, {
    headers: {
      'content-type':
        assetMetadata?.mimeType ??
        contentTypes[extname(pathname).toLowerCase()] ??
        'application/octet-stream',
      ...(assetMetadata
        ? {
            etag: `"${assetMetadata.hash}"`,
            'cache-control': pathname.endsWith('/index.html')
              ? 'no-cache'
              : 'public, max-age=31536000, immutable',
          }
        : {}),
    },
  });
}

async function directoryAsset(root: string, pathname: string): Promise<Response | undefined> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return new Response('Invalid asset path', { status: 400 });
  }

  if (!isSafeAssetPath(root, decodedPath)) {
    return new Response('Invalid asset path', { status: 400 });
  }

  const candidate = join(root, assetKey(decodedPath));
  try {
    if ((await stat(candidate)).isFile()) {
      return new Response(await readFile(candidate), {
        headers: {
          'content-type':
            contentTypes[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
        },
      });
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function serveStaticAsset(
  request: Request,
  options: StaticAssetOptions,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (isApiPath(pathname)) {
    return apiNotFoundResponse();
  }

  if (options.source.kind === 'embedded') {
    const direct = embeddedAsset(options.source.assets, pathname);
    if (direct !== undefined) {
      return embeddedResponse(direct, pathname, options.source.metadata);
    }
    const fallback = embeddedAsset(options.source.assets, '/index.html');
    return shouldUseSpaFallback(pathname, fallback !== undefined)
      ? embeddedResponse(fallback as EmbeddedAssetValue, '/index.html', options.source.metadata)
      : new Response('Not found', { status: 404 });
  }

  const direct = await directoryAsset(options.source.root, pathname);
  if (direct) {
    return direct;
  }

  const fallback = await directoryAsset(options.source.root, '/index.html');
  return shouldUseSpaFallback(pathname, fallback !== undefined)
    ? (fallback ?? new Response('Not found', { status: 404 }))
    : new Response('Not found', { status: 404 });
}
