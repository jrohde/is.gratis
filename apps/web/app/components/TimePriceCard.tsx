import { Anchor, Card, Group, Stack, Text } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { Link } from 'react-router';
import { formatDuration, formatMoney, timePriceSeconds, type Language, type TimePrice } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { regionLabel } from '~/lib/regions';

/** How long you work for one unit: a price you can compare across countries and centuries. */
export function TimePriceCard({ timePrice, lang }: { timePrice: TimePrice; lang: Language }) {
  const t = messages(lang);
  const duration = formatDuration(timePriceSeconds(timePrice), lang);
  return (
    <Card withBorder padding="md">
      <Stack gap={6}>
        <Group gap={8}>
          <IconClockHour4 size={20} aria-hidden />
          <Text fw={700}>{t.timePrice}</Text>
        </Group>
        <Text fz={28} fw={800} lh={1.1}>
          {duration}
        </Text>
        <Text size="sm">{t.timePriceFor(timePrice.unit)}</Text>
        <Text size="xs" c="dimmed">
          {t.timePriceWage(formatMoney(timePrice.hourlyWage, timePrice.currency, lang), regionLabel(timePrice.region, lang))}
          {' · '}
          <Anchor href={timePrice.source.url} rel="nofollow ugc noopener" target="_blank" size="xs">
            {timePrice.source.title}
          </Anchor>
          {' · '}
          <Anchor component={Link} to={`/methodology?lang=${lang}`} size="xs">
            {t.howWeMeasure}
          </Anchor>
        </Text>
      </Stack>
    </Card>
  );
}
