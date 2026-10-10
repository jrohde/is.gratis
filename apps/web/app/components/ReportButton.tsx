import { Alert, Button, Modal, Radio, Stack, Textarea } from '@mantine/core';
import { useState } from 'react';
import { OFFER_REPORT_REASONS, REPORT_REASONS, type Language, type ReportReason } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { messages } from '~/lib/i18n';

type ReportTarget = { slug: string } | { offerId: string };

/**
 * "Melden": tell the moderators something is wrong with this page, or with a sponsored offer on
 * it. No account needed.
 */
export function ReportModal({
  lang,
  target,
  opened,
  onClose,
}: {
  lang: Language;
  target: ReportTarget;
  opened: boolean;
  onClose: () => void;
}) {
  const t = messages(lang);
  const isOffer = 'offerId' in target;
  const reasons: readonly ReportReason[] = isOffer ? OFFER_REPORT_REASONS : REPORT_REASONS;
  const [reason, setReason] = useState<ReportReason>(reasons[0]!);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState('busy');
    setError(null);
    try {
      const path = 'offerId' in target ? `/offers/${target.offerId}/reports` : `/pages/${lang}/${target.slug}/reports`;
      await api('POST', path, { reason, message: message.trim() || undefined });
      setState('done');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setState('idle');
    }
  }

  return (
    <>
      <Modal opened={opened} onClose={onClose} title={isOffer ? t.offerReportTitle : t.reportTitle} centered>
        {state === 'done' ? (
          <Alert color="green">{t.reportThanks}</Alert>
        ) : (
          <Stack>
            <Radio.Group value={reason} onChange={(value) => setReason(value as ReportReason)}>
              <Stack gap="xs">
                {reasons.map((value) => (
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
