import { Badge, Card, Group, Select, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { REGIONS, type Language, type Region, type RegionBlock } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { regionFlag, regionLabel } from '~/lib/regions';
import { Markdown } from './Markdown';
import { VerdictBadge } from './VerdictBadge';

const MotionDiv = motion.div;

/**
 * Every region is rendered (readers and search engines see all of it); the reader's own region
 * moves to the top with a layout animation when they pick it.
 */
export function RegionSection({
  blocks,
  lang,
  selected,
  onSelect,
  icon,
}: {
  blocks: RegionBlock[];
  lang: Language;
  selected: Region;
  onSelect: (region: Region) => void;
  icon?: ReactNode;
}) {
  const t = messages(lang);
  const ordered = [...blocks].sort((a, b) => Number(b.region === selected) - Number(a.region === selected));

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="end">
        <Group gap="xs" wrap="nowrap">
          {icon && (
            <ThemeIcon variant="light" color="cyan" size="md" radius="md" aria-hidden>
              {icon}
            </ThemeIcon>
          )}
          <Title order={2} size="h4">
            {t.regions}
          </Title>
        </Group>
        <Select
          aria-label={t.chooseRegion}
          label={t.yourRegion}
          size="xs"
          w={200}
          value={selected}
          allowDeselect={false}
          searchable
          data={REGIONS.map((region) => ({ value: region, label: `${regionFlag(region)} ${regionLabel(region, lang)}` }))}
          onChange={(value) => value && onSelect(value as Region)}
        />
      </Group>
      {blocks.length === 0 && <Text c="dimmed">{t.noRegions}</Text>}
      {ordered.map((block) => {
        const mine = block.region === selected;
        return (
          <MotionDiv key={block.region} layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <Card withBorder padding="md" bg={mine ? 'var(--mantine-color-green-light)' : undefined}>
              <Group justify="space-between" mb={6}>
                <Group gap="xs">
                  <Text fz="lg" aria-hidden>
                    {regionFlag(block.region)}
                  </Text>
                  <Text fw={700}>{regionLabel(block.region, lang)}</Text>
                  {mine && (
                    <Badge variant="light" size="sm">
                      {t.yourRegion}
                    </Badge>
                  )}
                </Group>
                <VerdictBadge verdict={block.verdict} lang={lang} size="sm" />
              </Group>
              <Markdown claims>{block.text}</Markdown>
            </Card>
          </MotionDiv>
        );
      })}
    </Stack>
  );
}
