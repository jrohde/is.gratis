import { Alert, Anchor, Button, Card, Checkbox, Container, Group, List, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { isLanguage, LANGUAGES, REGIONS, toSlug, type Language, type Region, type SponsorQuote } from '@isgratis/types';
import type { Route } from './+types/advertise';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { formatNumber, formatPrice, LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { regionFlag, regionLabel } from '~/lib/regions';
import { useUiLang } from '~/lib/use-lang';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.short });
export const meta: Route.MetaFunction = () => [{ title: 'Adverteren · is.gratis' }];

export default function Advertise() {
  const uiLang = useUiLang();
  const t = messages(uiLang);
  const [search] = useSearchParams();
  const initialLang = search.get('lang');
  const [form, setForm] = useState({
    lang: (initialLang && isLanguage(initialLang) ? initialLang : uiLang) as Language,
    slug: search.get('slug') ?? '',
    region: null as Region | null,
    advertiserName: '',
    contactEmail: '',
    title: '',
    description: '',
    url: 'https://',
    message: '',
    mailing: false,
  });
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<SponsorQuote | null>(null);
  const [statsLink, setStatsLink] = useState<string | null>(null);
  const slug = toSlug(form.slug);
  // The price follows the page's views; it is fixed when the request is sent.
  useEffect(() => {
    if (!slug) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(() => {
      api<SponsorQuote>('GET', `/sponsors/quote?lang=${form.lang}&slug=${slug}${form.region ? `&region=${form.region}` : ''}`)
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [form.lang, slug, form.region]);
  const text = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: event.currentTarget.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('busy');
    setError(null);
    try {
      const created = await api<{ statsToken: string }>('POST', '/sponsors/requests', {
        ...form,
        slug: toSlug(form.slug),
        message: form.message.trim() || undefined,
      });
      setStatsLink(`/advertise/stats/${created.statsToken}?lang=${uiLang}`);
      setStatus('done');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setStatus('idle');
    }
  }

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Group justify="space-between" align="baseline">
          <Title order={1}>{t.advertiseTitle}</Title>
          <Anchor component={Link} to={`/advertise/portal?lang=${uiLang}`} size="sm">
            {t.portalLink} →
          </Anchor>
        </Group>
        <Text size="lg">{t.advertiseIntro}</Text>
        <List spacing="xs">
          {t.advertiseRules.map((rule) => (
            <List.Item key={rule}>{rule}</List.Item>
          ))}
        </List>
        {status === 'done' ? (
          <Alert color="green">
            <Stack gap="xs">
              <Text>{t.advertiseSubmitted}</Text>
              <Text size="sm">{t.advertiseMailSent}</Text>
              {statsLink && (
                <Text size="sm">
                  {t.statsLinkHelp}{' '}
                  <Anchor component={Link} to={statsLink} fw={700}>
                    {t.statsLink}
                  </Anchor>
                </Text>
              )}
            </Stack>
          </Alert>
        ) : (
          <Card withBorder padding="lg">
            <form onSubmit={(event) => void submit(event)}>
              <Stack>
                <Group grow>
                  <Select
                    label={t.pageLanguage}
                    value={form.lang}
                    allowDeselect={false}
                    data={LANGUAGES.map((lang) => ({ value: lang, label: LANGUAGE_NAMES[lang] }))}
                    onChange={(value) => value && setForm({ ...form, lang: value as Language })}
                  />
                  <TextInput label={t.pageSlug} required value={form.slug} onChange={text('slug')} maxLength={64} />
                </Group>
                {quote && (
                  <Alert color="green" variant="light" title={t.quoteTitle}>
                    <Text size="sm" fw={600}>
                      {t.quoteText(formatNumber(quote.views30, uiLang), formatPrice(quote.priceCents, uiLang))}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {quote.views30 === 0 ? t.quoteMissing : t.quoteHow}
                    </Text>
                    <Text size="xs" mt={4} fw={600} c={quote.slotsFree > 0 ? undefined : 'orange.8'}>
                      {quote.slotsFree > 0 ? t.slotsFree(quote.slotsFree) : t.slotsNone}
                    </Text>
                  </Alert>
                )}
                <Select
                  label={t.regionOptional}
                  placeholder={t.regionEverywhere}
                  clearable
                  searchable
                  value={form.region}
                  data={REGIONS.map((region) => ({ value: region, label: `${regionFlag(region)} ${regionLabel(region, uiLang)}` }))}
                  onChange={(value) => setForm({ ...form, region: value as Region | null })}
                />
                <Group grow>
                  <TextInput label={t.advertiserName} required maxLength={80} value={form.advertiserName} onChange={text('advertiserName')} />
                  <TextInput label={t.email} type="email" required value={form.contactEmail} onChange={text('contactEmail')} />
                </Group>
                <TextInput label={t.offerTitle} required maxLength={80} value={form.title} onChange={text('title')} />
                <Textarea label={t.offerDescription} required maxLength={280} autosize minRows={2} value={form.description} onChange={text('description')} />
                <TextInput label={t.offerUrl} type="url" required value={form.url} onChange={text('url')} />
                <Checkbox
                  checked={form.mailing}
                  onChange={(event) => setForm({ ...form, mailing: event.currentTarget.checked })}
                  label={t.advertiseMailing(quote ? formatPrice(quote.mailingPriceCents, uiLang) : null)}
                  description={t.advertiseMailingHint}
                />
                <Textarea label={t.message} maxLength={2000} autosize minRows={2} value={form.message} onChange={text('message')} />
                {error && <Alert color="red">{error}</Alert>}
                <div>
                  <Button type="submit" loading={status === 'busy'}>
                    {t.send}
                  </Button>
                </div>
              </Stack>
            </form>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
