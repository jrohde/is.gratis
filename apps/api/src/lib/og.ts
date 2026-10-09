/**
 * Social sharing cards (Open Graph, X/Twitter): 1200 × 630 PNG images drawn with satori, which
 * turns text into vector paths, so the server needs no fonts installed. sharp rasterises them.
 *
 * A page card states the claim, "Water is gratis*", with the answer as its footnote: "*deels".
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';
import {
  asteriskSvg,
  BRAND_GREEN,
  BRAND_INK,
  claimFor,
  footnoteFor,
  regionName,
  SLOGAN,
  type Language,
  type Page,
  type Region,
} from '@isgratis/types';

const require = createRequire(import.meta.url);
type Font = { name: string; data: Buffer; weight: 400 | 700 | 800; style: 'normal' };
let fonts: Font[] | null = null;

function loadFonts(): Font[] {
  if (!fonts) {
    fonts = ([400, 700, 800] as const).map((weight) => ({
      name: 'Inter',
      weight,
      style: 'normal' as const,
      data: readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
    }));
  }
  return fonts;
}

// satori takes React-like element objects; this keeps the API free of JSX.
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: Array<Node | string>): Node => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

const WIDTH = 1200;
const HEIGHT = 630;
const MUTED = '#5c636a';
const ASTERISK = `data:image/svg+xml;base64,${Buffer.from(asteriskSvg()).toString('base64')}`;

function truncate(text: string, max: number): string {
  const plain = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** An asterisk set like a superscript after text of the given size. */
function asterisk(size: number, after = true): Node {
  const side = Math.round(size * (after ? 0.44 : 0.62));
  return {
    type: 'img',
    props: {
      src: ASTERISK,
      width: side,
      height: side,
      style: after ? { marginLeft: size * 0.02, marginTop: size * 0.03 } : { marginRight: size * 0.08, marginTop: size * 0.04 },
    },
  };
}

/** "Water is gratis*" */
function claim(text: string, size: number): Node {
  return h(
    'div',
    { display: 'flex', alignItems: 'flex-start', fontSize: size, fontWeight: 800, letterSpacing: -size * 0.025, lineHeight: 1.05, color: BRAND_INK },
    h('span', {}, text),
    asterisk(size),
  );
}

/** "*deels" */
function footnote(text: string, size: number, color: string, weight = 800): Node {
  return h('div', { display: 'flex', alignItems: 'flex-start', fontSize: size, fontWeight: weight, color }, asterisk(size, false), h('span', {}, text));
}

function frame(...children: Node[]): Node {
  return h(
    'div',
    {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#ffffff',
      color: BRAND_INK,
      fontFamily: 'Inter',
      padding: '64px 72px 70px',
      boxSizing: 'border-box',
      position: 'relative',
    },
    ...children,
    h('div', { position: 'absolute', left: 0, bottom: 0, width: WIDTH, height: 12, backgroundColor: BRAND_GREEN }),
  );
}

function bottomLine(lang: Language): Node {
  return h(
    'div',
    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: WIDTH - 144 },
    claim('is.gratis', 34),
    footnote(SLOGAN[lang], 26, MUTED, 700),
  );
}

async function render(node: Node): Promise<Buffer> {
  const svg = await satori(node as never, { width: WIDTH, height: HEIGHT, fonts: loadFonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function renderPageCard(page: Page): Promise<Buffer> {
  const lang = page.lang;
  const text = claimFor(lang, page.title, page.content.plural);
  const note = footnoteFor(lang, page.content);
  return render(
    frame(
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        claim(truncate(text, 60), text.length > 30 ? 68 : text.length > 18 ? 84 : 104),
        h(
          'div',
          { display: 'flex', alignItems: 'flex-end', marginTop: 18 },
          footnote(note.text, 54, note.color),
          note.region ? h('div', { display: 'flex', fontSize: 26, color: MUTED, marginLeft: 18, marginBottom: 8 }, regionName(note.region as Region, lang)) : h('div', {}, ''),
        ),
        h('div', { display: 'flex', width: 1040, fontSize: 26, lineHeight: 1.4, color: MUTED, marginTop: 26 }, truncate(page.content.summary, 150)),
      ),
      bottomLine(lang),
    ),
  );
}

const SITE_TAGLINE: Record<Language, string> = {
  nl: 'De encyclopedie die één vraag beantwoordt: is het gratis?',
  en: 'The encyclopedia that answers one question: is it free?',
  de: 'Die Enzyklopädie, die eine Frage beantwortet: Ist es kostenlos?',
  es: 'La enciclopedia que responde una sola pregunta: ¿es gratis?',
};

export async function renderSiteCard(lang: Language): Promise<Buffer> {
  return render(
    frame(
      h('div', {}, ''),
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        claim('is.gratis', 140),
        h('div', { display: 'flex', marginTop: 34 }, footnote(SLOGAN[lang], 56, MUTED)),
        h('div', { display: 'flex', fontSize: 28, color: MUTED, marginTop: 34 }, SITE_TAGLINE[lang]),
      ),
      h('div', {}, ''),
    ),
  );
}

const EMBED_WIDTH = 440;
const EMBED_HEIGHT = 124;

/**
 * A small answer card other sites can embed: "Water is gratis*" with its footnote. An SVG with
 * the text as paths, so it looks the same everywhere without fonts.
 */
export async function renderEmbedCard(page: Page): Promise<string> {
  const lang = page.lang;
  const text = claimFor(lang, page.title, page.content.plural);
  const note = footnoteFor(lang, page.content);
  const size = text.length > 26 ? 22 : 26;
  const node = h(
    'div',
    {
      width: EMBED_WIDTH,
      height: EMBED_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#ffffff',
      border: '1px solid #dee2e6',
      borderRadius: 14,
      padding: '16px 20px',
      boxSizing: 'border-box',
      fontFamily: 'Inter',
      color: BRAND_INK,
    },
    h(
      'div',
      { display: 'flex', flexDirection: 'column' },
      claim(truncate(text, 40), size),
      h(
        'div',
        { display: 'flex', alignItems: 'flex-end', marginTop: 6 },
        footnote(note.text, 20, note.color),
        note.region
          ? h('div', { display: 'flex', fontSize: 13, color: MUTED, marginLeft: 8, marginBottom: 3 }, regionName(note.region as Region, lang))
          : h('div', {}, ''),
      ),
    ),
    h('div', { display: 'flex', justifyContent: 'flex-end', width: EMBED_WIDTH - 42 }, claim('is.gratis', 15)),
  );
  return satori(node as never, { width: EMBED_WIDTH, height: EMBED_HEIGHT, fonts: loadFonts() });
}
