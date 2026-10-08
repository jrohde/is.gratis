import { Anchor, Card, Group, Progress, Stack, Switch, Text } from '@mantine/core';
import { IconBook2 } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { CitationStats, Language } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { usePreferences } from '~/stores/preferences';

/** How many claims on the page can be traced to a source. */
export function SourcingSummary({ stats, lang }: { stats: CitationStats; lang: Language }) {
  const t = messages(lang);
  const highlight = usePreferences((state) => state.highlightUnsourced);
  const setHighlight = usePreferences((state) => state.setHighlightUnsourced);
  const ratio = stats.claims ? stats.cited / stats.claims : 1;
  const color = ratio >= 0.67 ? 'green' : ratio >= 0.34 ? 'orange' : 'red';
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <IconBook2 size={20} aria-hidden />
            <Text fw={700}>{t.sourcing}</Text>
          </Group>
          <Text fw={800} fz="lg">
            {Math.round(ratio * 100)}%
          </Text>
        </Group>
        <Progress value={ratio * 100} color={color} size="md" radius="sm" aria-label={t.sourcing} />
        <Text size="sm">{t.sourcingText(stats.cited, stats.claims)}</Text>
        <Group justify="space-between" gap="xs">
          <Switch
            size="xs"
            label={t.highlightUnsourced}
            checked={highlight}
            onChange={(event) => setHighlight(event.currentTarget.checked)}
          />
          <Anchor component={Link} to={`/methodology?lang=${lang}#bronnen`} size="xs">
            {t.howSourcing}
          </Anchor>
        </Group>
      </Stack>
    </Card>
  );
}
