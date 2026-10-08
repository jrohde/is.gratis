import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { data, Link, useNavigate } from 'react-router';
import { REGIONS, VERDICT_LABELS, VERDICTS, type Page, type Region, type Verdict } from '@isgratis/types';
import type { Route } from './+types/page-edit';
import { MarkdownField } from '~/components/MarkdownField';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { parseLang, parseSlug } from '~/lib/params';
import { regionFlag, regionLabel } from '~/lib/regions';
import { emptyContent, useEditor } from '~/stores/editor';
import { useSession } from '~/stores/session';

export async function loader({ params }: Route.LoaderArgs) {
  const lang = parseLang(params.lang);
  const slug = parseSlug(params.slug);
  const page = await apiGetOptional<Page>(`/pages/${lang}/${slug}`);
  return data({ lang, slug, page }, { headers: { 'Cache-Control': CACHE.none } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  const subject = loaderData.page?.title ?? loaderData.slug.replace(/-/g, ' ');
  return [{ title: `${t.editTitle(t.question(subject))} | is.gratis` }, { name: 'robots', content: 'noindex' }];
};

export default function PageEdit({ loaderData }: Route.ComponentProps) {
  const { lang, slug, page } = loaderData;
  const t = messages(lang);
  const navigate = useNavigate();
  const { user, loaded } = useSession();
  const editor = useEditor();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRegion, setNewRegion] = useState<string | null>(null);
  const base = `/${lang}/${slug}`;

  // Initialise in an effect: the store is module state, and must never be written during a server render.
  useEffect(() => {
    useEditor.getState().reset(page?.title ?? slug.replace(/-/g, ' '), page?.content ?? emptyContent());
    setReady(true);
  }, [page, slug]);

  if (loaded && !user) {
    return (
      <Container size="sm">
        <Alert title={t.loginToEdit}>
          <Anchor component={Link} to={`/account/login?lang=${lang}&next=${encodeURIComponent(`${base}/edit`)}`}>
            {t.login}
          </Anchor>
        </Alert>
      </Container>
    );
  }
  if (!ready || !loaded) {
    return (
      <Container size="md">
        <Loader />
      </Container>
    );
  }

  const { content } = editor;
  const usedRegions = new Set(content.regions.map((block) => block.region));
  const regionOptions = (exclude: Set<Region>) =>
    REGIONS.filter((region) => !exclude.has(region)).map((region) => ({
      value: region,
      label: `${regionFlag(region)} ${regionLabel(region, lang)}`,
    }));
  const verdictOptions = VERDICTS.map((verdict) => ({ value: verdict, label: VERDICT_LABELS[lang][verdict] }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('PUT', `/pages/${lang}/${slug}`, {
        title: editor.title,
        content: editor.content,
        editSummary: editor.editSummary,
        baseRevisionId: page?.currentRevision.id ?? null,
      });
      navigate(base);
    } catch (err) {
      if (err instanceof ClientApiError && err.code === 'edit_conflict') setError(t.conflict);
      else setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setSaving(false);
    }
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1} size="h2">
          {page ? t.editTitle(t.question(page.title)) : t.createTitle(t.question(editor.title))}
        </Title>

        <TextInput
          label={t.subject}
          value={editor.title}
          onChange={(event) => editor.setTitle(event.currentTarget.value)}
          maxLength={120}
          required
        />

        <Stack gap={4}>
          <Text fw={500} size="sm">
            {t.verdict}
          </Text>
          <SegmentedControl
            value={content.verdict}
            onChange={(value) => editor.setVerdict(value as Verdict)}
            data={verdictOptions}
            fullWidth
          />
        </Stack>

        <MarkdownField
          label={t.summary}
          description={t.summaryHint}
          value={content.summary}
          onChange={(value) => editor.setText('summary', value)}
          lang={lang}
          minRows={2}
          maxLength={600}
        />
        <MarkdownField
          label={t.whenFree}
          description={t.markdownHint}
          value={content.whenFree}
          onChange={(value) => editor.setText('whenFree', value)}
          lang={lang}
          maxLength={5000}
        />
        <MarkdownField
          label={t.whenNotFree}
          value={content.whenNotFree}
          onChange={(value) => editor.setText('whenNotFree', value)}
          lang={lang}
          maxLength={5000}
        />

        <Stack gap="sm">
          <Title order={2} size="h4">
            {t.regions}
          </Title>
          {content.regions.map((block, index) => (
            <Card key={block.region} withBorder padding="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={700}>
                    {regionFlag(block.region)} {regionLabel(block.region, lang)}
                  </Text>
                  <Group gap="xs">
                    <Select
                      aria-label={t.verdict}
                      size="xs"
                      w={160}
                      value={block.verdict}
                      allowDeselect={false}
                      data={verdictOptions}
                      onChange={(value) => value && editor.updateRegion(index, { verdict: value as Verdict })}
                    />
                    <ActionIcon variant="subtle" color="red" aria-label={t.remove} onClick={() => editor.removeRegion(index)}>
                      ✕
                    </ActionIcon>
                  </Group>
                </Group>
                <MarkdownField
                  label={t.text}
                  value={block.text}
                  onChange={(value) => editor.updateRegion(index, { text: value })}
                  lang={lang}
                  minRows={2}
                  maxLength={3000}
                />
              </Stack>
            </Card>
          ))}
          <Group gap="xs">
            <Select
              aria-label={t.region}
              placeholder={t.region}
              searchable
              value={newRegion}
              onChange={setNewRegion}
              data={regionOptions(usedRegions)}
              w={240}
            />
            <Button
              variant="light"
              disabled={!newRegion}
              onClick={() => {
                if (newRegion) editor.addRegion(newRegion as Region);
                setNewRegion(null);
              }}
            >
              {t.addRegion}
            </Button>
          </Group>
        </Stack>

        <Stack gap="sm">
          <Title order={2} size="h4">
            {t.sources}
          </Title>
          {content.sources.map((source, index) => (
            <Group key={index} gap="xs" align="end" wrap="nowrap">
              <TextInput
                label={t.sourceTitle}
                value={source.title}
                onChange={(event) => editor.updateSource(index, { title: event.currentTarget.value })}
                style={{ flex: 1 }}
                maxLength={200}
              />
              <TextInput
                label={t.sourceUrl}
                value={source.url}
                onChange={(event) => editor.updateSource(index, { url: event.currentTarget.value })}
                style={{ flex: 2 }}
                maxLength={2000}
              />
              <ActionIcon variant="subtle" color="red" mb={6} aria-label={t.remove} onClick={() => editor.removeSource(index)}>
                ✕
              </ActionIcon>
            </Group>
          ))}
          <div>
            <Button variant="light" onClick={editor.addSource}>
              {t.addSource}
            </Button>
          </div>
        </Stack>

        <TextInput
          label={t.editSummary}
          value={editor.editSummary}
          onChange={(event) => editor.setEditSummary(event.currentTarget.value)}
          maxLength={300}
        />

        {error && <Alert color="red">{error}</Alert>}
        <Group>
          <Button onClick={() => void save()} loading={saving} disabled={!editor.title.trim() || !content.summary.trim()}>
            {t.save}
          </Button>
          <Button component={Link} to={base} variant="default">
            {t.cancel}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
