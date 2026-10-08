import { Alert, Anchor, Button, Card, Container, Divider, Group, List, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { data, Link, redirect, useRevalidator } from 'react-router';
import { toSlug, VERDICT_LABELS, type DraftJob, type Page } from '@isgratis/types';
import type { Route } from './+types/page';
import { DraftRequest } from '~/components/DraftRequest';
import { Markdown } from '~/components/Markdown';
import { RegionSection } from '~/components/RegionSection';
import { SponsoredBlock } from '~/components/SponsoredBlock';
import { VerdictBadge } from '~/components/VerdictBadge';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGet, apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { formatDate, LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { jsonForScript, plainText } from '~/lib/markdown';
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
    { property: 'og:title', content: question },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'article' },
    { property: 'og:url', content: url },
    { tagName: 'link', rel: 'canonical', href: url },
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

  return (
    <Container size="md">
      {page.status === 'published' && <StructuredData page={page} question={question} />}
      <Stack gap="xl">
        {page.status === 'draft' && <DraftBanner page={page} />}

        <Stack gap="sm">
          <Title order={1} fz={{ base: 32, sm: 44 }} lh={1.15}>
            {question}
          </Title>
          <div>
            <VerdictBadge verdict={page.content.verdict} lang={page.lang} size="xl" animate />
          </div>
          <Markdown size="lg">{page.content.summary}</Markdown>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Card withBorder padding="lg" style={{ borderTop: '4px solid var(--mantine-color-green-6)' }}>
            <Title order={2} size="h4" mb="sm">
              {t.whenFree}
            </Title>
            <Markdown>{page.content.whenFree || '–'}</Markdown>
          </Card>
          <Card withBorder padding="lg" style={{ borderTop: '4px solid var(--mantine-color-red-6)' }}>
            <Title order={2} size="h4" mb="sm">
              {t.whenNotFree}
            </Title>
            <Markdown>{page.content.whenNotFree || '–'}</Markdown>
          </Card>
        </SimpleGrid>

        <SponsoredBlock offers={page.sponsoredOffers} lang={page.lang} slug={page.slug} region={region} />

        <RegionSection blocks={page.content.regions} lang={page.lang} selected={region} onSelect={setRegion} />

        <Stack gap="xs">
          <Title order={2} size="h4">
            {t.sources}
          </Title>
          {page.content.sources.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t.noSources}
            </Text>
          ) : (
            <List size="sm">
              {page.content.sources.map((source) => (
                <List.Item key={source.url}>
                  <Anchor href={source.url} rel="nofollow ugc noopener" target="_blank">
                    {source.title}
                  </Anchor>
                </List.Item>
              ))}
            </List>
          )}
        </Stack>

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
            <Anchor component={Link} to={`${base}/history`} size="sm">
              {t.history}
            </Anchor>
            <Button component={Link} to={`${base}/edit`} size="xs" variant="light">
              {t.edit}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Container>
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
