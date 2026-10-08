// Regenerates the favicon, logo and app icons in apps/web/public from the logo mark in
// packages/types/src/brand.ts. Run after changing the mark:
//   npm run build -w @isgratis/types && node scripts/generate-brand-assets.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { LOGO_MARK_SVG } from '../packages/types/dist/index.js';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const sharp = require('sharp');
const out = new URL('../apps/web/public/', import.meta.url);
const sized = (size) => LOGO_MARK_SVG.replace('width="64" height="64"', `width="${size}" height="${size}"`);
const NIGHT = '#0b1d3a';

writeFileSync(new URL('favicon.svg', out), LOGO_MARK_SVG);

// Mark plus wordmark. The text uses a common sans-serif; the site itself renders the wordmark in HTML.
const inner = LOGO_MARK_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
writeFileSync(
  new URL('logo.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 64" width="300" height="64">
  <g>${inner}</g>
  <text x="76" y="45" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="38" font-weight="800" fill="currentColor">is.<tspan fill="#2f9e44">gratis</tspan></text>
</svg>
`,
);

async function icon(size, file, background) {
  const padding = Math.round(size * 0.14);
  const mark = await sharp(Buffer.from(sized(size - 2 * padding))).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, left: padding, top: padding }])
    .png()
    .toFile(new URL(file, out).pathname);
}

await icon(180, 'apple-touch-icon.png', NIGHT);
await icon(192, 'icon-192.png', NIGHT);
await icon(512, 'icon-512.png', NIGHT);
await sharp(Buffer.from(sized(48))).png().toFile(new URL('favicon-48.png', out).pathname);

writeFileSync(
  new URL('manifest.webmanifest', out),
  `${JSON.stringify(
    {
      name: 'is.gratis',
      short_name: 'is.gratis',
      description: 'The encyclopedia that answers one question: is it free?',
      start_url: '/',
      display: 'standalone',
      background_color: NIGHT,
      theme_color: NIGHT,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  )}\n`,
);
console.log('brand assets written');
