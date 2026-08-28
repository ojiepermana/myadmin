import type { EmbeddedAssetMetadata, EmbeddedAssets } from './embedded-assets';

/** Empty development manifest. Release builds replace this file before compilation. */
export const embeddedAssetManifest = [] as const;
export const embeddedAssets: EmbeddedAssets = {};
export const embeddedAssetMetadata: Readonly<Record<string, EmbeddedAssetMetadata>> = {};
