import { Autocomplete, Button, Group, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { claimFor, footnoteFor, toSlug, type Language, type Suggestions } from '@isgratis/types';
import { api } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { Asterisk, Footnote } from './Logo';

const EMPTY: Suggestions = { pages: [], missing: [] };

/**
 * Search with suggestions while typing: existing pages first, then subjects that have no page
 * yet (choosing one offers to have it written). Enter opens the page when it exists exactly,
 * otherwise the search results.
 */
export function SearchBox({
  lang,
  size = 'md',
  initial = '',
  compact = false,
}: {
  lang: Language;
  size?: 'sm' | 'md' | 'lg';
  initial?: string;
  /** For the page header: no button, Enter searches. */
  compact?: boolean;
}) {
  const t = messages(lang);
  const navigate = useNavigate();
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const q = query.trim();
  const slug = toSlug(q);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.length < 2 || q === initial.trim()) {
      setSuggestions(EMPTY);
      return;
    }
    timer.current = setTimeout(() => {
      api<Suggestions>('GET', `/suggest?lang=${lang}&q=${encodeURIComponent(q)}`)
        .then(setSuggestions)
        .catch(() => setSuggestions(EMPTY));
    }, 120);
    return () => clearTimeout(timer.current);
  }, [q, lang, initial]);

  const byValue = useMemo(() => {
    const map = new Map<string, { kind: 'page' | 'missing'; slug: string; title: string; render: React.ReactNode }>();
    for (const page of suggestions.pages) {
      const note = footnoteFor(lang, page);
      map.set(`page:${page.slug}`, {
        kind: 'page',
        slug: page.slug,
        title: page.title,
        render: (
          <Group justify="space-between" wrap="nowrap" gap="xs" w="100%">
            <Text span fw={600}>
              {page.emoji ? `${page.emoji} ` : ''}
              {claimFor(lang, page.title, page.plural)}
              <Asterisk />
            </Text>
            <Text span size="sm" fw={800}>
              <Footnote text={note.text} color={note.color} />
            </Text>
          </Group>
        ),
      });
    }
    for (const subject of suggestions.missing) {
      map.set(`missing:${subject.slug}`, {
        kind: 'missing',
        slug: subject.slug,
        title: subject.title,
        render: (
          <Group justify="space-between" wrap="nowrap" gap="xs" w="100%">
            <Text span fw={600} c="dimmed">
              {claimFor(lang, subject.title)}
              <Asterisk />
            </Text>
            <Text span size="sm" c="dimmed">
              <Footnote text={t.noAnswerYet} />
            </Text>
          </Group>
        ),
      });
    }
    return map;
  }, [suggestions, lang, t.noAnswerYet]);

  const data = [
    ...(suggestions.pages.length
      ? [{ group: t.suggestPages, items: suggestions.pages.map((page) => ({ value: `page:${page.slug}`, label: page.title })) }]
      : []),
    ...(suggestions.missing.length
      ? [{ group: t.suggestMissing, items: suggestions.missing.map((m) => ({ value: `missing:${m.slug}`, label: m.title })) }]
      : []),
  ];

  function submit() {
    if (!slug) return;
    // Like Wikipedia's "Go": straight to the page when it exists, otherwise the results.
    if (suggestions.pages.some((page) => page.slug === slug)) navigate(`/${lang}/${slug}`);
    else navigate(`/search/${lang}?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Autocomplete
          aria-label={t.searchButton}
          placeholder={t.searchPlaceholder}
          value={query}
          // Choosing an option navigates; it should not put "page:water" in the box.
          onChange={(value) => {
            if (!byValue.has(value)) setQuery(value);
          }}
          data={data}
          filter={({ options }) => options}
          renderOption={({ option }) => byValue.get(option.value)?.render ?? option.value}
          onOptionSubmit={(value) => {
            const item = byValue.get(value);
            if (item) navigate(`/${lang}/${item.slug}`);
          }}
          leftSection={<IconSearch size={18} />}
          size={size}
          style={{ flex: 1 }}
          maxLength={80}
          comboboxProps={{ withinPortal: true, width: compact ? 420 : undefined, position: 'bottom-end' }}
          maxDropdownHeight={420}
        />
        {!compact && (
          <Button type="submit" size={size} disabled={!slug}>
            {t.searchButton}
          </Button>
        )}
      </Group>
    </form>
  );
}
