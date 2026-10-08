import { Alert, Badge, Box, Button, Card, Checkbox, FileButton, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import { IconPhoto, IconSparkles, IconTrash, IconUpload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { DraftJob, Language, PageImage, PublicConfig } from '@isgratis/types';
import { api, ClientApiError, uploadImage } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { mediaUrl } from '~/lib/media';

/**
 * Picks the page image: upload one (after confirming the rights) or let the image model make
 * one. Only the asset id, description and credit are kept in the page; size and the AI label
 * are filled in by the API from the stored image.
 */
export function ImageField({
  lang,
  slug,
  title,
  pageExists,
  image,
  onChange,
}: {
  lang: Language;
  slug: string;
  title: string;
  pageExists: boolean;
  image: PageImage | undefined;
  onChange: (image: PageImage | undefined) => void;
}) {
  const t = messages(lang);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<'upload' | 'generate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PublicConfig>('GET', '/config')
      .then(setConfig)
      .catch(() => setConfig({ imageGeneration: false }));
  }, []);

  const defaultAlt = t.question(title);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      const asset = await uploadImage(file);
      onChange({ assetId: asset.id, alt: image?.alt || defaultAlt, width: asset.width, height: asset.height, ai: false });
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy('generate');
    setError(null);
    try {
      let { job } = await api<{ job: DraftJob }>('POST', '/images/generate', { lang, slug });
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        ({ job } = await api<{ job: DraftJob }>('GET', `/drafts/${job.id}`));
      }
      if (job.status === 'failed' || !job.asset) throw new Error(job.error ?? t.failed);
      onChange({ assetId: job.asset.id, alt: defaultAlt, width: job.asset.width, height: job.asset.height, ai: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group gap={8}>
          <IconPhoto size={18} aria-hidden />
          <Text fw={600} size="sm">
            {t.image}
          </Text>
        </Group>
        {image && (
          <Group align="start" wrap="nowrap">
            <Box pos="relative" w={200} style={{ flexShrink: 0 }}>
              <img
                src={mediaUrl(image.assetId, 480)}
                alt={image.alt}
                width={200}
                height={Math.round((200 * image.height) / image.width)}
                style={{ display: 'block', width: 200, height: 'auto', borderRadius: 8 }}
              />
              {image.ai && (
                <Badge pos="absolute" top={6} left={6} size="xs" color="dark" leftSection={<IconSparkles size={10} />}>
                  {t.aiImage}
                </Badge>
              )}
            </Box>
            <Stack gap="xs" style={{ flex: 1 }}>
              <TextInput
                label={t.imageAlt}
                required
                maxLength={300}
                value={image.alt}
                onChange={(event) => onChange({ ...image, alt: event.currentTarget.value })}
              />
              <TextInput
                label={t.imageCreditLabel}
                maxLength={200}
                value={image.credit ?? ''}
                onChange={(event) => {
                  const credit = event.currentTarget.value;
                  const { credit: _old, ...rest } = image;
                  onChange(credit ? { ...rest, credit } : rest);
                }}
              />
              <div>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => onChange(undefined)}
                >
                  {t.removeImage}
                </Button>
              </div>
            </Stack>
          </Group>
        )}
        <Checkbox size="xs" label={t.imageRights} checked={rights} onChange={(event) => setRights(event.currentTarget.checked)} />
        <Group gap="xs">
          <FileButton onChange={(file) => void upload(file)} accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
            {(props) => (
              <Button
                {...props}
                size="xs"
                variant="light"
                leftSection={<IconUpload size={14} />}
                disabled={!rights || busy !== null}
                loading={busy === 'upload'}
              >
                {t.uploadImage}
              </Button>
            )}
          </FileButton>
          {config?.imageGeneration && pageExists && (
            <Button
              size="xs"
              variant="light"
              color="grape"
              leftSection={<IconSparkles size={14} />}
              onClick={() => void generate()}
              disabled={busy !== null}
            >
              {t.generateImage}
            </Button>
          )}
          {busy === 'generate' && (
            <Group gap={6}>
              <Loader size="xs" />
              <Text size="xs">{t.generatingImage}</Text>
            </Group>
          )}
        </Group>
        {error && <Alert color="red">{error}</Alert>}
      </Stack>
    </Card>
  );
}
