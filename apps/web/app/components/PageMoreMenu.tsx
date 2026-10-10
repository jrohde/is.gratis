import { Button, Menu } from '@mantine/core';
import { IconCode, IconDots, IconFileText, IconFlag, IconLock, IconLockOpen } from '@tabler/icons-react';
import { useState } from 'react';
import { useRevalidator } from 'react-router';
import type { Page } from '@isgratis/types';
import { api } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { useSession } from '~/stores/session';
import { EmbedModal } from './EmbedButton';
import { ReportModal } from './ReportButton';

/** The less used page actions, out of the way: Markdown, embed, report, protect. */
export function PageMoreMenu({ page, origin }: { page: Page; origin: string }) {
  const t = messages(page.lang);
  const user = useSession((state) => state.user);
  const revalidator = useRevalidator();
  const [modal, setModal] = useState<'embed' | 'report' | null>(null);
  const moderator = user?.role === 'moderator' || user?.role === 'admin';
  const base = `/${page.lang}/${page.slug}`;
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button size="xs" variant="subtle" color="gray" leftSection={<IconDots size={14} />}>
            {t.more}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {page.status === 'published' && (
            <Menu.Item leftSection={<IconCode size={14} />} onClick={() => setModal('embed')}>
              {t.embed}
            </Menu.Item>
          )}
          <Menu.Item component="a" href={`${base}/llms.txt`} leftSection={<IconFileText size={14} />}>
            Markdown (llms.txt)
          </Menu.Item>
          <Menu.Item leftSection={<IconFlag size={14} />} onClick={() => setModal('report')}>
            {t.report}
          </Menu.Item>
          {moderator && (
            <Menu.Item
              leftSection={page.protected ? <IconLockOpen size={14} /> : <IconLock size={14} />}
              onClick={() =>
                void api('POST', `/pages/${page.lang}/${page.slug}/protect`, { protected: !page.protected }).then(() =>
                  revalidator.revalidate(),
                )
              }
            >
              {page.protected ? t.unprotect : t.protect}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
      <EmbedModal page={page} origin={origin} opened={modal === 'embed'} onClose={() => setModal(null)} />
      <ReportModal lang={page.lang} target={{ slug: page.slug }} opened={modal === 'report'} onClose={() => setModal(null)} />
    </>
  );
}
