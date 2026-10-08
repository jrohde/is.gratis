import { Box, Group, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import type { Language } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { renderWikiLinks } from '@isgratis/types';
import { Markdown } from './Markdown';

export function MarkdownField({
  label,
  description,
  value,
  onChange,
  lang,
  minRows = 4,
  maxLength,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  lang: Language;
  minRows?: number;
  maxLength: number;
}) {
  const t = messages(lang);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  return (
    <Stack gap={4}>
      <Group justify="space-between" align="end">
        <Text fw={500} size="sm">
          {label}
        </Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(next) => setMode(next as 'write' | 'preview')}
          data={[
            { value: 'write', label: t.write },
            { value: 'preview', label: t.preview },
          ]}
        />
      </Group>
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      {mode === 'write' ? (
        <Textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          autosize
          minRows={minRows}
          maxLength={maxLength}
        />
      ) : (
        <Box p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, minHeight: 80 }}>
          <Markdown>{renderWikiLinks(value, lang) || '–'}</Markdown>
        </Box>
      )}
    </Stack>
  );
}
