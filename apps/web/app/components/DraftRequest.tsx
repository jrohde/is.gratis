import { Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import type { DraftJob, Language } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { messages } from '~/lib/i18n';

const MotionDiv = motion.div;

/**
 * Shown when a page does not exist. The visitor can ask the LLM for a first version; we poll
 * the job and reload the route when the draft is stored. Crawlers never trigger this: it is
 * a POST behind a button, rate limited per IP.
 */
export function DraftRequest({
  lang,
  slug,
  question,
  initialJob,
}: {
  lang: Language;
  slug: string;
  question: string;
  initialJob: DraftJob | null;
}) {
  const t = messages(lang);
  const revalidator = useRevalidator();
  const [job, setJob] = useState<DraftJob | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    if (!job || !pending) return;
    const timer = setInterval(async () => {
      try {
        const { job: next } = await api<{ job: DraftJob }>('GET', `/drafts/${job.id}`);
        setJob(next);
        if (next.status === 'done') revalidator.revalidate();
      } catch {
        // Keep polling; a transient error should not end the wait.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job, pending, revalidator]);

  async function request() {
    setBusy(true);
    setError(null);
    try {
      const { job: created } = await api<{ job: DraftJob }>('POST', '/drafts', { lang, slug });
      setJob(created);
      if (created.status === 'done') revalidator.revalidate();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const rejected = job?.status === 'failed' && (job.error?.startsWith('not_a_topic') ?? false);
  const failedMessage = job?.status === 'failed' ? (rejected ? t.notATopic : t.failed) : null;

  return (
    <Stack gap="lg">
      <Title order={1}>{question}</Title>
      <Card withBorder padding="xl">
        <AnimatePresence mode="wait">
          {pending ? (
            <MotionDiv key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Group>
                <Loader size="sm" type="dots" />
                <Text fw={600}>{job?.status === 'running' ? t.generating : t.queued}</Text>
              </Group>
            </MotionDiv>
          ) : (
            <MotionDiv key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Stack gap="md">
                <Title order={2} size="h3">
                  {t.missingTitle}
                </Title>
                <Text c="dimmed">{t.missingText}</Text>
                {failedMessage && <Alert color="orange">{failedMessage}</Alert>}
                {error && <Alert color="red">{error}</Alert>}
                <Group>
                  <Button onClick={() => void request()} loading={busy} disabled={rejected}>
                    {t.generate}
                  </Button>
                  <Button component={Link} to={`/${lang}/${slug}/edit`} variant="default">
                    {t.writeYourself}
                  </Button>
                </Group>
              </Stack>
            </MotionDiv>
          )}
        </AnimatePresence>
      </Card>
    </Stack>
  );
}
