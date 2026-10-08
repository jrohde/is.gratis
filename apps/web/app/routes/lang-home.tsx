import { Anchor, Card, Group, SimpleGrid, Stack, Text, Title, Container } from '@mantine/core';
import { motion } from 'motion/react';
import { data, Link } from 'react-router';
import { LANGUAGES, SLOGAN, type Language, type PageListItem } from '@isgratis/types';
import type { Route } from './+types/lang-home';
import { LiveMark, skyDescription } from '~/components/Logo';
import { SearchBox } from '~/components/SearchBox';
import { useSky } from '~/stores/sky';
import { VerdictBadge } from '~/components/VerdictBadge';
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
  const { pages } = await apiGet<{ pages: PageListItem[] }>(`/pages?lang=${lang}&status=published&limit=24`);
  return data({ lang, pages, origin: env.publicOrigin }, { headers: { 'Cache-Control': CACHE.short } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const { lang, origin } = loaderData;
  const t = messages(lang);
  const url = `${origin}/${lang}`;
  return [
    { title: `is.gratis · ${SLOGAN[lang]}` },
    { name: 'description', content: `${t.tagline} ${t.howText}` },
    ...socialMeta({
      origin,
      lang,
      title: `is.gratis · ${t.tagline}`,
      description: SLOGAN[lang],
      url,
      image: siteCard(lang),
      imageAlt: SLOGAN[lang],
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

/** "Nu aan de hemel: wassende maansikkel", shown once the browser knows the visitor's sky. */
function SkyCaption({ lang }: { lang: Language }) {
  const { state, live } = useSky();
  const t = messages(lang);
  return (
    <Text size="xs" c="dimmed" mt={-8} style={{ visibility: live ? 'visible' : 'hidden' }}>
      {t.skyNow}: {skyDescription(state, lang)}
    </Text>
  );
}

export default function LangHome({ loaderData }: Route.ComponentProps) {
  const { lang, pages } = loaderData;
  const t = messages(lang);
  const play = wasHydratedBeforeMount();
  return (
    <Container size="md">
      <Stack gap={48}>
        <Stack gap="md" align="center" ta="center" py="xl">
          <LiveMark size={144} lang={lang} />
          <SkyCaption lang={lang} />
          <MotionDiv initial={play ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Title order={1} fz={{ base: 40, sm: 56 }} lh={1.1}>
              {t.searchButton}
            </Title>
          </MotionDiv>
          <Text size="xl" fw={600} maw={620}>
            {SLOGAN[lang]}
          </Text>
          <Text size="md" c="dimmed" maw={560}>
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
