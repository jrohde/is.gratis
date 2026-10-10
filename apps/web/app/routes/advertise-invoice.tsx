import { Alert, Anchor, Badge, Button, Card, Container, Group, Stack, Table, Text, Title } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { data, Link, useSearchParams } from 'react-router';
import type { Route } from './+types/advertise-invoice';
import { api, ClientApiError } from '~/lib/api.client';
import { ApiError, apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

interface InvoiceView {
  invoice: {
    number: string;
    token: string;
    status: 'open' | 'paid' | 'void';
    customerName: string;
    lines: Array<{ description: string; amountCents: number }>;
    subtotalCents: number;
    vatRateBps: number;
    vatNote: string | null;
    vatCents: number;
    totalCents: number;
    issuedAt: string;
    dueAt: string;
    paidAt: string | null;
  };
  payOnline: boolean;
  seller: { companyName: string; iban: string };
}

export async function loader({ params }: Route.LoaderArgs) {
  try {
    return data(await apiGet<InvoiceView>(`/invoices/${encodeURIComponent(params.token ?? '')}`), {
      headers: { 'Cache-Control': CACHE.none },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;
export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.invoice.number ?? ''} · is.gratis` },
  { name: 'robots', content: 'noindex' },
];

const STATUS_COLORS = { open: 'yellow', paid: 'green', void: 'gray' } as const;

/** Amounts on an invoice always show their cents. */
const formatPrice = (cents: number, lang: string) =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100);

/** An invoice behind its secret link: what it is for, pay online, or transfer by hand. */
export default function AdvertiseInvoice({ loaderData }: Route.ComponentProps) {
  const lang = useUiLang();
  const t = messages(lang);
  const [search] = useSearchParams();
  const { invoice, payOnline, seller } = loaderData;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>('POST', `/invoices/${invoice.token}/pay`);
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setBusy(false);
    }
  }

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Group justify="space-between" align="baseline">
          <Title order={1} size="h2">
            {t.invoiceTitle} {invoice.number}
          </Title>
          <Badge color={STATUS_COLORS[invoice.status]} size="lg">
            {t.invoiceStatus[invoice.status]}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {invoice.customerName} · {t.invoiceIssued(formatDate(invoice.issuedAt, lang))} ·{' '}
          {invoice.status === 'paid' && invoice.paidAt
            ? t.invoicePaidOn(formatDate(invoice.paidAt, lang))
            : t.invoiceDue(formatDate(invoice.dueAt, lang))}
        </Text>
        {search.get('returned') && invoice.status === 'open' && (
          <Alert color="blue" variant="light">
            {t.invoiceProcessing}
          </Alert>
        )}
        <Card withBorder padding="md">
          <Table>
            <Table.Tbody>
              {invoice.lines.map((line, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{line.description}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {formatPrice(line.amountCents, lang)}
                  </Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td c="dimmed">{t.invoiceSubtotal}</Table.Td>
                <Table.Td ta="right">{formatPrice(invoice.subtotalCents, lang)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td c="dimmed">{t.invoiceVat(`${invoice.vatRateBps / 100}%`)}</Table.Td>
                <Table.Td ta="right">{formatPrice(invoice.vatCents, lang)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={800}>{t.invoiceTotal}</Table.Td>
                <Table.Td ta="right" fw={800}>
                  {formatPrice(invoice.totalCents, lang)}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          {invoice.vatNote && (
            <Text size="xs" c="dimmed" mt="xs">
              {invoice.vatNote}
            </Text>
          )}
        </Card>
        {invoice.status === 'open' && (
          <Card withBorder padding="md">
            <Stack gap="sm">
              {payOnline && (
                <div>
                  <Button size="md" onClick={() => void pay()} loading={busy}>
                    {t.invoicePayNow(formatPrice(invoice.totalCents, lang))}
                  </Button>
                  <Text size="xs" c="dimmed" mt={4}>
                    {t.invoicePayMethods}
                  </Text>
                </div>
              )}
              {seller.iban && (
                <Text size="sm">{t.invoiceTransfer(formatPrice(invoice.totalCents, lang), seller.iban, seller.companyName, invoice.number)}</Text>
              )}
              {error && <Alert color="red">{error}</Alert>}
            </Stack>
          </Card>
        )}
        <Group gap="md">
          <Button component="a" href={`/api/invoices/${invoice.token}/pdf`} variant="default" leftSection={<IconDownload size={16} />}>
            {t.invoicePdf}
          </Button>
          <Anchor component={Link} to={`/advertise/portal?lang=${lang}`} size="sm">
            {t.portalLink} →
          </Anchor>
        </Group>
      </Stack>
    </Container>
  );
}
