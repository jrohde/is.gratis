import { eq } from 'drizzle-orm';
import type { Asset } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { assets, type AssetRow } from '../db/schema.js';
import { sha256 } from '../lib/hash.js';
import type { NormalizedImage } from '../lib/images.js';

export function toAsset(row: Pick<AssetRow, 'id' | 'width' | 'height' | 'source'>): Asset {
  return { id: row.id, width: row.width, height: row.height, source: row.source };
}

/** Stores an image once: identical files share one row. */
export async function storeAsset(
  db: Database,
  image: NormalizedImage,
  meta: { source: 'upload' | 'ai'; prompt?: string; createdBy: string | null },
): Promise<Asset> {
  const hash = sha256(image.bytes.toString('base64'));
  await db
    .insert(assets)
    .values({
      sha256: hash,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      source: meta.source,
      prompt: meta.prompt ?? null,
      createdBy: meta.createdBy,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: assets.id, width: assets.width, height: assets.height, source: assets.source })
    .from(assets)
    .where(eq(assets.sha256, hash))
    .limit(1);
  return toAsset(row!);
}

export async function getAssetMeta(db: Database, id: string): Promise<Asset | null> {
  const [row] = await db
    .select({ id: assets.id, width: assets.width, height: assets.height, source: assets.source })
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  return row ? toAsset(row) : null;
}

export async function getAssetBytes(db: Database, id: string): Promise<Buffer | null> {
  const [row] = await db.select({ bytes: assets.bytes }).from(assets).where(eq(assets.id, id)).limit(1);
  return row?.bytes ?? null;
}
