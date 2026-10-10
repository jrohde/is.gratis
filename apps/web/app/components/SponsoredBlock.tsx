import { Anchor, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { countOfferImpressions } from '~/lib/views';
import { OFFER_SLOTS, regionReaches, stampSvg, type Language, type Region, type SponsoredOffer } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { ReportModal } from './ReportButton';

/** A new order for every reader: each offer is on top as often as the others. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * One sponsored offer as readers see it, with the stamp it earned. Also the preview in the
 * request form, so advertisers see exactly what they buy.
 */
export function SponsoredOfferCard({
  offer,
  lang,
  onReport,
  preview = false,
}: {
  offer: Pick<SponsoredOffer, 'id' | 'title' | 'description' | 'advertiserName'>;
  lang: Language;
  onReport?: () => void;
  /** In the request form: nothing to click yet. */
  preview?: boolean;
}) {
  const t = messages(lang);
  return (
    <Card withBorder padding="md" pos="relative">
      {/* Only reviewed offers are shown, so each carries the stamp. */}
      <span
        title={t.stampTitle}
        style={{ position: 'absolute', top: 8, right: 10, width: 88, height: 88 }}
        dangerouslySetInnerHTML={{ __html: stampSvg(lang, { size: 88, idPrefix: `stamp-${offer.id}` }) }}
      />
      <Stack gap={6} pr={96} mih={88}>
        <Text fw={700}>{offer.title}</Text>
        <Text size="sm">{offer.description}</Text>
        <Group justify="space-between" mt="xs">
          <Text size="xs" c="dimmed">
            {offer.advertiserName}
            {onReport && (
              <>
                {' · '}
                <Anchor component="button" type="button" size="xs" c="dimmed" onClick={onReport}>
                  {t.offerReport}
                </Anchor>
              </>
            )}
          </Text>
          <Button
            component="a"
            href={preview ? undefined : `/api/offers/${offer.id}/go`}
            rel="sponsored noopener"
            target="_blank"
            size="xs"
            color="dark"
          >
            {t.viewOffer}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

/**
 * The paid "free here" block. Always visually separate from the answer and always labelled,
 * as advertising rules (and the trust of readers) require.
 */
export function SponsoredBlock({
  offers,
  lang,
  slug,
  region,
}: {
  offers: SponsoredOffer[];
  lang: Language;
  slug: string;
  region: Region;
}) {
  const t = messages(lang);
  const visible = offers.filter((offer) => regionReaches(offer.region, region)).slice(0, OFFER_SLOTS);
  const advertiseHref = `/advertise?lang=${lang}&slug=${slug}`;
  const visibleIds = visible.map((offer) => offer.id).join(',');
  // The page is cached for everyone, so the order is drawn in the browser, after hydration.
  const [order, setOrder] = useState<string[] | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  useEffect(() => {
    if (!visibleIds) return;
    countOfferImpressions(visibleIds.split(','));
    setOrder(shuffled(visibleIds.split(',')));
  }, [visibleIds]);
  const ordered = order ? order.map((id) => visible.find((offer) => offer.id === id)!).filter(Boolean) : visible;

  if (visible.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        <Anchor component={Link} to={advertiseHref} c="dimmed" underline="always">
          {t.advertiseCta}
        </Anchor>
      </Text>
    );
  }

  return (
    <Card withBorder padding="lg" bg="var(--mantine-color-yellow-light)" component="aside" aria-label={t.sponsoredTitle}>
      <Group justify="space-between" mb="xs">
        <Title order={2} size="h4">
          {t.sponsoredTitle}
        </Title>
        <Badge color="yellow" variant="filled" c="dark">
          {t.sponsoredBadge}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        {t.sponsoredDisclaimer}{' '}
        <Anchor component={Link} to={`/offers/${lang}`} size="xs">
          {t.offersTitle} →
        </Anchor>
      </Text>
      <SimpleGrid cols={{ base: 1, sm: visible.length > 1 ? 2 : 1 }}>
        {ordered.map((offer) => (
          <SponsoredOfferCard key={offer.id} offer={offer} lang={lang} onReport={() => setReporting(offer.id)} />
        ))}
      </SimpleGrid>
      {reporting && <ReportModal lang={lang} target={{ offerId: reporting }} opened onClose={() => setReporting(null)} />}
    </Card>
  );
}
