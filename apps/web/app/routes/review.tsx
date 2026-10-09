import { Alert, Anchor, Badge, Button, Card, Container, Group, Progress, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useRevalidator } from 'react-router';
import { isLanguage, LANGUAGES, type Language, type MissingSubject, type ReviewItem } from '@isgratis/types';
import type { Route } from './+types/review';
import { ClaimRow, MissingRow } from '~/components/Claim';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGet } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';

export async function loader({ request }: Route.LoaderArgs) {
  const filter = new URL(request.url).searchParams.get('only');
  const only = filter && isLanguage(filter) ? filter : null;
  const { drafts } = await apiGet<{ drafts: ReviewItem[] }>(`/review?limit=200${only ? `&lang=${only}` : ''}`);
  return { drafts, only };
}

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'Review · is.gratis' }, { name: 'robots', content: 'noindex' }];

function DraftCard({ draft }: { draft: ReviewItem }) {
  const lang = useUiLang();
  const t = messages(lang);
  const user = useSession((state) => state.user);
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<'publish' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ratio = draft.claims ? draft.cited / draft.claims : 0;
  const path = `/pages/${draft.lang}/${draft.slug}`;

  async function run(kind: 'publish' | 'delete') {
    if (kind === 'delete' && !window.confirm(t.confirmDelete)) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'publish') await api('POST', `${path}/publish`);
      else await api('DELETE', path);
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap={8}>
        <Group gap="xs" wrap="nowrap" align="baseline">
          <Badge variant="outline" tt="uppercase" size="sm">
            {draft.lang}
          </Badge>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ClaimRow {...draft} />
          </div>
        </Group>
        <Text size="sm" c="dimmed">
          {plainText(draft.summary, 220)}
        </Text>
        <Group gap="sm" wrap="nowrap">
          <Progress
            value={ratio * 100}
            color={ratio >= 0.67 ? 'green' : ratio >= 0.34 ? 'orange' : 'red'}
            size="sm"
            style={{ flex: 1 }}
            aria-label={t.sourcing}
          />
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {t.sourcingText(draft.cited, draft.claims)} · {t.sourcesCount(draft.sources)} · {formatDate(draft.createdAt, lang)}
          </Text>
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group gap="xs">
          {user ? (
            <Button size="xs" leftSection={<IconCheck size={14} />} loading={busy === 'publish'} onClick={() => void run('publish')}>
              {t.publish}
            </Button>
          ) : null}
          <Button size="xs" variant="default" component={Link} to={`/${draft.lang}/${draft.slug}/edit`} leftSection={<IconPencil size={14} />}>
            {t.edit}
          </Button>
          {(user?.role === 'moderator' || user?.role === 'admin') && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              loading={busy === 'delete'}
              onClick={() => void run('delete')}
            >
              {t.deletePage}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

/** Subjects without a page that are linked, searched or exist elsewhere: what to write next. */
function Wanted({ lang }: { lang: Language }) {
  const t = messages(lang);
  const [subjects, setSubjects] = useState<Array<MissingSubject & { weight: number }> | null>(null);
  useEffect(() => {
    api<{ subjects: Array<MissingSubject & { weight: number }> }>('GET', `/wanted?lang=${lang}&limit=30`)
      .then((result) => setSubjects(result.subjects))
      .catch(() => setSubjects([]));
  }, [lang]);
  if (!subjects?.length) return null;
  return (
    <Stack gap="xs">
      <Title order={2} size="h3">
        {t.wantedTitle}
      </Title>
      <Text c="dimmed" size="sm">
        {t.wantedIntro}
      </Text>
      <Card withBorder padding="md">
        <Stack gap={10}>
          {subjects.map((subject) => (
            <Group key={subject.slug} gap="xs" wrap="nowrap" align="baseline">
              <div style={{ flex: 1, minWidth: 0 }}>
                <MissingRow lang={lang} slug={subject.slug} title={subject.title} />
              </div>
              <Badge variant="light" color="gray" size="sm">
                {t.reasons[subject.reason] ?? subject.reason}
              </Badge>
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export default function Review({ loaderData }: Route.ComponentProps) {
  const lang = useUiLang();
  const t = messages(lang);
  const user = useSession((state) => state.user);
  const navigate = useNavigate();
  const { drafts, only } = loaderData;
  return (
    <Container size="md">
      <Stack gap="lg">
        <Group justify="space-between" align="end">
          <Title order={1}>{t.reviewTitle}</Title>
          <SegmentedControl
            size="xs"
            value={only ?? 'all'}
            onChange={(value) => navigate(`/review?lang=${lang}${value === 'all' ? '' : `&only=${value}`}`)}
            data={[{ value: 'all', label: '∗' }, ...LANGUAGES.map((code) => ({ value: code, label: code.toUpperCase() }))]}
          />
        </Group>
        <Text>{t.reviewIntro}</Text>
        {!user && (
          <Anchor component={Link} to={`/account/login?lang=${lang}&next=${encodeURIComponent(`/review?lang=${lang}`)}`} size="sm">
            {t.publishLogin}
          </Anchor>
        )}
        {drafts.length === 0 ? (
          <Alert color="green">{t.reviewEmpty}</Alert>
        ) : (
          drafts.map((draft) => <DraftCard key={`${draft.lang}/${draft.slug}`} draft={draft} />)
        )}
        <Wanted lang={only ?? lang} />
      </Stack>
    </Container>
  );
}
