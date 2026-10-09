import { Anchor, Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEffect } from 'react';
import { data, Link } from 'react-router';
import { countOfferImpressions } from '~/lib/views';
import { stampSvg, type SponsoredOffer } from '@isgratis/types';
import type { Route } from './+types/offers';
import { ClaimLink } from '~/components/Claim';
import { apiGet } from '~/lib/api.server';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { parseLang } from '~/lib/params';
import { regionFlag } from '~/lib/regions';

type Offer = SponsoredOffer & { page: { lang: Route.ComponentProps['loaderData']['lang']; slug: string; title: string; plural?: boolean; emoji?: string } };

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const { offers } = await apiGet<{ offers: Offer[] }>(`/offers?lang=${lang}`);
  return data({ lang, offers, origin: env.publicOrigin }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  return [
    { title: `${t.offersTitle} | is.gratis` },
    { name: 'description', content: t.offersIntro },
    { tagName: 'link', rel: 'canonical', href: `${loaderData.origin}/offers/${loaderData.lang}` },
  ];
};

/** Every reviewed free offer, clearly labelled as sponsored, each with the stamp it earned. */
export default function Offers({ loaderData }: Route.ComponentProps) {
  const { lang, offers } = loaderData;
  const t = messages(lang);
  const ids = offers.map((offer) => offer.id).join(',');
  useEffect(() => {
    // The API takes six at a time.
    const list = ids ? ids.split(',') : [];
    for (let i = 0; i < list.length; i += 6) countOfferImpressions(list.slice(i, i + 6));
  }, [ids]);
  return (
    <Container size="md">
      <Stack gap="lg">
        <Group justify="space-between" align="start">
          <Stack gap={4}>
            <Title order={1}>{t.offersTitle}</Title>
            <Text c="dimmed">{t.offersIntro}</Text>
          </Stack>
          <Badge color="yellow" variant="filled" c="dark">
            {t.sponsoredBadge}
          </Badge>
        </Group>
        {offers.length === 0 ? (
          <Text c="dimmed">{t.offersEmpty}</Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {offers.map((offer) => (
              <Card key={offer.id} withBorder padding="md" pos="relative">
                <span
                  title={t.stampTitle}
                  style={{ position: 'absolute', top: 10, right: 10, width: 72, height: 72 }}
                  dangerouslySetInnerHTML={{ __html: stampSvg(lang, { size: 72, idPrefix: `offer-${offer.id}` }) }}
                />
                <Stack gap={6} pr={80} mih={72}>
                  <Text fw={800}>{offer.title}</Text>
                  <Text size="sm">{offer.description}</Text>
                  <Text size="xs" c="dimmed">
                    {offer.region ? `${regionFlag(offer.region)} ` : ''}
                    {offer.advertiserName}
                  </Text>
                </Stack>
                <Group justify="space-between" mt="sm" wrap="nowrap" gap="xs">
                  <Text size="sm" c="dimmed" style={{ minWidth: 0 }}>
                    <ClaimLink {...offer.page} />
                  </Text>
                  <Button component="a" href={`/api/offers/${offer.id}/go`} rel="sponsored noopener" target="_blank" size="xs" color="dark">
                    {t.viewOffer}
                  </Button>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}
        <Text size="sm" c="dimmed">
          {t.sponsoredDisclaimer}{' '}
          <Anchor component={Link} to={`/advertise?lang=${lang}`}>
            {t.advertiseCta}
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
}
