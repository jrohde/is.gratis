import { Alert, Anchor, Badge, Button, Card, Container, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ClientApiError } from '~/lib/api.client';
import { data } from 'react-router';
import type { Route } from './+types/advertise-stats';
import { ApiError, apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { formatDate, formatNumber, formatPrice, messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

interface StatsRow {
  impressions: number;
  clicks: number;
  mailSends: number;
  mailClicks: number;
  pageViews: number;
}

interface Stats {
  offer: {
    lang: string;
    slug: string;
    title: string;
    advertiserName: string;
    status: string;
    priceCents: number | null;
    exclusive: boolean;
    inMailing: boolean;
    startsAt: string | null;
    endsAt: string | null;
  };
  days: Array<StatsRow & { day: string }>;
  totals: StatsRow;
  reach: number | null;
  averageClickRate: number | null;
  costPerClickCents: number | null;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const stats = await apiGet<Stats>(`/sponsors/stats/${encodeURIComponent(params.token ?? '')}`);
    return data({ stats }, { headers: { 'Cache-Control': CACHE.none } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;
export const meta: Route.MetaFunction = () => [{ title: 'Statistieken · is.gratis' }, { name: 'robots', content: 'noindex' }];

/** The advertiser's view of their offer: shown, clicked, and the click rate. No account needed. */
export default function AdvertiseStats({ loaderData }: Route.ComponentProps) {
  const lang = useUiLang();
  const t = messages(lang);
  const { offer, days, totals, reach, averageClickRate, costPerClickCents } = loaderData.stats;
  const token = useParams().token ?? '';
  const rate = totals.impressions ? totals.clicks / totals.impressions : 0;
  const mailRate = totals.mailSends ? totals.mailClicks / totals.mailSends : 0;
  const showMail = offer.inMailing || totals.mailSends > 0;
  const tiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: t.statsShown, value: formatNumber(totals.impressions, lang), ...(reach !== null ? { hint: t.statsReach(percent(reach)) } : {}) },
    { label: t.statsClicks, value: formatNumber(totals.clicks, lang) },
    {
      label: t.statsRate,
      value: percent(rate),
      ...(averageClickRate !== null ? { hint: t.statsAverage(percent(averageClickRate)) } : {}),
    },
    ...(showMail
      ? [
          { label: t.statsMailSends, value: formatNumber(totals.mailSends, lang) },
          { label: t.statsMailClicks, value: formatNumber(totals.mailClicks, lang), hint: t.statsMailRate(percent(mailRate)) },
        ]
      : []),
    ...(costPerClickCents !== null ? [{ label: t.statsCostPerClick, value: formatPrice(costPerClickCents, lang) }] : []),
  ];
  return (
    <Container size="sm">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1} size="h2">
            {offer.title}
          </Title>
          <Group gap="xs">
            <Badge>{t.bookingStatus[offer.status] ?? offer.status}</Badge>
            <Text size="sm" c="dimmed">
              /{offer.lang}/{offer.slug} · {offer.advertiserName}
              {offer.priceCents !== null ? ` · ${t.portalPerMonth(formatPrice(offer.priceCents, lang))}` : ''}
              {offer.startsAt ? ` · ${formatDate(offer.startsAt, lang)}` : ''}
              {offer.endsAt ? ` – ${formatDate(offer.endsAt, lang)}` : ''}
            </Text>
          </Group>
        </Stack>
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {tiles.map((tile) => (
            <Card key={tile.label} withBorder padding="md">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {tile.label}
              </Text>
              <Text fz={28} fw={900}>
                {tile.value}
              </Text>
              {tile.hint && (
                <Text size="xs" c="dimmed">
                  {tile.hint}
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
        {days.length === 0 ? (
          <Alert color="gray">{t.statsEmpty}</Alert>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.statsDay}</Table.Th>
                <Table.Th ta="right">{t.statsPageViews}</Table.Th>
                <Table.Th ta="right">{t.statsShown}</Table.Th>
                <Table.Th ta="right">{t.statsClicks}</Table.Th>
                {showMail && <Table.Th ta="right">{t.statsMailClicks}</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...days].reverse().map((day) => (
                <Table.Tr key={day.day}>
                  <Table.Td>{formatDate(day.day, lang)}</Table.Td>
                  <Table.Td ta="right">{formatNumber(day.pageViews, lang)}</Table.Td>
                  <Table.Td ta="right">{formatNumber(day.impressions, lang)}</Table.Td>
                  <Table.Td ta="right">{formatNumber(day.clicks, lang)}</Table.Td>
                  {showMail && <Table.Td ta="right">{formatNumber(day.mailClicks, lang)}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {days.length > 0 && (
          <div>
            <Button component="a" href={`/api/sponsors/stats/${token}/csv`} variant="default" size="xs">
              {t.statsCsv}
            </Button>
          </div>
        )}
        <Renew />
        <Text size="xs" c="dimmed">
          {t.statsPrivacy}
        </Text>
        <Anchor component={Link} to={`/advertise/portal?lang=${lang}`} size="sm">
          {t.portalLink} →
        </Anchor>
      </Stack>
    </Container>
  );
}

interface Options {
  current: { slug: string; views30: number; priceCents: number };
  busier: Array<{ slug: string; title: string; views30: number; priceCents: number }>;
}

/** Renew on the same page, or move the offer to a busier one: a new request at today's price. */
function Renew() {
  const lang = useUiLang();
  const t = messages(lang);
  const { token } = useParams();
  const [options, setOptions] = useState<Options | null>(null);
  const [done, setDone] = useState<{ link: string; slug: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Options>('GET', `/sponsors/stats/${token}/options`).then(setOptions).catch(() => setOptions(null));
  }, [token]);
  if (!options) return null;

  async function renew(slug?: string) {
    setError(null);
    try {
      const result = await api<{ statsToken: string; slug: string }>('POST', `/sponsors/stats/${token}/renew`, slug ? { slug } : {});
      setDone({ link: `/advertise/stats/${result.statsToken}?lang=${lang}`, slug: result.slug });
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    }
  }

  if (done) {
    return (
      <Alert color="green">
        {t.renewDone}{' '}
        <Anchor component={Link} to={done.link} fw={700}>
          {t.statsLink}
        </Anchor>
      </Alert>
    );
  }
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Title order={2} size="h4">
          {t.renewTitle}
        </Title>
        <Group justify="space-between">
          <Text size="sm">
            /{options.current.slug} · {t.viewsMonth(formatNumber(options.current.views30, lang))}
          </Text>
          <Button size="xs" onClick={() => void renew()}>
            {t.renewFor(formatPrice(options.current.priceCents, lang))}
          </Button>
        </Group>
        {options.busier.length > 0 && (
          <>
            <Text size="sm" c="dimmed">
              {t.upgradeIntro}
            </Text>
            {options.busier.map((page) => (
              <Group key={page.slug} justify="space-between">
                <Text size="sm">
                  {page.title} · {t.viewsMonth(formatNumber(page.views30, lang))}
                </Text>
                <Button size="xs" variant="light" onClick={() => void renew(page.slug)}>
                  {t.renewFor(formatPrice(page.priceCents, lang))}
                </Button>
              </Group>
            ))}
          </>
        )}
        {error && <Alert color="red">{error}</Alert>}
      </Stack>
    </Card>
  );
}
