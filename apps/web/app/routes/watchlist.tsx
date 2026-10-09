import { Alert, Anchor, Badge, Card, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { WatchItem } from '@isgratis/types';
import type { Route } from './+types/watchlist';
import { api } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'Watchlist · is.gratis' }, { name: 'robots', content: 'noindex' }];

/** Loaded in the browser: the HTML is the same for everyone, the list is personal. */
export default function Watchlist() {
  const lang = useUiLang();
  const t = messages(lang);
  const { user, loaded } = useSession();
  const [items, setItems] = useState<WatchItem[] | null>(null);

  useEffect(() => {
    if (user) void api<{ pages: WatchItem[] }>('GET', '/watchlist').then((result) => setItems(result.pages));
  }, [user]);

  if (!loaded) return <Container><Loader /></Container>;
  if (!user) {
    return (
      <Container size="sm">
        <Anchor component={Link} to={`/account/login?lang=${lang}&next=${encodeURIComponent(`/account/watchlist?lang=${lang}`)}`}>
          {t.login}
        </Anchor>
      </Container>
    );
  }
  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>{t.watchlistTitle}</Title>
        {items === null ? (
          <Loader />
        ) : items.length === 0 ? (
          <Alert color="gray">{t.watchlistEmpty}</Alert>
        ) : (
          items.map((item) => {
            const changes = item.revision - item.seenRevision;
            const pt = messages(item.lang);
            return (
              <Card key={`${item.lang}/${item.slug}`} withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={2}>
                    <Anchor component={Link} to={`/${item.lang}/${item.slug}`} fw={700} c="inherit">
                      {item.emoji ? `${item.emoji} ` : ''}
                      {pt.question(item.title)}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {formatDate(item.updatedAt, lang)}
                    </Text>
                  </Stack>
                  {changes > 0 ? (
                    <Anchor component={Link} to={`/${item.lang}/${item.slug}/history`}>
                      <Badge color="orange">{t.changedSince(changes)}</Badge>
                    </Anchor>
                  ) : (
                    <Badge color="gray" variant="light">
                      {t.upToDate}
                    </Badge>
                  )}
                </Group>
              </Card>
            );
          })
        )}
      </Stack>
    </Container>
  );
}
