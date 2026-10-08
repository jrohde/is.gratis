import { Alert, Anchor, Button, Card, Container, Divider, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
  IconBook2,
  IconCircleCheck,
  IconCircleX,
  IconFileText,
  IconFlask,
  IconHistory,
  IconPencil,
  IconWorld,
} from '@tabler/icons-react';
import { useState } from 'react';
import { data, Link, redirect, useRevalidator } from 'react-router';
import { citationStats, citeContent, linkContent, SECTION_LABELS, toSlug, VERDICT_LABELS, type DraftJob, type Page } from '@isgratis/types';
import { useMemo } from 'react';
import type { Route } from './+types/page';
import { DraftRequest } from '~/components/DraftRequest';
import { FactsGrid } from '~/components/FactsGrid';
import { PageHero } from '~/components/PageHero';
import { ScaleMeter } from '~/components/ScaleMeter';
import { SectionTitle } from '~/components/SectionTitle';
import { SourcingSummary } from '~/components/SourcingSummary';
import { TimePriceCard } from '~/components/TimePriceCard';
import { TriviaList } from '~/components/TriviaList';
import { CitationContext, Markdown, WikiLinkContext } from '~/components/Markdown';
import { RegionSection } from '~/components/RegionSection';
import { SponsoredBlock } from '~/components/SponsoredBlock';
import { VerdictBadge } from '~/components/VerdictBadge';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGet, apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { formatDate, LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { jsonForScript, plainText } from '~/lib/markdown';
import { pageCard, socialMeta } from '~/lib/social';
import { parseLang } from '~/lib/params';
import { DEFAULT_REGION } from '~/lib/regions';
import { usePreferences } from '~/stores/preferences';
import { useSession } from '~/stores/session';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = toSlug(params.slug);
  if (!slug) throw data(null, { status: 404 });
  // /nl/Openbaar%20Vervoer -> /nl/openbaar-vervoer
  if (slug !== params.slug) throw redirect(`/${lang}/${slug}`, { status: 301 });

  const page = await apiGetOptional<Page>(`/pages/${lang}/${slug}`);
  if (!page) {
    const { job } = await apiGet<{ job: DraftJob | null }>(`/drafts?lang=${lang}&slug=${slug}`);
    return data(
      { kind: 'missing' as const, lang, slug, job, origin: env.publicOrigin },
      { status: 404, headers: { 'Cache-Control': CACHE.short } },
    );
  }
  return data(
    { kind: 'page' as const, lang, slug, page, origin: env.publicOrigin },
    { headers: { 'Cache-Control': page.status === 'published' ? CACHE.page : CACHE.short } },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const url = `${loaderData.origin}/${loaderData.lang}/${loaderData.slug}`;
  if (loaderData.kind === 'missing') {
    return [
      { title: `${t.question(loaderData.slug.replace(/-/g, ' '))} | is.gratis` },
      { name: 'robots', content: 'noindex' },
    ];
  }
  const { page } = loaderData;
  const question = t.question(page.title);
  const description = plainText(page.content.summary, 160);
  return [
    { title: `${question} ${VERDICT_LABELS[page.lang][page.content.verdict]}. | is.gratis` },
    { name: 'description', content: description },
    ...socialMeta({
      origin: loaderData.origin,
      lang: page.lang,
      title: `${question} ${VERDICT_LABELS[page.lang][page.content.verdict]}.`,
      description,
      url,
      image: pageCard(page.lang, page.slug, page.currentRevision.number),
      imageAlt: `${question} ${VERDICT_LABELS[page.lang][page.content.verdict]}.`,
      type: 'article',
    }),
    { tagName: 'link', rel: 'canonical', href: url },
    // The same page as plain Markdown, for language models and other tools (llms.txt convention).
    { tagName: 'link', rel: 'alternate', type: 'text/markdown', href: `${url}/llms.txt` },
    {
      tagName: 'link',
      rel: 'alternate',
      type: 'application/rss+xml',
      title: t.feedTitle(question),
      href: `${url}/feed.xml`,
    },
    { tagName: 'link', rel: 'alternate', hrefLang: page.lang, href: url },
    ...page.translations.map((tr) => ({
      tagName: 'link' as const,
      rel: 'alternate',
      hrefLang: tr.lang,
      href: `${loaderData.origin}/${tr.lang}/${tr.slug}`,
    })),
    // Drafts are unchecked LLM output: keep them out of search engines until a person approves.
    ...(page.status === 'draft' ? [{ name: 'robots', content: 'noindex' }] : []),
  ];
};

function StructuredData({ page, question }: { page: Page; question: string }) {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: page.lang,
    dateModified: page.updatedAt,
    mainEntity: [
      {
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: plainText(page.content.summary, 1000) },
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(json) }} />;
}

function DraftBanner({ page }: { page: Page }) {
  const t = messages(page.lang);
  const user = useSession((state) => state.user);
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/${page.lang}/${page.slug}`;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/pages/${page.lang}/${page.slug}/publish`);
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert color="yellow" title={t.draftTitle} variant="light">
      <Stack gap="sm">
        <Text size="sm">{t.draftText}</Text>
        {error && <Text c="red" size="sm">{error}</Text>}
        {user ? (
          <Group gap="xs">
            <Button size="xs" onClick={() => void publish()} loading={busy}>
              {t.publish}
            </Button>
            <Button size="xs" variant="default" component={Link} to={`${base}/edit`}>
              {t.edit}
            </Button>
          </Group>
        ) : (
          <Anchor component={Link} to={`/account/login?lang=${page.lang}&next=${encodeURIComponent(base)}`} size="sm">
            {t.publishLogin}
          </Anchor>
        )}
      </Stack>
    </Alert>
  );
}

function PageView({ page }: { page: Page }) {
  const t = messages(page.lang);
  const preferred = usePreferences((state) => state.region);
  const setRegion = usePreferences((state) => state.setRegion);
  const region = preferred ?? DEFAULT_REGION[page.lang];
  const question = t.question(page.title);
  const base = `/${page.lang}/${page.slug}`;
  const author =
    page.currentRevision.source === 'llm'
      ? t.llmAuthor
      : page.currentRevision.source === 'seed'
        ? t.seedAuthor
        : page.currentRevision.authorName;

  const sections = SECTION_LABELS[page.lang];
  // Wikipedia-style links and footnotes: [[links]], the first mention of other subjects and
  // [^id] citations all become clickable. The stored text itself is not changed.
  const content = useMemo(() => citeContent(linkContent(page.content, page.lang, page.links)), [page]);
  const stats = useMemo(() => citationStats(page.content), [page.content]);
  const highlight = usePreferences((state) => state.highlightUnsourced);
  const linkInfo = useMemo(
    () => ({ missing: new Set(page.links.missing), missingTitle: t.missingLink }),
    [page.links.missing, t.missingLink],
  );
  const citationInfo = useMemo(
    () => ({
      sources: page.content.sources,
      lang: page.lang,
      highlight,
      neededLabel: t.citationNeeded,
      neededHelp: t.citationNeededHelp,
    }),
    [page.content.sources, page.lang, highlight, t.citationNeeded, t.citationNeededHelp],
  );
  return (
    <WikiLinkContext.Provider value={linkInfo}>
    <CitationContext.Provider value={citationInfo}>
    <Container size="md">
      {page.status === 'published' && <StructuredData page={page} question={question} />}
      <Stack gap="xl">
        {page.status === 'draft' && <DraftBanner page={page} />}

        <Stack gap="md">
          {content.image && <PageHero content={content} lang={page.lang} />}
          <Group gap="lg" wrap="nowrap" align="center">
            {!content.image && <PageHero content={content} lang={page.lang} />}
            <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
              <Title order={1} fz={{ base: 30, sm: 44 }} lh={1.15}>
                {question}
              </Title>
              <div>
                <VerdictBadge verdict={content.verdict} lang={page.lang} size="xl" animate />
              </div>
            </Stack>
          </Group>
          <Markdown size="lg">{content.summary}</Markdown>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {content.scale && <ScaleMeter scale={content.scale} lang={page.lang} />}
          {content.timePrice && <TimePriceCard timePrice={content.timePrice} lang={page.lang} />}
          {stats.claims > 0 && <SourcingSummary stats={stats} lang={page.lang} />}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Card withBorder padding="lg" style={{ borderTop: '4px solid var(--mantine-color-green-6)' }}>
            <SectionTitle icon={<IconCircleCheck size={18} />} color="green">
              {sections.whenFree}
            </SectionTitle>
            <Markdown claims>{content.whenFree || '–'}</Markdown>
          </Card>
          <Card withBorder padding="lg" style={{ borderTop: '4px solid var(--mantine-color-red-6)' }}>
            <SectionTitle icon={<IconCircleX size={18} />} color="red">
              {sections.whenNotFree}
            </SectionTitle>
            <Markdown claims>{content.whenNotFree || '–'}</Markdown>
          </Card>
        </SimpleGrid>

        <SponsoredBlock offers={page.sponsoredOffers} lang={page.lang} slug={page.slug} region={region} />

        {content.background && (
          <section>
            <SectionTitle icon={<IconFlask size={18} />} color="violet">
              {sections.background}
            </SectionTitle>
            <Markdown claims>{content.background}</Markdown>
          </section>
        )}

        <FactsGrid facts={content.facts} lang={page.lang} />
        <TriviaList items={content.trivia} lang={page.lang} />

        <section>
          <RegionSection
            blocks={content.regions}
            lang={page.lang}
            selected={region}
            onSelect={setRegion}
            icon={<IconWorld size={18} />}
          />
        </section>

        <section id="bronnen" style={{ scrollMarginTop: 80 }}>
          <SectionTitle icon={<IconBook2 size={18} />}>{sections.sources}</SectionTitle>
          {content.sources.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t.noSources}
            </Text>
          ) : (
            <Stack gap={6} component="ol" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {content.sources.map((source, index) => (
                <Group
                  key={source.id}
                  component="li"
                  id={`bron-${index + 1}`}
                  gap="xs"
                  wrap="nowrap"
                  align="baseline"
                  className="source-item"
                  style={{ scrollMarginTop: 80 }}
                >
                  <Text size="sm" fw={700} c="dimmed" w={28} style={{ flexShrink: 0 }}>
                    [{index + 1}]
                  </Text>
                  <Text size="sm">
                    <Anchor href={source.url} rel="nofollow ugc noopener" target="_blank">
                      {source.title}
                    </Anchor>{' '}
                    <Text span size="xs" c="dimmed">
                      {(() => {
                        try {
                          return new URL(source.url).hostname.replace(/^www\./, '');
                        } catch {
                          return '';
                        }
                      })()}
                    </Text>
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </section>

        <Divider />
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">
            {t.revisionInfo(page.currentRevision.number, formatDate(page.updatedAt, page.lang), author)}
          </Text>
          <Group gap="md">
            {page.translations.map((tr) => (
              <Anchor key={tr.lang} component={Link} to={`/${tr.lang}/${tr.slug}`} size="sm" hrefLang={tr.lang}>
                {LANGUAGE_NAMES[tr.lang]}
              </Anchor>
            ))}
            <Anchor href={`${base}/llms.txt`} size="sm" title="Markdown (llms.txt)">
              <Group gap={4} wrap="nowrap" component="span">
                <IconFileText size={14} aria-hidden />
                llms.txt
              </Group>
            </Anchor>
            <Anchor component={Link} to={`${base}/history`} size="sm">
              <Group gap={4} wrap="nowrap" component="span">
                <IconHistory size={14} aria-hidden />
                {t.history}
              </Group>
            </Anchor>
            <Button component={Link} to={`${base}/edit`} size="xs" variant="light" leftSection={<IconPencil size={14} />}>
              {t.edit}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Container>
    </CitationContext.Provider>
    </WikiLinkContext.Provider>
  );
}

export default function PageRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'missing') {
    const t = messages(loaderData.lang);
    return (
      <Container size="md">
        <DraftRequest
          lang={loaderData.lang}
          slug={loaderData.slug}
          question={t.question(loaderData.slug.replace(/-/g, ' '))}
          initialJob={loaderData.job}
        />
      </Container>
    );
  }
  return <PageView page={loaderData.page} />;
}
