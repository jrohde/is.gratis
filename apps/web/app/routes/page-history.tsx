import { Anchor, Badge, Box, Button, Card, Container, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { data, Link, useNavigate } from 'react-router';
import type { Revision, RevisionSummary } from '@isgratis/types';
import type { Route } from './+types/page-history';
import { api, ClientApiError } from '~/lib/api.client';
import { ApiError, apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
import { parseLang, parseSlug } from '~/lib/params';
import { diffRevisions } from '~/lib/revision-diff';
import { useSession } from '~/stores/session';

export async function loader({ params, request }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = parseSlug(params.slug);
  let revisions: RevisionSummary[];
  try {
    ({ revisions } = await apiGet<{ revisions: RevisionSummary[] }>(`/pages/${lang}/${slug}/revisions`));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
  const search = new URL(request.url).searchParams;
  const latest = revisions[0]!.number;
  const to = Math.min(Number(search.get('to')) || latest, latest);
  const from = Math.max(Number(search.get('from')) || to - 1, 0);
  const [toRevision, fromRevision] = await Promise.all([
    apiGet<Revision>(`/pages/${lang}/${slug}/revisions/${to}`),
    from >= 1 ? apiGet<Revision>(`/pages/${lang}/${slug}/revisions/${from}`) : Promise.resolve(null),
  ]);
  return data(
    { lang, slug, revisions, toRevision, fromRevision },
    { headers: { 'Cache-Control': CACHE.short } },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  return [
    { title: `${t.historyTitle(t.question(loaderData.toRevision.title))} | is.gratis` },
    { name: 'robots', content: 'noindex' },
  ];
};

export default function PageHistory({ loaderData }: Route.ComponentProps) {
  const { lang, slug, revisions, toRevision, fromRevision } = loaderData;
  const t = messages(lang);
  const user = useSession((state) => state.user);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const base = `/${lang}/${slug}`;
  const latest = revisions[0]!.number;
  const empty = { ...toRevision, title: '', content: { ...toRevision.content, summary: '', whenFree: '', whenNotFree: '', regions: [], sources: [] } };
  const diff = diffRevisions(fromRevision ?? empty, toRevision, lang);

  const authorOf = (revision: RevisionSummary) =>
    revision.source === 'llm' ? t.llmAuthor : revision.source === 'seed' ? t.seedAuthor : (revision.authorName ?? t.anonymous);

  async function revert(number: number) {
    setError(null);
    try {
      await api('POST', `/pages/${lang}/${slug}/revert`, { number });
      navigate(base);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    }
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1} size="h2">
          <Anchor component={Link} to={base} c="inherit" inherit>
            {t.historyTitle(t.question(toRevision.title))}
          </Anchor>
        </Title>

        <Card withBorder padding="lg">
          <Title order={2} size="h4" mb="sm">
            {t.compare}: {fromRevision ? `${fromRevision.number} → ` : ''}
            {toRevision.number}
          </Title>
          {diff.length === 0 && <Text c="dimmed">{t.noChanges}</Text>}
          <Stack gap="md">
            {diff.map((field) => (
              <div key={field.label}>
                <Text fw={700} size="sm" mb={4}>
                  {field.label}
                </Text>
                <Box style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }} fz="sm">
                  {field.changes.map((change, i) => (
                    <Text
                      key={i}
                      span
                      inherit
                      td={change.removed ? 'line-through' : undefined}
                      bg={change.added ? 'var(--mantine-color-green-light)' : change.removed ? 'var(--mantine-color-red-light)' : undefined}
                    >
                      {change.value}
                    </Text>
                  ))}
                </Box>
              </div>
            ))}
          </Stack>
        </Card>

        {error && <Text c="red">{error}</Text>}
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="sm">
            <Table.Tbody>
              {revisions.map((revision) => (
                <Table.Tr key={revision.id}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text fw={700}>{revision.number}</Text>
                      {revision.number === latest && <Badge size="xs">{t.current}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(revision.createdAt, lang)}</Text>
                    <Text size="xs" c="dimmed">
                      {authorOf(revision)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{revision.editSummary || '–'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="end" wrap="nowrap">
                      <Button
                        component={Link}
                        to={`?from=${revision.number - 1}&to=${revision.number}`}
                        size="compact-xs"
                        variant="subtle"
                      >
                        {t.compare}
                      </Button>
                      {user && revision.number !== latest && (
                        <Button size="compact-xs" variant="light" onClick={() => void revert(revision.number)}>
                          {t.revert}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Container>
  );
}
