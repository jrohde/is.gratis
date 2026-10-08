import { Autocomplete, Button, Group } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toSlug, type Language, type PageListItem } from '@isgratis/types';
import { api } from '~/lib/api.client';
import { messages } from '~/lib/i18n';

/**
 * Search with suggestions from existing pages. Enter on free text goes to that page; if it does
 * not exist yet, the visitor can have a first version written there.
 */
export function SearchBox({ lang, size = 'md' }: { lang: Language; size?: 'md' | 'lg' }) {
  const t = messages(lang);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PageListItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const slug = toSlug(query);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ pages: PageListItem[] }>('GET', `/search?lang=${lang}&q=${encodeURIComponent(query.trim())}&limit=6`)
        .then(({ pages }) => setResults(pages))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(timer.current);
  }, [query, lang]);

  const options = results.map((page) => ({
    value: page.slug,
    label: `${page.emoji ? `${page.emoji} ` : ''}${t.question(page.title)}`,
  }));

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (slug) navigate(`/${lang}/${slug}`);
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Autocomplete
          aria-label={t.searchButton}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={setQuery}
          data={options}
          filter={({ options: all }) => all}
          onOptionSubmit={(value) => navigate(`/${lang}/${value}`)}
          leftSection={<IconSearch size={18} />}
          size={size}
          style={{ flex: 1 }}
          maxLength={64}
          comboboxProps={{ withinPortal: true }}
        />
        <Button type="submit" size={size} disabled={!slug}>
          {t.searchButton}
        </Button>
      </Group>
    </form>
  );
}
