import { Anchor, Badge, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { data, Link } from 'react-router';
import { linkTerm, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/a-z';
import { VerdictBadge } from '~/components/VerdictBadge';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { parseLang } from '~/lib/params';
import { siteCard, socialMeta } from '~/lib/social';

const BATCH = 1000;
const MAX_PAGES = 20_000;

/** Every published page, grouped by first letter like a printed encyclopedia. */
export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const pages: PageListItem[] = [];
  for (let offset = 0; offset < MAX_PAGES; offset += BATCH) {
    const batch = await apiGet<{ pages: PageListItem[] }>(
      `/pages?lang=${lang}&status=published&sort=title&limit=${BATCH}&offset=${offset}`,
    );
    pages.push(...batch.pages);
    if (batch.pages.length < BATCH) break;
  }
  const entries = pages
    .map((page) => ({ ...page, sortKey: linkTerm(page.title, lang) }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, lang, { sensitivity: 'base' }));
  const groups: Array<{ letter: string; pages: typeof entries }> = [];
  for (const entry of entries) {
    const first = entry.sortKey.normalize('NFKD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    const last = groups[groups.length - 1];
    if (last?.letter === letter) last.pages.push(entry);
    else groups.push({ letter, pages: [entry] });
  }
  return data(
    { lang, groups, count: entries.length, origin: env.publicOrigin },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600' } },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const url = `${loaderData.origin}/a-z/${loaderData.lang}`;
  return [
    { title: `${t.indexTitle} | is.gratis` },
    { name: 'description', content: t.indexIntro(loaderData.count) },
    { tagName: 'link', rel: 'canonical', href: url },
    ...socialMeta({
      origin: loaderData.origin,
      lang: loaderData.lang,
      title: t.indexTitle,
      description: t.tagline,
      url,
      image: siteCard(loaderData.lang),
      imageAlt: t.tagline,
    }),
  ];
};

export default function AToZ({ loaderData }: Route.ComponentProps) {
  const { lang, groups, count } = loaderData;
  const t = messages(lang);
  return (
    <Container size="md">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{t.indexTitle}</Title>
          <Text c="dimmed">{t.indexIntro(count)}</Text>
        </Stack>
        <Group gap={6} component="nav" aria-label={t.indexTitle}>
          {groups.map((group) => (
            <Anchor key={group.letter} href={`#letter-${group.letter}`} fw={700} px={6}>
              {group.letter}
            </Anchor>
          ))}
        </Group>
        {groups.map((group) => (
          <section key={group.letter} id={`letter-${group.letter}`}>
            <Group gap="xs" mb="xs">
              <Badge size="xl" variant="light" radius="sm">
                {group.letter}
              </Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {group.pages.map((page) => (
                <Card key={page.slug} withBorder padding="sm">
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Anchor component={Link} to={`/${lang}/${page.slug}`} c="inherit" fw={600}>
                      {page.emoji ? `${page.emoji} ` : ''}
                      {t.question(page.title)}
                    </Anchor>
                    <VerdictBadge verdict={page.verdict} lang={lang} size="sm" />
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          </section>
        ))}
      </Stack>
    </Container>
  );
}
