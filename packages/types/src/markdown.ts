/**
 * The Markdown form of a page.
 *
 * One format serves two purposes, the way wikitext does on Wikipedia:
 * - pageToSource / parseSource: the whole page as one editable document, with the structured
 *   fields (verdict, scale, time price) in front matter, like an infobox.
 * - pageToLlmsText: the readable version served as llms.txt for language models and tools.
 *
 * Nothing at module level may use values from index.ts: the two modules import each other.
 */
import {
  FREE_TYPES,
  FREE_TYPE_LEVEL,
  LANGUAGES,
  REGIONS,
  SCALE_MAX,
  VERDICTS,
  VERDICT_LABELS,
  timePriceSeconds,
  type Fact,
  type FreeType,
  type Language,
  type PageContent,
  type Region,
  type RegionBlock,
  type Source,
  type Verdict,
} from './index.js';
import { FREE_TYPE_LABELS, SCALE_NAME, SECTION_KEYS, SECTION_LABELS, type SectionKey } from './labels.js';
import { renderWikiLinks } from './wikilinks.js';

const SOURCE_WORD: Record<Language, string> = { nl: 'bron', en: 'source', de: 'Quelle', es: 'fuente' };

const META_LABELS: Record<
  Language,
  { verdict: string; timePrice: string; draft: string; updated: string; version: string; url: string; translations: string; of: string; forUnit: string; atWage: string }
> = {
  nl: { verdict: 'Oordeel', timePrice: 'Tijdprijs', draft: 'Status: concept, geschreven door een taalmodel en nog niet nagekeken', updated: 'Bijgewerkt', version: 'versie', url: 'Pagina', translations: 'Andere talen', of: 'van', forUnit: 'werk voor', atWage: 'bij een uurloon van' },
  en: { verdict: 'Verdict', timePrice: 'Time price', draft: 'Status: draft, written by a language model and not reviewed yet', updated: 'Updated', version: 'version', url: 'Page', translations: 'Other languages', of: 'of', forUnit: 'of work for', atWage: 'at an hourly wage of' },
  de: { verdict: 'Urteil', timePrice: 'Zeitpreis', draft: 'Status: Entwurf, von einem Sprachmodell geschrieben und noch nicht geprüft', updated: 'Aktualisiert', version: 'Version', url: 'Seite', translations: 'Andere Sprachen', of: 'von', forUnit: 'Arbeit für', atWage: 'bei einem Stundenlohn von' },
  es: { verdict: 'Veredicto', timePrice: 'Precio en tiempo', draft: 'Estado: borrador, escrito por un modelo de lenguaje y aún sin revisar', updated: 'Actualizado', version: 'versión', url: 'Página', translations: 'Otros idiomas', of: 'de', forUnit: 'de trabajo por', atWage: 'con un salario por hora de' },
};

const QUESTION: Record<Language, (subject: string) => string> = {
  nl: (s) => `Is ${s} gratis?`,
  en: (s) => `Is ${s} free?`,
  de: (s) => `Ist ${s} kostenlos?`,
  es: (s) => `¿Es gratis ${s}?`,
};

export function questionFor(lang: Language, subject: string): string {
  return QUESTION[lang](subject);
}

const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', es: 'es-ES' };

const WIDE_AREAS: Record<'EU' | 'WORLD', Record<Language, string>> = {
  EU: { nl: 'Europese Unie', en: 'European Union', de: 'Europäische Union', es: 'Unión Europea' },
  WORLD: { nl: 'Wereldwijd', en: 'Worldwide', de: 'Weltweit', es: 'Todo el mundo' },
};

/** Country name in the reader's language, from the runtime's locale data. */
export function regionName(region: Region, lang: Language): string {
  if (region === 'EU' || region === 'WORLD') return WIDE_AREAS[region][lang];
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}

const UNITS: Record<Language, { s: [string, string]; min: [string, string]; h: [string, string] }> = {
  nl: { s: ['seconde', 'seconden'], min: ['minuut', 'minuten'], h: ['uur', 'uur'] },
  en: { s: ['second', 'seconds'], min: ['minute', 'minutes'], h: ['hour', 'hours'] },
  de: { s: ['Sekunde', 'Sekunden'], min: ['Minute', 'Minuten'], h: ['Stunde', 'Stunden'] },
  es: { s: ['segundo', 'segundos'], min: ['minuto', 'minutos'], h: ['hora', 'horas'] },
};

/** "0,27 seconden", "4,5 minuten", "2 uur". Two significant digits are plenty for a time price. */
export function formatDuration(seconds: number, lang: Language): string {
  const number = (value: number) =>
    new Intl.NumberFormat(LOCALES[lang], { maximumSignificantDigits: 2 }).format(value);
  const units = UNITS[lang];
  const pick = (value: number, [one, many]: [string, string]) => `${number(value)} ${value === 1 ? one : many}`;
  if (seconds < 60) return pick(seconds, units.s);
  if (seconds < 3600) return pick(seconds / 60, units.min);
  return pick(seconds / 3600, units.h);
}

export function formatMoney(amount: number, currency: string, lang: Language): string {
  try {
    return new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency, maximumSignificantDigits: 3 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Writing

function regionHeading(block: RegionBlock, lang: Language): string {
  return `### ${regionName(block.region, lang)} [${block.region}]: ${VERDICT_LABELS[lang][block.verdict]}`;
}

function factLine(fact: Fact, lang: Language): string {
  const source = fact.sourceUrl ? ` ([${SOURCE_WORD[lang]}](${fact.sourceUrl}))` : '';
  return `- **${fact.label}**: ${fact.value}${source}`;
}

function sectionBody(key: SectionKey, content: PageContent, lang: Language): string {
  switch (key) {
    case 'whenFree':
    case 'whenNotFree':
    case 'background':
      return content[key].trim();
    case 'facts':
      return content.facts.map((fact) => factLine(fact, lang)).join('\n');
    case 'trivia':
      return content.trivia.map((item) => `- ${item.trim()}`).join('\n');
    case 'regions':
      return content.regions.map((block) => `${regionHeading(block, lang)}\n\n${block.text.trim()}`).join('\n\n');
    case 'sources':
      return content.sources.map((source) => `- [${source.title}](${source.url})`).join('\n');
  }
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/** The page as one editable Markdown document. The image is not part of it. */
export function pageToSource(title: string, content: PageContent, lang: Language): string {
  const front: string[] = [`title: ${title}`, `verdict: ${content.verdict}`];
  if (content.emoji) front.push(`emoji: ${content.emoji}`);
  if (content.scale) front.push(`scale: ${content.scale.type}`, `scale-region: ${content.scale.region}`);
  if (content.timePrice) {
    const tp = content.timePrice;
    front.push(
      `time-price-unit: ${tp.unit}`,
      `time-price: ${tp.price}`,
      `time-price-wage: ${tp.hourlyWage}`,
      `time-price-currency: ${tp.currency}`,
      `time-price-region: ${tp.region}`,
      `time-price-source: ${tp.source.title} | ${tp.source.url}`,
    );
  }
  const sections = SECTION_KEYS.map((key) => {
    const body = sectionBody(key, content, lang);
    return `## ${SECTION_LABELS[lang][key]}${body ? `\n\n${body}` : ''}`;
  });
  return ['---', ...front, '---', '', quote(content.summary), '', sections.join('\n\n'), ''].join('\n');
}

export interface LlmsPage {
  lang: Language;
  title: string;
  content: PageContent;
  status: 'draft' | 'published';
  url: string;
  updatedAt: string;
  revision: number;
  translations: Array<{ lang: Language; url: string }>;
}

/** The readable Markdown served as llms.txt for a page. Empty sections are left out. */
export function pageToLlmsText(page: LlmsPage): string {
  const { lang, content } = page;
  const meta = META_LABELS[lang];
  const lines: string[] = [`# ${content.emoji ? `${content.emoji} ` : ''}${questionFor(lang, page.title)}`, '', quote(content.summary), ''];
  lines.push(`- ${meta.verdict}: ${VERDICT_LABELS[lang][content.verdict]}`);
  if (content.scale) {
    const level = FREE_TYPE_LEVEL[content.scale.type];
    lines.push(
      `- ${SCALE_NAME[lang]}: ${level} ${meta.of} ${SCALE_MAX}, ${FREE_TYPE_LABELS[lang][content.scale.type].toLowerCase()} (${regionName(content.scale.region, lang)})`,
    );
  }
  if (content.timePrice) {
    const tp = content.timePrice;
    lines.push(
      `- ${meta.timePrice}: ${formatDuration(timePriceSeconds(tp), lang)} ${meta.forUnit} ${tp.unit}, ${meta.atWage} ${formatMoney(tp.hourlyWage, tp.currency, lang)} (${regionName(tp.region, lang)}; [${tp.source.title}](${tp.source.url}))`,
    );
  }
  if (page.status === 'draft') lines.push(`- ${meta.draft}`);
  lines.push(`- ${meta.updated}: ${page.updatedAt.slice(0, 10)} (${meta.version} ${page.revision})`);
  lines.push(`- ${meta.url}: ${page.url}`);
  if (page.translations.length) {
    lines.push(`- ${meta.translations}: ${page.translations.map((t) => `[${t.lang}](${t.url})`).join(', ')}`);
  }
  for (const key of SECTION_KEYS) {
    const body = sectionBody(key, content, lang);
    if (body) lines.push('', `## ${SECTION_LABELS[lang][key]}`, '', body);
  }
  lines.push('');
  // [[links]] become absolute links, which work outside the site too.
  return renderWikiLinks(lines.join('\n'), lang, new URL(page.url).origin);
}

// ---------------------------------------------------------------------------------------------
// Reading

export interface SourceError {
  line: number;
  message: string;
}

export type ParseResult =
  | { ok: true; title: string; content: Omit<PageContent, 'image'> }
  | { ok: false; errors: SourceError[] };

const FRONT_KEYS = [
  'title',
  'verdict',
  'emoji',
  'scale',
  'scale-region',
  'time-price-unit',
  'time-price',
  'time-price-wage',
  'time-price-currency',
  'time-price-region',
  'time-price-source',
] as const;

const FACT_LINE = /^[-*]\s+\*\*(.+?)\*\*\s*:\s*(.+?)(?:\s+\(\[[^\]]*\]\((https?:\/\/[^)\s]+)\)\))?\s*$/;
const SOURCE_LINE = /^[-*]\s+\[(.+)\]\((https?:\/\/[^)\s]+)\)\s*$/;
const REGION_HEADING = /^###\s+.*\[([A-Z]+)\]\s*:\s*(.+?)\s*$/;

function matchVerdict(label: string): Verdict | null {
  const wanted = label.trim().toLowerCase();
  if ((VERDICTS as readonly string[]).includes(wanted)) return wanted as Verdict;
  for (const lang of LANGUAGES) {
    for (const verdict of VERDICTS) {
      if (VERDICT_LABELS[lang][verdict].toLowerCase() === wanted) return verdict;
    }
  }
  return null;
}

function matchSection(heading: string, lang: Language): SectionKey | null {
  const wanted = heading.trim().toLowerCase();
  for (const key of SECTION_KEYS) {
    const names = [key, SECTION_LABELS[lang][key], SECTION_LABELS.en[key]].map((name) => name.toLowerCase());
    if (names.includes(wanted)) return key;
  }
  return null;
}

function parseNumber(value: string): number {
  const normalized = value.includes('.') ? value : value.replace(',', '.');
  return Number(normalized.trim());
}

function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

/**
 * Parses the Markdown source back into page content. Returns every problem with its line
 * number instead of stopping at the first. Length limits and the like are checked by the API.
 */
export function parseSource(source: string, lang: Language): ParseResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const errors: SourceError[] = [];
  const error = (index: number, message: string) => errors.push({ line: index + 1, message });
  let i = 0;

  // Front matter
  const front = new Map<string, { value: string; line: number }>();
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (lines[i]?.trim() === '---') {
    i++;
    while (i < lines.length && lines[i]!.trim() !== '---') {
      const line = lines[i]!;
      if (line.trim()) {
        const colon = line.indexOf(':');
        const key = colon === -1 ? '' : line.slice(0, colon).trim();
        if (!(FRONT_KEYS as readonly string[]).includes(key)) {
          error(i, `Unknown field "${key || line.trim()}". Allowed: ${FRONT_KEYS.join(', ')}`);
        } else {
          front.set(key, { value: line.slice(colon + 1).trim(), line: i });
        }
      }
      i++;
    }
    if (i >= lines.length) error(i - 1, 'Front matter is not closed with ---');
    i++;
  } else {
    error(i, 'The page must start with front matter between --- lines');
  }

  const field = (key: (typeof FRONT_KEYS)[number]) => front.get(key);
  const title = field('title')?.value ?? '';
  if (!title) error(0, 'title is required');
  const verdictValue = field('verdict');
  const verdict = verdictValue ? matchVerdict(verdictValue.value) : null;
  if (!verdict) error(verdictValue?.line ?? 0, `verdict must be one of: ${VERDICTS.join(', ')}`);

  let scale: PageContent['scale'];
  const scaleType = field('scale');
  if (scaleType) {
    const region = field('scale-region')?.value ?? '';
    if (!(FREE_TYPES as readonly string[]).includes(scaleType.value)) {
      error(scaleType.line, `scale must be one of: ${FREE_TYPES.join(', ')}`);
    } else if (!isRegion(region)) {
      error(field('scale-region')?.line ?? scaleType.line, 'scale-region must be a region code such as NL');
    } else {
      scale = { type: scaleType.value as FreeType, region };
    }
  }

  let timePrice: PageContent['timePrice'];
  const tpUnit = field('time-price-unit');
  if (tpUnit) {
    const price = parseNumber(field('time-price')?.value ?? '');
    const hourlyWage = parseNumber(field('time-price-wage')?.value ?? '');
    const currency = (field('time-price-currency')?.value ?? '').toUpperCase();
    const region = field('time-price-region')?.value ?? '';
    const sourceRaw = field('time-price-source')?.value ?? '';
    const separator = sourceRaw.lastIndexOf('|');
    const sourceTitle = separator === -1 ? '' : sourceRaw.slice(0, separator).trim();
    const sourceUrl = separator === -1 ? '' : sourceRaw.slice(separator + 1).trim();
    if (!(price >= 0) || !(hourlyWage > 0)) error(tpUnit.line, 'time-price and time-price-wage must be numbers, the wage above 0');
    else if (!/^[A-Z]{3}$/.test(currency)) error(tpUnit.line, 'time-price-currency must be a currency code such as EUR');
    else if (!isRegion(region)) error(tpUnit.line, 'time-price-region must be a region code such as NL');
    else if (!sourceTitle || !/^https?:\/\//.test(sourceUrl)) error(tpUnit.line, 'time-price-source must be "title | https://…"');
    else timePrice = { unit: tpUnit.value, price, hourlyWage, currency, region, source: { title: sourceTitle, url: sourceUrl } };
  }

  // Summary: everything before the first section heading, without an optional H1.
  const summaryLines: string[] = [];
  while (i < lines.length && !lines[i]!.startsWith('## ')) {
    const line = lines[i]!;
    if (!line.startsWith('# ')) summaryLines.push(line.replace(/^>\s?/, ''));
    i++;
  }
  const summary = summaryLines.join('\n').trim();
  if (!summary) error(i, 'A short answer is required before the first ## heading');

  // Sections
  const bodies = new Map<SectionKey, { start: number; lines: string[] }>();
  while (i < lines.length) {
    const heading = lines[i]!.slice(3);
    const key = matchSection(heading, lang);
    const start = i;
    i++;
    const body: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith('## ')) body.push(lines[i++]!);
    if (!key) {
      error(start, `Unknown section "${heading.trim()}". Use: ${SECTION_KEYS.map((k) => SECTION_LABELS[lang][k]).join(', ')}`);
    } else if (bodies.has(key)) {
      error(start, `Section "${heading.trim()}" appears twice`);
    } else {
      bodies.set(key, { start: start + 1, lines: body });
    }
  }
  const text = (key: SectionKey) => (bodies.get(key)?.lines.join('\n') ?? '').trim();
  const listItems = (key: SectionKey) => {
    const section = bodies.get(key);
    const items: Array<{ text: string; line: number }> = [];
    section?.lines.forEach((line, offset) => {
      const index = section.start + offset;
      if (!line.trim()) return;
      if (/^[-*]\s+/.test(line)) items.push({ text: line, line: index });
      else if (items.length && /^\s+/.test(line)) items[items.length - 1]!.text += ` ${line.trim()}`;
      else error(index, `Use a list item ("- …") in this section`);
    });
    return items;
  };

  const facts: Fact[] = [];
  for (const item of listItems('facts')) {
    const match = FACT_LINE.exec(item.text);
    if (!match) error(item.line, 'A key figure looks like: - **Label**: value ([source](https://…))');
    else facts.push({ label: match[1]!.trim(), value: match[2]!.trim(), ...(match[3] ? { sourceUrl: match[3] } : {}) });
  }

  const trivia = listItems('trivia').map((item) => item.text.replace(/^[-*]\s+/, '').trim());

  const sources: Source[] = [];
  for (const item of listItems('sources')) {
    const match = SOURCE_LINE.exec(item.text);
    if (!match) error(item.line, 'A source looks like: - [Title](https://…)');
    else sources.push({ title: match[1]!.trim(), url: match[2]! });
  }

  const regions: RegionBlock[] = [];
  const regionSection = bodies.get('regions');
  if (regionSection) {
    let current: { block: RegionBlock; lines: string[] } | null = null;
    const flush = () => {
      if (current) {
        current.block.text = current.lines.join('\n').trim();
        regions.push(current.block);
      }
    };
    regionSection.lines.forEach((line, offset) => {
      const index = regionSection.start + offset;
      if (line.startsWith('### ')) {
        flush();
        current = null;
        const match = REGION_HEADING.exec(line);
        const code = match?.[1] ?? '';
        const blockVerdict = match ? matchVerdict(match[2]!) : null;
        if (!match) error(index, 'A region heading looks like: ### Nederland [NL]: Ja');
        else if (!isRegion(code)) error(index, `Unknown region code ${code}`);
        else if (!blockVerdict) error(index, `Unknown verdict "${match[2]}"`);
        else if (regions.some((r) => r.region === code)) error(index, `Region ${code} appears twice`);
        else current = { block: { region: code, verdict: blockVerdict, text: '' }, lines: [] };
      } else if (current) {
        (current as { lines: string[] }).lines.push(line);
      } else if (line.trim()) {
        error(index, 'Start each region with a ### heading');
      }
    });
    flush();
  }

  if (errors.length || !verdict) return { ok: false, errors };
  const emoji = field('emoji')?.value;
  return {
    ok: true,
    title,
    content: {
      verdict,
      ...(emoji ? { emoji } : {}),
      summary,
      whenFree: text('whenFree'),
      whenNotFree: text('whenNotFree'),
      background: text('background'),
      ...(scale ? { scale } : {}),
      ...(timePrice ? { timePrice } : {}),
      facts,
      trivia,
      regions,
      sources,
    },
  };
}
