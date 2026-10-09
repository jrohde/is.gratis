import { Anchor, Badge, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { data, Link, useNavigate } from 'react-router';
import { REGIONS, type Region } from '@isgratis/types';
import type { Route } from './+types/regions';
import { WorldMap } from '~/components/WorldMap';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { parseLang } from '~/lib/params';
import { regionFlag, regionLabel } from '~/lib/regions';
import { siteCard, socialMeta } from '~/lib/social';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { counts } = await apiGet<{ counts: Record<string, number> }>(`/regions?lang=${lang}`);
  return data(
    { lang, counts, origin: env.publicOrigin },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600' } },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const url = `${loaderData.origin}/regions/${loaderData.lang}`;
  return [
    { title: `${t.regionsTitle} | is.gratis` },
    { name: 'description', content: t.regionsIntro },
    { tagName: 'link', rel: 'canonical', href: url },
    ...socialMeta({
      origin: loaderData.origin,
      lang: loaderData.lang,
      title: t.regionsTitle,
      description: t.regionsIntro,
      url,
      image: siteCard(loaderData.lang),
      imageAlt: t.tagline,
    }),
  ];
};

/** More pages, deeper green: 2 to 8 on Mantine's colour scale. */
function shade(count: number, max: number): string {
  const step = 3 + Math.round((count / Math.max(max, 1)) * 5);
  return `var(--mantine-color-green-${Math.min(step, 8)})`;
}

export default function Regions({ loaderData }: Route.ComponentProps) {
  const { lang, counts } = loaderData;
  const t = messages(lang);
  const navigate = useNavigate();
  const max = Math.max(0, ...Object.values(counts));
  const fills = Object.fromEntries(
    Object.entries(counts).map(([region, count]) => [region, shade(count, max)]),
  ) as Partial<Record<Region, string>>;
  const ordered = [...REGIONS].sort(
    (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || regionLabel(a, lang).localeCompare(regionLabel(b, lang), lang),
  );
  const href = (region: Region) => `/regions/${lang}/${region.toLowerCase()}`;

  return (
    <Container size="md">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{t.regionsTitle}</Title>
          <Text c="dimmed">{t.regionsIntro}</Text>
        </Stack>
        <Card withBorder padding="sm">
          <WorldMap
            fills={{ ...fills, EU: undefined }}
            label={t.mapLabel}
            hrefFor={href}
            titleFor={(region) => `${regionLabel(region, lang)}: ${t.pagesCount(counts[region] ?? 0)}`}
          />
        </Card>
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="xs">
          {ordered.map((region) => (
            <Card
              key={region}
              withBorder
              padding="sm"
              style={{ cursor: 'pointer', opacity: counts[region] ? 1 : 0.6 }}
              onClick={() => navigate(href(region))}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Anchor component={Link} to={href(region)} c="inherit" fw={600}>
                  {regionFlag(region)} {regionLabel(region, lang)}
                </Anchor>
                <Badge variant="light" color={counts[region] ? 'green' : 'gray'}>
                  {counts[region] ?? 0}
                </Badge>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
