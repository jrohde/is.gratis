import { Button, Group, Text } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useState } from 'react';
import { LANGUAGES, type Language, type Page } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { useSession } from '~/stores/session';

/** For a checked page: have it translated into the languages it is still missing in. */
export function TranslateButtons({ page }: { page: Page }) {
  const t = messages(page.lang);
  const user = useSession((state) => state.user);
  const [state, setState] = useState<Partial<Record<Language, 'busy' | 'queued' | string>>>({});
  const missing = LANGUAGES.filter((lang) => lang !== page.lang && !page.translations.some((tr) => tr.lang === lang));
  if (!user || page.status !== 'published' || missing.length === 0) return null;

  async function translate(to: Language) {
    setState((s) => ({ ...s, [to]: 'busy' }));
    try {
      await api('POST', `/pages/${page.lang}/${page.slug}/translate`, { to });
      setState((s) => ({ ...s, [to]: 'queued' }));
    } catch (err) {
      setState((s) => ({ ...s, [to]: err instanceof ClientApiError ? err.message : t.errorGeneric }));
    }
  }

  return (
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
          <Button key={lang} size="compact-xs" variant="default" loading={value === 'busy'} onClick={() => void translate(lang)} title={value && value !== 'busy' ? value : undefined}>
            {LANGUAGE_NAMES[lang]}
          </Button>
        );
      })}
    </Group>
  );
}
