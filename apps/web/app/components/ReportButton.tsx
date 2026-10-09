import { Alert, Button, Modal, Radio, Stack, Textarea } from '@mantine/core';
import { IconFlag } from '@tabler/icons-react';
import { useState } from 'react';
import { REPORT_REASONS, type Language, type ReportReason } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { messages } from '~/lib/i18n';

/** "Melden": tell the moderators something is wrong with this page. No account needed. */
export function ReportButton({ lang, slug }: { lang: Language; slug: string }) {
  const t = messages(lang);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('wrong');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState('busy');
    setError(null);
    try {
      await api('POST', `/pages/${lang}/${slug}/reports`, { reason, message: message.trim() || undefined });
      setState('done');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setState('idle');
    }
  }

  return (
    <>
      <Button size="xs" variant="subtle" color="gray" leftSection={<IconFlag size={14} />} onClick={() => setOpen(true)}>
        {t.report}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={t.reportTitle} centered>
        {state === 'done' ? (
          <Alert color="green">{t.reportThanks}</Alert>
        ) : (
          <Stack>
            <Radio.Group value={reason} onChange={(value) => setReason(value as ReportReason)}>
              <Stack gap="xs">
                {REPORT_REASONS.map((value) => (
                  <Radio key={value} value={value} label={t.reportReasons[value]} />
                ))}
              </Stack>
            </Radio.Group>
            <Textarea
              label={t.reportMessage}
              autosize
              minRows={2}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            {error && <Alert color="red">{error}</Alert>}
            <Button onClick={() => void send()} loading={state === 'busy'}>
              {t.reportSend}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
