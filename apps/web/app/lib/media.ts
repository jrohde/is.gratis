/** URL of a stored image. Widths match the sizes the API is willing to render. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;

export function mediaUrl(assetId: string, width?: (typeof IMAGE_WIDTHS)[number]): string {
  return `/api/media/${assetId}.webp${width ? `?w=${width}` : ''}`;
}

export function mediaSrcSet(assetId: string, naturalWidth: number): string {
  return IMAGE_WIDTHS.filter((width) => width <= naturalWidth || width === IMAGE_WIDTHS[0])
    .map((width) => `${mediaUrl(assetId, width)} ${Math.min(width, naturalWidth)}w`)
    .join(', ');
}
