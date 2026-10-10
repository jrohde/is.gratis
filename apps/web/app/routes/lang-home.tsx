import { Anchor, Button, Card, Group, SimpleGrid, Stack, Text, Title, Container } from '@mantine/core';
import { motion } from 'motion/react';
import { data, Link } from 'react-router';
import { LANGUAGES, SLOGAN, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-home';
import { Slogan, Wordmark } from '~/components/Logo';
import { SearchBox } from '~/components/SearchBox';
import { ClaimRow } from '~/components/Claim';
import { apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';
import { siteCard, socialMeta } from '~/lib/social';
import { wasHydratedBeforeMount } from '~/lib/use-hydrated';

const MotionDiv = motion.div;

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const [{ pages }, daily] = await Promise.all([
    apiGet<{ pages: PageListItem[] }>(`/pages?lang=${lang}&status=published&limit=24`),
    apiGet<{ day: string; page: PageListItem | null }>(`/daily?lang=${lang}`).catch(() => ({ day: '', page: null })),
  ]);
  return data({ lang, pages, daily: daily.page, origin: env.publicOrigin }, { headers: { 'Cache-Control': CACHE.short } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const { lang, origin } = loaderData;
  const t = messages(lang);
  const url = `${origin}/${lang}`;
  return [
    { title: `is.gratis* · ${t.tagline}` },
    { name: 'description', content: `${t.tagline} ${t.howText}` },
    ...socialMeta({
      origin,
      lang,
      title: `is.gratis* · ${t.tagline}`,
      description: `*${SLOGAN[lang]} ${t.howText}`,
      url,
      image: siteCard(lang),
      imageAlt: `is.gratis* *${SLOGAN[lang]}`,
    }),
    { tagName: 'link', rel: 'canonical', href: url },
    { tagName: 'link', rel: 'alternate', type: 'application/rss+xml', title: t.recentFeedTitle, href: `${url}/feed.xml` },
    ...LANGUAGES.map((code) => ({
      tagName: 'link' as const,
      rel: 'alternate',
      hrefLang: code,
      href: `${origin}/${code}`,
    })),
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: `${origin}/` },
  ];
};

export default function LangHome({ loaderData }: Route.ComponentProps) {
  const { lang, pages, daily } = loaderData;
  const t = messages(lang);
  const play = wasHydratedBeforeMount();
  return (
    <Container size="md">
      <Stack gap={48}>
        <Stack gap="md" align="center" ta="center" py="xl">
          <MotionDiv initial={play ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Title order={1} lh={1}>
              <Wordmark size="clamp(56px, 13vw, 112px)" />
            </Title>
          </MotionDiv>
          <Text fz={{ base: 26, sm: 34 }} fw={800} c="dimmed" mt={4}>
            <Slogan lang={lang} />
          </Text>
          <Text size="md" c="dimmed" maw={560}>
            {t.tagline}
          </Text>
          <div style={{ width: '100%', maxWidth: 560 }}>
            <SearchBox lang={lang} size="lg" />
          </div>
        </Stack>

        {daily && (
          <Card withBorder padding="lg" radius="md" style={{ borderTop: '4px solid var(--mantine-color-green-6)' }}>
            <Group justify="space-between" mb={6}>
              <Text size="xs" fw={800} tt="uppercase" c="green.8" style={{ letterSpacing: 1 }}>
                {t.dailyTitle}
              </Text>
              <Anchor component={Link} to={`/week/${lang}`} size="xs">
                {t.weekTitle} →
              </Anchor>
            </Group>
            <Text fz={{ base: 'lg', sm: 'xl' }} component="div">
              <ClaimRow {...daily} />
            </Text>
            <Text c="dimmed" mt={6} lineClamp={3}>
              {plainText(daily.summary, 300)}
            </Text>
          </Card>
        )}

        <Group justify="center" gap="sm">
          <Button component={Link} to={`/quiz/${lang}`} variant="light">
            {t.quizTitle} →
          </Button>
          <Button component={Link} to={`/offers/${lang}`} variant="subtle">
            {t.offersTitle} →
          </Button>
        </Group>

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
                  <div style={{ marginBottom: 6 }}>
                    <ClaimRow {...page} />
                  </div>
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
