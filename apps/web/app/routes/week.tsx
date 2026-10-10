import { Anchor, Card, Container, Group, Stack, Text, Title } from '@mantine/core';
import { IconRss } from '@tabler/icons-react';
import { data, Link } from 'react-router';
import type { PageListItem } from '@isgratis/types';
import type { Route } from './+types/week';
import { MailingSignup } from '~/components/MailingSignup';
import { ClaimRow } from '~/components/Claim';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { formatDate, messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';
import { siteCard, socialMeta } from '~/lib/social';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const week = await apiGet<{ days: Array<{ day: string; page: PageListItem }>; fresh: PageListItem[] }>(`/week?lang=${lang}`);
  return data({ lang, ...week, origin: env.publicOrigin }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600' } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const url = `${loaderData.origin}/week/${loaderData.lang}`;
  return [
    { title: `${t.weekTitle} | is.gratis` },
    { name: 'description', content: t.weekIntro },
    { tagName: 'link', rel: 'canonical', href: url },
    { tagName: 'link', rel: 'alternate', type: 'application/rss+xml', title: t.dailyTitle, href: `${loaderData.origin}/${loaderData.lang}/daily.xml` },
    ...socialMeta({ origin: loaderData.origin, lang: loaderData.lang, title: t.weekTitle, description: t.weekIntro, url, image: siteCard(loaderData.lang), imageAlt: t.weekTitle }),
  ];
};

/** A week of free things: one per day, plus what was added. Something to share every week. */
export default function Week({ loaderData }: Route.ComponentProps) {
  const { lang, days, fresh } = loaderData;
  const t = messages(lang);
  return (
    <Container size="md">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Stack gap={4}>
            <Title order={1}>{t.weekTitle}</Title>
            <Text c="dimmed">{t.weekIntro}</Text>
          </Stack>
          <Anchor href={`/${lang}/daily.xml`} size="sm">
            <Group gap={4} component="span">
              <IconRss size={14} aria-hidden />
              {t.feed}
            </Group>
          </Anchor>
        </Group>
        <Stack gap="sm">
          {days.map(({ day, page }) => (
            <Card key={day} withBorder padding="md">
              <Text size="xs" fw={800} tt="uppercase" c="green.8" mb={4} style={{ letterSpacing: 1 }}>
                {formatDate(day, lang)}
              </Text>
              <ClaimRow {...page} />
              <Text size="sm" c="dimmed" mt={4} lineClamp={2}>
                {plainText(page.summary, 220)}
              </Text>
            </Card>
          ))}
        </Stack>
        {fresh.length > 0 && (
          <Stack gap="sm">
            <Title order={2} size="h3">
              {t.weekNew}
            </Title>
            <Card withBorder padding="md">
              <Stack gap={10}>
                {fresh.map((page) => (
                  <ClaimRow key={page.slug} {...page} />
                ))}
              </Stack>
            </Card>
          </Stack>
        )}
        <MailingSignup list="week" lang={lang} />
        <Group gap="md">
          <Anchor component={Link} to={`/offers/${lang}`}>
            {t.offersTitle} →
          </Anchor>
          <Anchor component={Link} to={`/quiz/${lang}`}>
            {t.quizTitle} →
          </Anchor>
        </Group>
      </Stack>
    </Container>
  );
}
