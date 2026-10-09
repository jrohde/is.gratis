import { Alert, Anchor, Button, Card, Container, Group, Loader, Pagination, Stack, Text, Title } from '@mantine/core';
import { IconPencilPlus } from '@tabler/icons-react';
import { Fragment, useEffect, useState } from 'react';
import { data, Link, useNavigate } from 'react-router';
import { SNIPPET_END, SNIPPET_START, toSlug, type SearchResponse, type Suggestions } from '@isgratis/types';
import type { Route } from './+types/search';
import { ClaimRow, MissingRow } from '~/components/Claim';
import { SearchBox } from '~/components/SearchBox';
import { api } from '~/lib/api.client';
import { apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { parseLang } from '~/lib/params';

const PER_PAGE = 20;

export async function loader({ params, request }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const result = q
    ? await apiGet<SearchResponse>(
        `/search/full?lang=${lang}&q=${encodeURIComponent(q)}&limit=${PER_PAGE}&offset=${(page - 1) * PER_PAGE}`,
      )
    : null;
  return data({ lang, q, page, result }, { headers: { 'Cache-Control': CACHE.short } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  return [
    { title: `${loaderData.q ? `${loaderData.q} · ` : ''}${t.searchTitle} | is.gratis` },
    { name: 'robots', content: 'noindex' },
  ];
};

/** Search fragments come as plain text with markers around the matches. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(SNIPPET_START);
  return (
    <Text size="sm" c="dimmed" lineClamp={3}>
      {parts.map((part, i) => {
        if (i === 0) return <Fragment key={i}>{part}</Fragment>;
        const [match, rest] = part.split(SNIPPET_END);
        return (
          <Fragment key={i}>
            <mark style={{ background: 'var(--mantine-color-green-light)', color: 'inherit', padding: '0 1px' }}>{match}</mark>
            {rest}
          </Fragment>
        );
      })}
    </Text>
  );
}

/** Related subjects from the language model: asked once per query, then cached by the API. */
function Related({ lang, q, hide }: { lang: Route.ComponentProps['loaderData']['lang']; q: string; hide: Set<string> }) {
  const t = messages(lang);
  const [related, setRelated] = useState<Suggestions | null>(null);
  useEffect(() => {
    setRelated(null);
    let cancelled = false;
    api<Suggestions>('GET', `/search/related?lang=${lang}&q=${encodeURIComponent(q)}`)
      .then((value) => !cancelled && setRelated(value))
      .catch(() => !cancelled && setRelated({ pages: [], missing: [] }));
    return () => {
      cancelled = true;
    };
  }, [lang, q]);
  if (related === null) return <Loader size="sm" type="dots" />;
  // Leave out what this page already shows.
  const pages = related.pages.filter((page) => !hide.has(page.slug));
  const missing = related.missing.filter((subject) => !hide.has(subject.slug));
  if (!pages.length && !missing.length) return null;
  return (
    <Stack gap="xs">
      <Title order={2} size="h4">
        {t.relatedTitle}
      </Title>
      <Card withBorder padding="md">
        <Stack gap={10}>
          {pages.map((page) => (
            <ClaimRow key={page.slug} {...page} />
          ))}
          {missing.map((subject) => (
            <MissingRow key={subject.slug} lang={lang} slug={subject.slug} title={subject.title} />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { lang, q, page, result } = loaderData;
  const t = messages(lang);
  const navigate = useNavigate();
  const slug = toSlug(q);
  const pages = result ? Math.ceil(result.total / PER_PAGE) : 0;

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>{t.searchTitle}</Title>
        <SearchBox key={q} lang={lang} size="lg" initial={q} />
        {result && (
          <>
            {result.exact && (
              <Card withBorder padding="md" bg="var(--mantine-color-green-light)">
                <Text size="xs" c="dimmed" mb={6}>
                  {t.exactPage}
                </Text>
                {(() => {
                  const exact = result.results.find((r) => r.slug === result.exact);
                  return exact ? (
                    <ClaimRow {...exact} />
                  ) : (
                    <Anchor component={Link} to={`/${lang}/${result.exact}`} fw={700}>
                      /{lang}/{result.exact}
                    </Anchor>
                  );
                })()}
              </Card>
            )}
            {result.didYouMean && (
              <Group gap="xs" align="baseline">
                <Text>{t.didYouMean}:</Text>
                <div>
                  <ClaimRow {...result.didYouMean} />
                </div>
              </Group>
            )}
            <Text c="dimmed" size="sm">
              {result.total ? t.searchResults(result.total, result.query) : t.searchNone(result.query)}
            </Text>
            <Stack gap="sm">
              {result.results.map((item) => (
                <Card key={item.slug} withBorder padding="md">
                  <Stack gap={6}>
                    <ClaimRow {...item} />
                    <Snippet text={item.snippet} />
                  </Stack>
                </Card>
              ))}
            </Stack>
            {pages > 1 && (
              <Pagination
                value={page}
                total={pages}
                onChange={(next) => navigate(`/search/${lang}?q=${encodeURIComponent(q)}&page=${next}`)}
              />
            )}
            {/* Offer to write the page, but not for a typo of one that exists. */}
            {!result.exact && !result.didYouMean && slug && (
              <Alert variant="light" color="gray" icon={<IconPencilPlus size={18} />}>
                <Stack gap="xs">
                  <MissingRow lang={lang} slug={slug} title={q} />
                  <div>
                    <Button component={Link} to={`/${lang}/${slug}`} size="xs" variant="light">
                      {t.writeFirst}
                    </Button>
                  </div>
                </Stack>
              </Alert>
            )}
            <Related
              lang={lang}
              q={q}
              hide={
                new Set([
                  ...result.results.map((r) => r.slug),
                  ...(result.didYouMean ? [result.didYouMean.slug] : []),
                  ...(!result.exact && !result.didYouMean && slug ? [slug] : []),
                ])
              }
            />
            <Text size="xs" c="dimmed">
              {t.searchHelp}
            </Text>
          </>
        )}
      </Stack>
    </Container>
  );
}
