import { Anchor, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { data, Link, redirect } from 'react-router';
import { REGIONS, VERDICTS, type Region, type RegionEntry } from '@isgratis/types';
import type { Route } from './+types/region';
import { Markdown } from '~/components/Markdown';
import { VerdictBadge } from '~/components/VerdictBadge';
import { WorldMap } from '~/components/WorldMap';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { parseLang } from '~/lib/params';
import { regionFlag, regionLabel } from '~/lib/regions';
import { siteCard, socialMeta } from '~/lib/social';
import { VERDICT_COLORS } from '~/theme';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const region = params.code?.toUpperCase() as Region;
  if (!REGIONS.includes(region)) throw data(null, { status: 404 });
  if (params.code !== region.toLowerCase()) throw redirect(`/regions/${lang}/${region.toLowerCase()}`, { status: 301 });
  const { pages } = await apiGet<{ pages: RegionEntry[] }>(`/regions/${region}?lang=${lang}`);
  return data(
    { lang, region, pages, origin: env.publicOrigin },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600' } },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const name = regionLabel(loaderData.region, loaderData.lang);
  const url = `${loaderData.origin}/regions/${loaderData.lang}/${loaderData.region.toLowerCase()}`;
  const description = t.regionIntro(loaderData.pages.length);
  return [
    { title: `${t.regionTitle(name)} | is.gratis` },
    { name: 'description', content: description },
    { tagName: 'link', rel: 'canonical', href: url },
    ...(loaderData.pages.length === 0 ? [{ name: 'robots', content: 'noindex' }] : []),
    ...socialMeta({
      origin: loaderData.origin,
      lang: loaderData.lang,
      title: t.regionTitle(name),
      description,
      url,
      image: siteCard(loaderData.lang),
      imageAlt: t.regionTitle(name),
    }),
  ];
};

/** Regional text without footnote markers and with [[links]] as plain words. */
function readable(text: string): string {
  return text
    .replace(/\[\^[a-z0-9-]+\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
}

export default function RegionRoute({ loaderData }: Route.ComponentProps) {
  const { lang, region, pages } = loaderData;
  const t = messages(lang);
  const name = regionLabel(region, lang);
  const groups = VERDICTS.map((verdict) => ({ verdict, pages: pages.filter((page) => page.verdict === verdict) })).filter(
    (group) => group.pages.length > 0,
  );

  return (
    <Container size="md">
      <Stack gap="lg">
        <Group gap="lg" wrap="nowrap" align="center">
          <Text fz={56} lh={1} aria-hidden>
            {regionFlag(region)}
          </Text>
          <Stack gap={4}>
            <Title order={1}>{t.regionTitle(name)}</Title>
            <Text c="dimmed">{pages.length ? t.regionIntro(pages.length) : t.regionEmpty}</Text>
          </Stack>
        </Group>
        {region !== 'WORLD' && (
          <WorldMap
            fills={{ [region]: 'var(--mantine-color-green-6)' }}
            selected={region}
            label={name}
            titleFor={(code) => regionLabel(code, lang)}
            focus={[region]}
            maxWidth={560}
          />
        )}
        {groups.map((group) => (
          <section key={group.verdict}>
            <Group gap="xs" mb="xs">
              <VerdictBadge verdict={group.verdict} lang={lang} size="lg" />
              <Text c="dimmed" size="sm">
                {t.pagesCount(group.pages.length)}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {group.pages.map((page) => (
                <Card
                  key={page.slug}
                  withBorder
                  padding="md"
                  style={{ borderLeft: `4px solid var(--mantine-color-${VERDICT_COLORS[page.verdict]}-6)` }}
                >
                  <Anchor component={Link} to={`/${lang}/${page.slug}`} c="inherit" fw={700} mb={4} display="block">
                    {page.emoji ? `${page.emoji} ` : ''}
                    {t.question(page.title)}
                  </Anchor>
                  <Markdown>{readable(page.text)}</Markdown>
                </Card>
              ))}
            </SimpleGrid>
          </section>
        ))}
        <Anchor component={Link} to={`/regions/${lang}`} size="sm">
          ← {t.regionsTitle}
        </Anchor>
      </Stack>
    </Container>
  );
}

