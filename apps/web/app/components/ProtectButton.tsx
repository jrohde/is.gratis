import { Badge, Button, Tooltip } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useRevalidator } from 'react-router';
import type { Page } from '@isgratis/types';
import { api } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { useSession } from '~/stores/session';

/** The lock on a protected page, and the switch for moderators. */
export function ProtectButton({ page, toggle = false }: { page: Page; toggle?: boolean }) {
  const t = messages(page.lang);
  const user = useSession((state) => state.user);
  const revalidator = useRevalidator();
  const moderator = user?.role === 'moderator' || user?.role === 'admin';
  if (!moderator || !toggle) {
    return page.protected ? (
      <Tooltip label={t.protectedHelp} multiline w={260}>
        <Badge variant="light" color="gray" leftSection={<IconLock size={12} />}>
          {t.protectedLabel}
        </Badge>
      </Tooltip>
    ) : null;
  }
  return (
    <Button
      size="xs"
      variant="subtle"
      color="gray"
      leftSection={page.protected ? <IconLock size={14} /> : <IconLockOpen size={14} />}
      onClick={() =>
        void api('POST', `/pages/${page.lang}/${page.slug}/protect`, { protected: !page.protected }).then(() => revalidator.revalidate())
      }
    >
      {page.protected ? t.unprotect : t.protect}
    </Button>
  );
}
