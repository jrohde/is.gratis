import { Badge, Card, Container, List, Stack, Table, Text, Title } from '@mantine/core';
import { IconBook2, IconClockHour4, IconFlask, IconInfoCircle, IconScale } from '@tabler/icons-react';
import {
  FREE_TYPE_DESCRIPTIONS,
  FREE_TYPE_LABELS,
  FREE_TYPE_LEVEL,
  FREE_TYPES,
} from '@isgratis/types';
import type { Route } from './+types/methodology';
import { Markdown } from '~/components/Markdown';
import { SectionTitle } from '~/components/SectionTitle';
import { messages } from '~/lib/i18n';
import { METHODOLOGY, REFERENCES } from '~/lib/methodology';
import { useUiLang } from '~/lib/use-lang';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
export const meta: Route.MetaFunction = () => [{ title: 'Methode · is.gratis' }];

const LEVEL_COLORS = ['red', 'orange', 'yellow', 'lime', 'green', 'teal'];

export default function Methodology() {
  const lang = useUiLang();
  const t = messages(lang);
  const m = METHODOLOGY[lang];
  return (
    <Container size="md">
      <Stack gap="xl">
        <Title order={1}>{t.methodologyTitle}</Title>
        <Markdown size="lg">{m.intro}</Markdown>

        <section>
          <SectionTitle icon={<IconScale size={18} />} color="green">
            {m.scaleTitle}
          </SectionTitle>
          <Stack gap="md">
            <Text>{m.scaleIntro}</Text>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="sm" withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.levelHeader}</Table.Th>
                    <Table.Th>{m.typeHeader}</Table.Th>
                    <Table.Th>{m.exampleHeader}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {FREE_TYPES.map((type) => {
                    const level = FREE_TYPE_LEVEL[type];
                    return (
                      <Table.Tr key={type}>
                        <Table.Td>
                          <Badge color={LEVEL_COLORS[level]} variant="filled" size="lg" circle>
                            {level}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text fw={700}>{FREE_TYPE_LABELS[lang][type]}</Text>
                          <Text size="sm" c="dimmed">
                            {FREE_TYPE_DESCRIPTIONS[lang][type]}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{m.examples[type]}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Markdown>{m.why}</Markdown>
          </Stack>
        </section>

        <section>
          <SectionTitle icon={<IconFlask size={18} />} color="violet">
            {m.basisTitle}
          </SectionTitle>
          <Markdown>{m.basis}</Markdown>
        </section>

        <section>
          <SectionTitle icon={<IconClockHour4 size={18} />} color="blue">
            {m.timeTitle}
          </SectionTitle>
          <Markdown>{m.time}</Markdown>
        </section>

        <Card withBorder padding="lg">
          <SectionTitle icon={<IconInfoCircle size={18} />}>{m.limitsTitle}</SectionTitle>
          <Text>{m.limits}</Text>
        </Card>

        <section>
          <SectionTitle icon={<IconBook2 size={18} />}>{m.referencesTitle}</SectionTitle>
          <List size="sm" spacing="xs">
            {REFERENCES.map((reference) => (
              <List.Item key={reference}>
                <Markdown>{reference}</Markdown>
              </List.Item>
            ))}
          </List>
        </section>
      </Stack>
    </Container>
  );
}
