import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useState } from 'react';
import { useRevalidator } from 'react-router';
import { LANGUAGES, toSlug, type Language, type Page } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { useSession } from '~/stores/session';

/** For a checked page: have it translated into the languages it is still missing in. */
export function TranslateButtons({ page }: { page: Page }) {
  const t = messages(page.lang);
  const user = useSession((state) => state.user);
  const [state, setState] = useState<Partial<Record<Language, 'busy' | 'queued' | string>>>({});
  const missing = LANGUAGES.filter(
    (lang) => lang !== page.lang && !page.translations.some((tr) => tr.lang === lang),
  );
  if (!user || page.status !== 'published' || missing.length === 0) return null;

  async function translate(to: Language) {
    setState((s) => ({ ...s, [to]: 'busy' }));
    try {
      await api('POST', `/pages/${page.lang}/${page.slug}/translate`, { to });
      setState((s) => ({ ...s, [to]: 'queued' }));
    } catch (err) {
      setState((s) => ({
        ...s,
        [to]: err instanceof ClientApiError ? err.message : t.errorGeneric,
      }));
    }
  }

  return (
    <Stack gap={6}>
      <Group gap="xs">
        <IconLanguage size={14} aria-hidden />
        <Text size="sm" c="dimmed">
          {t.translateTo}
        </Text>
        {missing.map((lang) => {
          const value = state[lang];
          if (value === 'queued') {
            return (
              <Text key={lang} size="sm" c="green">
                {LANGUAGE_NAMES[lang]}: {t.translationQueued}
              </Text>
            );
          }
          return (
            <Button
              key={lang}
              size="compact-xs"
              variant="default"
              loading={value === 'busy'}
              onClick={() => void translate(lang)}
              title={value && value !== 'busy' ? value : undefined}
            >
              {LANGUAGE_NAMES[lang]}
            </Button>
          );
        })}
      </Group>
      {(user.role === 'moderator' || user.role === 'admin') && (
        <LinkForm page={page} missing={missing} />
      )}
    </Stack>
  );
}

/** Moderators: this page and an existing page in another language are the same subject. */
function LinkForm({ page, missing }: { page: Page; missing: Language[] }) {
  const t = messages(page.lang);
  const revalidator = useRevalidator();
  const [lang, setLang] = useState<Language>(missing[0]!);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function link() {
    setError(null);
    try {
      await api('POST', `/pages/${page.lang}/${page.slug}/link`, { lang, slug: toSlug(slug) });
      setSlug('');
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    }
  }
  return (
    <Group gap="xs" align="end">
      <Text size="sm" c="dimmed">
        {t.linkTranslation}
      </Text>
      <Select
        size="xs"
        w={130}
        value={lang}
        allowDeselect={false}
        data={missing.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))}
        onChange={(v) => v && setLang(v as Language)}
      />
      <TextInput
        size="xs"
        w={180}
        placeholder={`/${lang}/…`}
        value={slug}
        onChange={(e) => setSlug(e.currentTarget.value)}
        error={error}
      />
      <Button size="xs" variant="default" disabled={!toSlug(slug)} onClick={() => void link()}>
        {t.link}
      </Button>
    </Group>
  );
}
