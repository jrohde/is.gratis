import { Alert, Anchor, Badge, Button, Card, Container, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconArrowLeft, IconMessages } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { data, Link } from 'react-router';
import type { Comment } from '@isgratis/types';
import type { Route } from './+types/page-talk';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGet, apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
import { parseLang, parseSlug } from '~/lib/params';
import { useSession } from '~/stores/session';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = parseSlug(params.slug);
  const page = await apiGetOptional<{ title: string }>(`/pages/${lang}/${slug}`);
  if (!page) throw data(null, { status: 404 });
  const { comments } = await apiGet<{ comments: Comment[] }>(`/pages/${lang}/${slug}/comments`);
  // Purged together with the page whenever someone posts.
  return data({ lang, slug, title: page.title, comments }, { headers: { 'Cache-Control': CACHE.page } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${messages(loaderData.lang).talkTitle(messages(loaderData.lang).question(loaderData.title))} | is.gratis` },
        { name: 'robots', content: 'noindex' },
      ]
    : [];

export default function Talk({ loaderData }: Route.ComponentProps) {
  const { lang, slug, title } = loaderData;
  const t = messages(lang);
  const user = useSession((state) => state.user);
  const moderator = user?.role === 'moderator' || user?.role === 'admin';
  const [comments, setComments] = useState(loaderData.comments);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/${lang}/${slug}`;

  // Moderators also see hidden messages; everyone else gets the cached list.
  useEffect(() => {
    if (moderator) {
      void api<{ comments: Comment[] }>('GET', `/pages/${lang}/${slug}/comments`).then((result) => setComments(result.comments));
    }
  }, [moderator, lang, slug]);

  async function post(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { comment } = await api<{ comment: Comment }>('POST', `/pages/${lang}/${slug}/comments`, { body });
      setComments((list) => [...list, comment]);
      setBody('');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(comment: Comment) {
    const { hidden } = await api<{ hidden: boolean }>('POST', `/comments/${comment.id}/hide`, { hidden: !comment.hidden });
    setComments((list) => list.map((item) => (item.id === comment.id ? { ...item, hidden } : item)));
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Anchor component={Link} to={base} size="sm">
          <Group gap={4} component="span">
            <IconArrowLeft size={14} aria-hidden />
            {t.backToPage}
          </Group>
        </Anchor>
        <Group gap="sm" wrap="nowrap">
          <IconMessages size={28} aria-hidden />
          <Title order={1} size="h2">
            {t.talkTitle(t.question(title))}
          </Title>
        </Group>
        <Text c="dimmed">{t.talkIntro}</Text>
        {comments.length === 0 && <Text c="dimmed">{t.talkEmpty}</Text>}
        {comments.map((comment) => (
          <Card key={comment.id} withBorder padding="md" id={`bericht-${comment.id}`} opacity={comment.hidden ? 0.55 : 1}>
            <Group justify="space-between" mb={6}>
              <Group gap="xs">
                <Text fw={700} size="sm">
                  {comment.authorName}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatDate(comment.createdAt, lang)}
                </Text>
                {comment.hidden && (
                  <Badge size="xs" color="gray">
                    {t.hiddenLabel}
                  </Badge>
                )}
              </Group>
              {moderator && (
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => void toggle(comment)}>
                  {comment.hidden ? t.unhide : t.hide}
                </Button>
              )}
            </Group>
            {/* Plain text on purpose: no links or formatting to abuse. */}
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {comment.body}
            </Text>
          </Card>
        ))}
        {user ? (
          <form onSubmit={(event) => void post(event)}>
            <Stack gap="xs">
              <Textarea
                label={t.talkPlaceholder}
                autosize
                minRows={3}
                maxLength={4000}
                required
                value={body}
                onChange={(event) => setBody(event.currentTarget.value)}
              />
              {error && <Alert color="red">{error}</Alert>}
              <div>
                <Button type="submit" loading={busy} disabled={body.trim().length < 2}>
                  {t.talkPost}
                </Button>
              </div>
            </Stack>
          </form>
        ) : (
          <Anchor component={Link} to={`/account/login?lang=${lang}&next=${encodeURIComponent(`${base}/talk`)}`}>
            {t.talkLogin}
          </Anchor>
        )}
      </Stack>
    </Container>
  );
}
