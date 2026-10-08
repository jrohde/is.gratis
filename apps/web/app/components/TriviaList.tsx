import { Card, Group, Stack, ThemeIcon } from '@mantine/core';
import { IconBulb } from '@tabler/icons-react';
import { SECTION_LABELS, type Language } from '@isgratis/types';
import { Markdown } from './Markdown';
import { SectionTitle } from './SectionTitle';

export function TriviaList({ items, lang }: { items: string[]; lang: Language }) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionTitle icon={<IconBulb size={18} />} color="yellow">
        {SECTION_LABELS[lang].trivia}
      </SectionTitle>
      <Stack gap="xs">
        {items.map((item) => (
          <Card key={item} withBorder padding="sm">
            <Group gap="sm" wrap="nowrap" align="start">
              <ThemeIcon variant="light" color="yellow" size="sm" radius="xl" mt={4} aria-hidden>
                <IconBulb size={14} />
              </ThemeIcon>
              <Markdown>{item}</Markdown>
            </Group>
          </Card>
        ))}
      </Stack>
    </section>
  );
}
