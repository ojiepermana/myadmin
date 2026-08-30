import { isAbsolute, relative, resolve } from 'node:path';

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function isSafeAssetPath(root: string, pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    const requested = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
    const fromRoot = relative(resolve(root), requested);
    return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
  } catch {
    return false;
  }
}

export function shouldUseSpaFallback(pathname: string, assetExists: boolean): boolean {
  return assetExists && !isApiPath(pathname);
}
