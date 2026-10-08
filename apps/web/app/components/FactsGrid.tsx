import { Anchor, Card, SimpleGrid, Text } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { SECTION_LABELS, type Fact, type Language } from '@isgratis/types';
import { SectionTitle } from './SectionTitle';

export function FactsGrid({ facts, lang }: { facts: Fact[]; lang: Language }) {
  if (facts.length === 0) return null;
  return (
    <section>
      <SectionTitle icon={<IconChartBar size={18} />} color="blue">
        {SECTION_LABELS[lang].facts}
      </SectionTitle>
      <SimpleGrid cols={{ base: 1, xs: 2, md: Math.min(facts.length, 3) }}>
        {facts.map((fact) => (
          <Card key={fact.label} withBorder padding="md">
            <Text fw={800} fz="lg" lh={1.25}>
              {fact.value}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {fact.sourceUrl ? (
                <Anchor href={fact.sourceUrl} rel="nofollow ugc noopener" target="_blank" c="dimmed" underline="always">
                  {fact.label}
                </Anchor>
              ) : (
                fact.label
              )}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </section>
  );
}
