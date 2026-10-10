import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { IconCheck, IconClock, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Language } from '@isgratis/types';
import type { Route } from './+types/advertise-portal';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { formatDate, formatNumber, formatPrice, messages } from '~/lib/i18n';
import { regionFlag } from '~/lib/regions';
import { useUiLang } from '~/lib/use-lang';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'Portaal · is.gratis' }, { name: 'robots', content: 'noindex' }];

interface PortalInvoice {
  number: string;
  token: string;
  status: 'open' | 'paid' | 'void';
  totalCents: number;
  issuedAt: string;
  dueAt: string;
}

const INVOICE_COLORS = { open: 'yellow', paid: 'green', void: 'gray' } as const;

function Invoices({ invoices, lang }: { invoices: PortalInvoice[]; lang: Language }) {
  const t = messages(lang);
  if (invoices.length === 0) return null;
  return (
    <Card withBorder padding="lg">
      <Stack gap="xs">
        <Title order={2} size="h4">
          {t.invoicesTitle}
        </Title>
        {invoices.map((invoice) => (
          <Group key={invoice.number} justify="space-between" wrap="nowrap">
            <Anchor component={Link} to={`/advertise/invoice/${invoice.token}?lang=${lang}`} fw={600}>
              {invoice.number}
            </Anchor>
            <Text size="sm" c="dimmed">
              {formatDate(invoice.issuedAt, lang)}
            </Text>
            <Text size="sm">{formatPrice(invoice.totalCents, lang)}</Text>
            <Badge color={INVOICE_COLORS[invoice.status]} variant="light">
              {t.invoiceStatus[invoice.status]}
            </Badge>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

interface PortalOffer {
  id: string;
  statsToken: string;
  lang: Language;
  slug: string;
  claim: string;
  title: string;
  description: string;
  url: string;
  region: string | null;
  status: 'pending' | 'active' | 'rejected' | 'expired';
  priceCents: number | null;
  exclusive: boolean;
  awaitingPayment: boolean;
  inMailing: boolean;
  mailingPriceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  editor: {
    decision: 'approve' | 'reject' | 'unsure';
    notes: string;
    suggestion?: { title?: string; description?: string };
  } | null;
  impressions: number;
  clicks: number;
}

const STATUS_COLORS = { pending: 'yellow', active: 'green', rejected: 'red', expired: 'gray' } as const;

/** Where a request stands, step by step, with the reason when something was not approved. */
function Steps({ offer, lang }: { offer: PortalOffer; lang: Language }) {
  const t = messages(lang);
  const steps = t.portalSteps;
  const done = <IconCheck size={12} />;
  const waiting = <IconClock size={12} />;
  const failed = <IconX size={12} />;
  const approved = offer.status === 'active' || offer.status === 'expired';
  const now = Date.now();
  const started = approved && !offer.awaitingPayment && (!offer.startsAt || new Date(offer.startsAt).getTime() <= now);
  // The step the request is at: the ones before it are done.
  const hasEditorStep = Boolean(offer.editor) || offer.status === 'pending';
  const approvalStep = hasEditorStep ? 2 : 1;
  const active =
    offer.status === 'rejected' ? approvalStep : approved ? (started ? approvalStep + 1 : approvalStep) : offer.editor ? 2 : 1;
  return (
    <Timeline active={active} bulletSize={20} lineWidth={2} color={offer.status === 'rejected' ? 'red' : 'green'}>
      <Timeline.Item bullet={done} title={steps.received}>
        <Text size="xs" c="dimmed">
          {formatDate(offer.createdAt, lang)}
        </Text>
      </Timeline.Item>
      {/* Offers approved before the editors existed, or while they were off, skip this step. */}
      {(offer.editor || offer.status === 'pending') && (
        <Timeline.Item
          bullet={offer.editor ? (offer.editor.decision === 'reject' ? failed : done) : waiting}
          title={steps.editor}
        >
          {offer.editor ? (
            <Stack gap={4}>
              <Badge
                size="sm"
                variant="light"
                color={offer.editor.decision === 'approve' ? 'green' : offer.editor.decision === 'reject' ? 'red' : 'orange'}
              >
                {t.portalEditor[offer.editor.decision]}
              </Badge>
              <Text size="sm">{offer.editor.notes}</Text>
              {offer.editor.suggestion && (
                <Text size="sm" c="dimmed">
                  {t.portalSuggestion}{' '}
                  {[offer.editor.suggestion.title, offer.editor.suggestion.description].filter(Boolean).join(' — ')}
                </Text>
              )}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              {steps.editorBusy}
            </Text>
          )}
        </Timeline.Item>
      )}
      <Timeline.Item bullet={offer.status === 'rejected' ? failed : approved ? done : waiting} title={steps.approval}>
        <Text size="xs" c="dimmed">
          {offer.status === 'rejected' ? steps.rejected : approved ? steps.approved : steps.approvalWaiting}
        </Text>
      </Timeline.Item>
      {offer.awaitingPayment && (
        <Timeline.Item bullet={waiting} title={steps.payment}>
          <Text size="xs" c="dimmed">
            {steps.paymentWaiting}
          </Text>
        </Timeline.Item>
      )}
      {offer.status !== 'rejected' && (
        <Timeline.Item bullet={started && !offer.awaitingPayment ? done : waiting} title={steps.visible}>
          <Text size="xs" c="dimmed">
            {offer.status === 'expired' && offer.endsAt
              ? steps.ended(formatDate(offer.endsAt, lang))
              : offer.startsAt && offer.endsAt
                ? steps.visibleUntil(formatDate(offer.startsAt, lang), formatDate(offer.endsAt, lang))
                : offer.startsAt
                  ? steps.visibleFrom(formatDate(offer.startsAt, lang))
                  : started
                    ? steps.visibleNow
                    : ''}
          </Text>
        </Timeline.Item>
      )}
    </Timeline>
  );
}

function OfferCard({ offer, lang }: { offer: PortalOffer; lang: Language }) {
  const t = messages(lang);
  const rate = offer.impressions ? (offer.clicks / offer.impressions) * 100 : 0;
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={800}>{offer.title}</Text>
            <Text size="sm">{offer.description}</Text>
            <Text size="xs" c="dimmed">
              <Anchor component={Link} to={`/${offer.lang}/${offer.slug}`} size="xs">
                {offer.claim}
              </Anchor>
              {offer.region ? ` · ${regionFlag(offer.region as never)} ${offer.region}` : ` · ${t.regionEverywhere}`}
            </Text>
          </Stack>
          <Badge color={STATUS_COLORS[offer.status]}>{t.bookingStatus[offer.status] ?? offer.status}</Badge>
        </Group>
        <Text size="sm">
          {offer.priceCents !== null && t.portalPerMonth(formatPrice(offer.priceCents, lang))}
          {offer.exclusive && ` · ${t.exclusiveBadge}`}
          {offer.inMailing &&
            offer.mailingPriceCents !== null &&
            ` ${t.portalMailing(formatPrice(offer.mailingPriceCents, lang))}`}
        </Text>
        <Steps offer={offer} lang={lang} />
        {(offer.status === 'active' || offer.status === 'expired') && (
          <SimpleGrid cols={3}>
            {[
              [t.statsShown, formatNumber(offer.impressions, lang)],
              [t.statsClicks, formatNumber(offer.clicks, lang)],
              [t.statsRate, `${rate.toFixed(1)}%`],
            ].map(([label, value]) => (
              <div key={label}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {label}
                </Text>
                <Text fz={22} fw={900}>
                  {value}
                </Text>
              </div>
            ))}
          </SimpleGrid>
        )}
        <Anchor component={Link} to={`/advertise/stats/${offer.statsToken}?lang=${lang}`} size="sm">
          {t.portalDetails} →
        </Anchor>
      </Stack>
    </Card>
  );
}

function LoginForm({ lang }: { lang: Language }) {
  const t = messages(lang);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('busy');
    setError(null);
    try {
      await api('POST', '/advertisers/login', { email, lang });
      setState('sent');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setState('idle');
    }
  }
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Text>{t.portalLoginIntro}</Text>
        {state === 'sent' ? (
          <Alert color="green" variant="light">
            {t.portalLinkSent}
          </Alert>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <Group align="end" gap="xs">
              <TextInput
                type="email"
                required
                label={t.email}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <Button type="submit" loading={state === 'busy'}>
                {t.portalSendLink}
              </Button>
            </Group>
          </form>
        )}
        {error && <Alert color="red">{error}</Alert>}
      </Stack>
    </Card>
  );
}

/** Advertisers sign in with a link by mail and see all their offers here. */
export default function AdvertisePortal() {
  const lang = useUiLang();
  const t = messages(lang);
  const [me, setMe] = useState<{ email: string; offers: PortalOffer[]; invoices: PortalInvoice[] } | null | undefined>(undefined);
  const load = () =>
    api<{ email: string; offers: PortalOffer[]; invoices: PortalInvoice[] }>('GET', '/advertisers/me')
      .then(setMe)
      .catch(() => setMe(null));
  useEffect(() => {
    void load();
  }, []);

  async function logout() {
    await api('POST', '/advertisers/logout').catch(() => {});
    setMe(null);
  }

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{t.portalTitle}</Title>
          <Text c="dimmed">{t.portalIntro}</Text>
        </Stack>
        {me === undefined ? (
          <Loader />
        ) : me === null ? (
          <LoginForm lang={lang} />
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {t.portalSignedInAs(me.email)}
              </Text>
              <Group gap="xs">
                <Button component={Link} to={`/advertise?lang=${lang}`} size="xs" variant="light">
                  {t.portalNewOffer}
                </Button>
                <Button size="xs" variant="default" onClick={() => void logout()}>
                  {t.portalLogout}
                </Button>
              </Group>
            </Group>
            {me.offers.length === 0 ? (
              <Text c="dimmed">{t.portalEmpty}</Text>
            ) : (
              me.offers.map((offer) => <OfferCard key={offer.id} offer={offer} lang={lang} />)
            )}
            <Invoices invoices={me.invoices} lang={lang} />
          </>
        )}
      </Stack>
    </Container>
  );
}
