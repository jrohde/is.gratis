import { Anchor, Card, Group, SimpleGrid, Stack, Text, Title, Container } from '@mantine/core';
import { motion } from 'motion/react';
import { data, Link } from 'react-router';
import { LANGUAGES, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-home';
import { SearchBox } from '~/components/SearchBox';
import { VerdictBadge } from '~/components/VerdictBadge';
import { apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';
import { wasHydratedBeforeMount } from '~/lib/use-hydrated';

const MotionDiv = motion.div;

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { pages } = await apiGet<{ pages: PageListItem[] }>(`/pages?lang=${lang}&status=published&limit=24`);
  return data({ lang, pages, origin: env.publicOrigin }, { headers: { 'Cache-Control': CACHE.short } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  return [
    { title: `is.gratis · ${t.tagline}` },
    { name: 'description', content: t.howText },
    { tagName: 'link', rel: 'canonical', href: `${loaderData.origin}/${loaderData.lang}` },
    ...LANGUAGES.map((lang) => ({
      tagName: 'link' as const,
      rel: 'alternate',
      hrefLang: lang,
      href: `${loaderData.origin}/${lang}`,
    })),
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: `${loaderData.origin}/` },
  ];
};

export default function LangHome({ loaderData }: Route.ComponentProps) {
  const { lang, pages } = loaderData;
  const t = messages(lang);
  const play = wasHydratedBeforeMount();
  return (
    <Container size="md">
      <Stack gap={48}>
        <Stack gap="md" align="center" ta="center" py="xl">
          <MotionDiv initial={play ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Title order={1} fz={{ base: 40, sm: 56 }} lh={1.1}>
              {t.searchButton}
            </Title>
          </MotionDiv>
          <Text size="lg" c="dimmed" maw={560}>
            {t.tagline}
          </Text>
          <div style={{ width: '100%', maxWidth: 560 }}>
            <SearchBox lang={lang} size="lg" />
          </div>
        </Stack>

        <Stack gap="md">
          <Title order={2} size="h3">
            {t.recent}
          </Title>
          {pages.length === 0 && <Text c="dimmed">{t.empty}</Text>}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {pages.map((page, index) => (
              <MotionDiv
                key={page.slug}
                initial={play ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 10) * 0.04 }}
              >
                <Card withBorder padding="md" h="100%">
                  <Group justify="space-between" wrap="nowrap" mb={6}>
                    <Anchor component={Link} to={`/${lang}/${page.slug}`} fw={700} c="inherit">
                      {page.emoji && (
                        <Text span mr={8} aria-hidden>
                          {page.emoji}
                        </Text>
                      )}
                      {t.question(page.title)}
                    </Anchor>
                    <VerdictBadge verdict={page.verdict} lang={lang} size="sm" />
                  </Group>
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    {plainText(page.summary, 200)}
                  </Text>
                </Card>
              </MotionDiv>
            ))}
          </SimpleGrid>
        </Stack>

        <Card withBorder padding="lg">
          <Title order={2} size="h4" mb="xs">
            {t.howTitle}
          </Title>
          <Text>{t.howText}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
