/**
 * Social sharing cards (Open Graph, X/Twitter): 1200 × 630 PNG images drawn with satori, which
 * turns text into vector paths, so the server needs no fonts installed. sharp rasterises them.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';
import {
  FREE_TYPE_LABELS,
  FREE_TYPE_LEVEL,
  LOGO_MARK_SVG,
  SCALE_MAX,
  SCALE_NAME,
  SLOGAN,
  VERDICT_LABELS,
  questionFor,
  type Language,
  type Page,
  type Verdict,
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
const LOGO = `data:image/svg+xml;base64,${Buffer.from(LOGO_MARK_SVG).toString('base64')}`;
const VERDICT_COLORS: Record<Verdict, string> = { yes: '#2f9e44', usually: '#0ca678', depends: '#e8590c', no: '#e03131' };
const LEVEL_COLORS = ['#e03131', '#f76707', '#fab005', '#82c91e', '#40c057', '#12b886'];
// Fixed positions, so every card has the same calm starry sky.
const STARS: Array<[number, number, number]> = [
  [80, 520, 3], [210, 90, 2], [330, 560, 2], [520, 40, 3], [640, 590, 2], [760, 70, 2],
  [880, 545, 3], [1010, 120, 2], [1120, 470, 3], [1150, 60, 2], [430, 610, 2], [980, 600, 2],
];

function truncate(text: string, max: number): string {
  const plain = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

const PAD_X = 64;
const PAD_Y = 56;
const INNER_WIDTH = WIDTH - 2 * PAD_X;

function frame(...children: Node[]): Node {
  return h(
    'div',
    {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      backgroundImage: 'linear-gradient(135deg, #0b1d3a 0%, #102a43 55%, #0b3b3c 100%)',
      color: '#ffffff',
      fontFamily: 'Inter',
      position: 'relative',
    },
    ...STARS.map(([x, y, size]) =>
      h('div', { position: 'absolute', left: x, top: y, width: size, height: size, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.55)' }),
    ),
    // Content lives in a box of fixed size so text wraps instead of running off the card.
    h(
      'div',
      {
        position: 'absolute',
        left: PAD_X,
        top: PAD_Y,
        width: INNER_WIDTH,
        height: HEIGHT - 2 * PAD_Y,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      },
      ...children,
    ),
  );
}

function brand(lang: Language, withSlogan: boolean): Node {
  return h(
    'div',
    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: INNER_WIDTH },
    h(
      'div',
      { display: 'flex', alignItems: 'center' },
      { type: 'img', props: { src: LOGO, width: 64, height: 64, style: { marginRight: 16 } } },
      h('div', { display: 'flex', fontSize: 40, fontWeight: 800 }, h('span', {}, 'is.'), h('span', { color: '#69db7c' }, 'gratis')),
    ),
    withSlogan
      ? h('div', { display: 'flex', width: 640, fontSize: 21, lineHeight: 1.3, color: '#a5b4c8', justifyContent: 'flex-end', textAlign: 'right' }, SLOGAN[lang])
      : h('div', {}, ''),
  );
}

async function render(node: Node): Promise<Buffer> {
  const svg = await satori(node as never, { width: WIDTH, height: HEIGHT, fonts: loadFonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function renderPageCard(page: Page): Promise<Buffer> {
  const lang = page.lang;
  const question = questionFor(lang, page.title);
  const scale = page.content.scale;
  const level = scale ? FREE_TYPE_LEVEL[scale.type] : null;
  return render(
    frame(
      brand(lang, true),
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        h('div', { display: 'flex', width: INNER_WIDTH, fontSize: question.length > 40 ? 60 : 76, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 }, truncate(question, 90)),
        h('div', { display: 'flex', width: INNER_WIDTH, fontSize: 28, color: '#c5d1de', marginTop: 18, lineHeight: 1.35 }, truncate(page.content.summary, 140)),
      ),
      h(
        'div',
        { display: 'flex', alignItems: 'center', width: INNER_WIDTH },
        h(
          'div',
          {
            display: 'flex',
            backgroundColor: VERDICT_COLORS[page.content.verdict],
            color: '#ffffff',
            fontSize: 34,
            fontWeight: 800,
            padding: '12px 28px',
            borderRadius: 14,
            textTransform: 'uppercase',
          },
          VERDICT_LABELS[lang][page.content.verdict],
        ),
        level === null
          ? h('div', {}, '')
          : h(
              'div',
              { display: 'flex', flexDirection: 'column', marginLeft: 40 },
              h('div', { display: 'flex', fontSize: 22, color: '#a5b4c8' }, `${SCALE_NAME[lang]} · ${FREE_TYPE_LABELS[lang][scale!.type]}`),
              h(
                'div',
                { display: 'flex', marginTop: 10, alignItems: 'center' },
                ...Array.from({ length: SCALE_MAX }, (_, i) =>
                  h('div', {
                    width: 56,
                    height: 12,
                    borderRadius: 6,
                    marginRight: 6,
                    backgroundColor: i < level ? LEVEL_COLORS[level]! : 'rgba(255,255,255,0.18)',
                  }),
                ),
                h('div', { display: 'flex', fontSize: 26, fontWeight: 800, marginLeft: 10 }, `${level}/${SCALE_MAX}`),
              ),
            ),
      ),
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
      brand(lang, false),
      h(
        'div',
        { display: 'flex', flexDirection: 'column' },
        h('div', { display: 'flex', width: 1000, fontSize: 70, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }, SLOGAN[lang]),
        h('div', { display: 'flex', width: INNER_WIDTH, fontSize: 30, color: '#c5d1de', marginTop: 24 }, SITE_TAGLINE[lang]),
      ),
      h('div', { display: 'flex', fontSize: 26, color: '#69db7c', fontWeight: 700 }, 'is.gratis'),
    ),
  );
}
