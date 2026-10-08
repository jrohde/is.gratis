import { Button, Group, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toSlug, type Language } from '@isgratis/types';
import { messages } from '~/lib/i18n';

export function SearchBox({ lang, size = 'md' }: { lang: Language; size?: 'md' | 'lg' }) {
  const t = messages(lang);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const slug = toSlug(query);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (slug) navigate(`/${lang}/${slug}`);
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <TextInput
          aria-label={t.searchButton}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          size={size}
          style={{ flex: 1 }}
          maxLength={64}
        />
        <Button type="submit" size={size} disabled={!slug}>
          {t.searchButton}
        </Button>
      </Group>
    </form>
  );
}
