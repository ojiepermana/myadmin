/**
 * Asset shapes shared by the embedded asset loader and its generated manifest.
 *
 * They live in their own module so the generated file and the loader do not
 * import each other in a cycle (spec 0056 AC-10).
 */
export type EmbeddedAsset = string | Uint8Array | Blob;

export type EmbeddedAssets = Readonly<Record<string, EmbeddedAsset>>;

export interface EmbeddedAssetMetadata {
  readonly hash: string;
  readonly mimeType: string;
}
