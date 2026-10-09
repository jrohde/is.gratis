import { Button, Code, CopyButton, Modal, Stack, Text } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { useState } from 'react';
import { claimFor, footnoteFor, type Page } from '@isgratis/types';
import { messages } from '~/lib/i18n';

/** "Insluiten": the answer card as an image with a link back, for other sites. */
export function EmbedButton({ page, origin }: { page: Page; origin: string }) {
  const t = messages(page.lang);
  const [open, setOpen] = useState(false);
  if (page.status !== 'published') return null;
  const url = `${origin}/${page.lang}/${page.slug}`;
  const image = `${origin}/api/og/embed/${page.lang}/${page.slug}.svg`;
  const alt = `${claimFor(page.lang, page.title, page.content.plural)}* — *${footnoteFor(page.lang, page.content).text}`;
  const snippet = `<a href="${url}"><img src="${image}" width="440" height="124" alt="${alt.replace(/"/g, '&quot;')}"></a>`;
  return (
    <>
      <Button size="xs" variant="subtle" color="gray" leftSection={<IconCode size={14} />} onClick={() => setOpen(true)}>
        {t.embed}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={t.embedTitle} centered size="lg">
        <Stack>
          <Text size="sm">{t.embedHelp}</Text>
          <img src={image} width={440} height={124} alt={alt} style={{ maxWidth: '100%', height: 'auto' }} />
          <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {snippet}
          </Code>
          <CopyButton value={snippet}>
            {({ copied, copy }) => (
              <Button onClick={copy} color={copied ? 'teal' : undefined}>
                {copied ? t.copied : t.copy}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>
    </>
  );
}
