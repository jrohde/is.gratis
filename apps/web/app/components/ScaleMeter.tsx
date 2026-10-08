import { Anchor, Card, Group, Stack, Text } from '@mantine/core';
import { IconScale } from '@tabler/icons-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import {
  FREE_TYPE_DESCRIPTIONS,
  FREE_TYPE_LABELS,
  FREE_TYPE_LEVEL,
  SCALE_MAX,
  SCALE_NAME,
  type FreeScale,
  type Language,
} from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { regionLabel } from '~/lib/regions';
import { wasHydratedBeforeMount } from '~/lib/use-hydrated';

/** Colour per level, from red (always paid) to green (free good). */
const LEVEL_COLORS = ['red-7', 'orange-6', 'yellow-6', 'lime-6', 'green-6', 'teal-7'].map(
  (color) => `var(--mantine-color-${color})`,
);

export function ScaleMeter({ scale, lang }: { scale: FreeScale; lang: Language }) {
  const t = messages(lang);
  const level = FREE_TYPE_LEVEL[scale.type];
  const play = wasHydratedBeforeMount();
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <IconScale size={20} aria-hidden />
            <Text fw={700}>{SCALE_NAME[lang]}</Text>
          </Group>
          <Text fw={800} fz="lg">
            {level}
            <Text span c="dimmed" fw={500} fz="sm">
              {' '}
              {t.outOf} {SCALE_MAX}
            </Text>
          </Text>
        </Group>
        <Group
          gap={4}
          wrap="nowrap"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={SCALE_MAX}
          aria-valuenow={level}
          aria-label={`${SCALE_NAME[lang]}: ${level} ${t.outOf} ${SCALE_MAX}`}
        >
          {Array.from({ length: SCALE_MAX }, (_, i) => {
            const filled = i < level;
            return (
              <motion.div
                key={i}
                style={{
                  flex: 1,
                  height: 10,
                  borderRadius: 4,
                  background: filled ? LEVEL_COLORS[level] : 'var(--mantine-color-default-border)',
                }}
                initial={play && filled ? { opacity: 0, scaleX: 0.3 } : false}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
              />
            );
          })}
        </Group>
        <Text fw={600}>{FREE_TYPE_LABELS[lang][scale.type]}</Text>
        <Text size="sm" c="dimmed">
          {FREE_TYPE_DESCRIPTIONS[lang][scale.type]} {t.assessedFor(regionLabel(scale.region, lang))}.{' '}
          <Anchor component={Link} to={`/methodology?lang=${lang}`} size="sm">
            {t.howWeMeasure}
          </Anchor>
        </Text>
      </Stack>
    </Card>
  );
}
