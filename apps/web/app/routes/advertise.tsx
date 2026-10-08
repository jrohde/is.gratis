import { Alert, Button, Card, Container, Group, List, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { isLanguage, LANGUAGES, REGIONS, toSlug, type Language, type Region } from '@isgratis/types';
import type { Route } from './+types/advertise';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
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
  });
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const text = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [field]: event.currentTarget.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('busy');
    setError(null);
    try {
      await api('POST', '/sponsors/requests', {
        ...form,
        slug: toSlug(form.slug),
        message: form.message.trim() || undefined,
      });
      setStatus('done');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setStatus('idle');
    }
  }

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Title order={1}>{t.advertiseTitle}</Title>
        <Text size="lg">{t.advertiseIntro}</Text>
        <List spacing="xs">
          {t.advertiseRules.map((rule) => (
            <List.Item key={rule}>{rule}</List.Item>
          ))}
        </List>
        {status === 'done' ? (
          <Alert color="green">{t.advertiseSubmitted}</Alert>
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
                <Select
                  label={t.regionOptional}
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
