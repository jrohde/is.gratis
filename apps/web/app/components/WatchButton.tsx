import { Button } from '@mantine/core';
import { IconEye, IconEyeCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { Language } from '@isgratis/types';
import { api } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { useSession } from '~/stores/session';

/** Follow a page. Visiting a followed page marks its latest version as seen. */
export function WatchButton({ lang, slug }: { lang: Language; slug: string }) {
  const t = messages(lang);
  const user = useSession((state) => state.user);
  const [watching, setWatching] = useState<boolean | null>(null);
  const path = `/pages/${lang}/${slug}/watch`;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void api<{ watching: boolean }>('GET', path)
      .then(async ({ watching: current }) => {
        if (cancelled) return;
        setWatching(current);
        if (current) await api('PUT', path);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, path]);

  if (!user || watching === null) return null;
  return (
    <Button
      size="xs"
      variant={watching ? 'light' : 'default'}
      leftSection={watching ? <IconEyeCheck size={14} /> : <IconEye size={14} />}
      onClick={() => {
        const next = !watching;
        setWatching(next);
        api(next ? 'PUT' : 'DELETE', path).catch(() => setWatching(!next));
      }}
    >
      {watching ? t.watching : t.watch}
    </Button>
  );
}
