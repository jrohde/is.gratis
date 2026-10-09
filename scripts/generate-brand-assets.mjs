// Regenerates the favicon, wordmark and app icons in apps/web/public from the asterisk in
// packages/types/src/brand.ts. Run after changing the brand:
//   npm run build -w @isgratis/types && node scripts/generate-brand-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { asteriskSvg, BRAND_GREEN, BRAND_INK, iconSvg } from '../packages/types/dist/index.js';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const sharp = require('sharp');
const satori = require('satori').default;
const out = new URL('../apps/web/public/', import.meta.url);
const png = (svg, file) => sharp(Buffer.from(svg)).png().toFile(new URL(file, out).pathname);

// Favicon and app icons: a white asterisk on a green tile.
writeFileSync(new URL('favicon.svg', out), `${iconSvg()}\n`);
await png(iconSvg(48), 'favicon-48.png');
await png(iconSvg(180, false), 'apple-touch-icon.png');
await png(iconSvg(192, false), 'icon-192.png');
await png(iconSvg(512, false), 'icon-512.png');

// The wordmark "is.gratis*" with its letters as paths, so it looks the same without the font.
const font = readFileSync(require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff'));
const size = 96;
const asterisk = `data:image/svg+xml;base64,${Buffer.from(asteriskSvg()).toString('base64')}`;
const wordmark = await satori(
  {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-start', fontFamily: 'Inter', fontSize: size, fontWeight: 800, letterSpacing: -size * 0.03, lineHeight: 1, color: BRAND_INK },
      children: [
        { type: 'span', props: { children: 'is.gratis' } },
        { type: 'img', props: { src: asterisk, width: size * 0.44, height: size * 0.44, style: { marginLeft: size * 0.02, marginTop: size * 0.03 } } },
      ],
    },
  },
  { width: 440, height: 120, fonts: [{ name: 'Inter', data: font, weight: 800, style: 'normal' }] },
);
writeFileSync(new URL('logo.svg', out), `${wordmark}\n`);

writeFileSync(
  new URL('manifest.webmanifest', out),
  `${JSON.stringify(
    {
      name: 'is.gratis',
      short_name: 'is.gratis',
      description: 'The encyclopedia that answers one question: is it free?',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: BRAND_GREEN,
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
