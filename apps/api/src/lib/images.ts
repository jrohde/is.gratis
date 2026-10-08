/**
 * Image handling with sharp: every upload or generated image is checked, rotated upright,
 * stripped of metadata (no GPS coordinates from phones), scaled down and stored as WebP.
 */
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 1600;
/** Widths served for responsive images; anything else is refused so the cache stays small. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

export interface NormalizedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw badRequest('invalid_image', 'This file is not an image we can read');
  }
  if (!format || !['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(format)) {
    throw badRequest('invalid_image', 'Use a PNG, JPEG, WebP, GIF or AVIF image');
  }
  const { data, info } = await sharp(input, { animated: false, limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

export async function resizeImage(bytes: Buffer, width: number): Promise<Buffer> {
  return sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}
