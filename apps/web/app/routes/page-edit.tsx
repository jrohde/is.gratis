import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Card,
  Code,
  Container,
  Group,
  List,
  Loader,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconForms, IconMarkdown, IconPlus, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { data, Link, useNavigate } from 'react-router';
import {
  FREE_TYPE_LABELS,
  FREE_TYPE_LEVEL,
  FREE_TYPES,
  pageToSource,
  parseSource,
  REGIONS,
  SECTION_LABELS,
  VERDICT_LABELS,
  VERDICTS,
  type FreeType,
  type Page,
  type Region,
  type SourceError,
  type Verdict,
} from '@isgratis/types';
import type { Route } from './+types/page-edit';
import { ImageField } from '~/components/ImageField';
import { MarkdownField } from '~/components/MarkdownField';
import { api, ClientApiError } from '~/lib/api.client';
import { apiGetOptional } from '~/lib/api.server';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { parseLang, parseSlug } from '~/lib/params';
import { DEFAULT_REGION, regionFlag, regionLabel } from '~/lib/regions';
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

type Mode = 'form' | 'source';

export default function PageEdit({ loaderData }: Route.ComponentProps) {
  const { lang, slug, page } = loaderData;
  const t = messages(lang);
  const sections = SECTION_LABELS[lang];
  const navigate = useNavigate();
  const { user, loaded } = useSession();
  const editor = useEditor();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('form');
  const [source, setSource] = useState('');
  const [sourceErrors, setSourceErrors] = useState<SourceError[]>([]);
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
  const regionOptions = (exclude: Set<Region> = new Set()) =>
    REGIONS.filter((region) => !exclude.has(region)).map((region) => ({
      value: region,
      label: `${regionFlag(region)} ${regionLabel(region, lang)}`,
    }));
  const verdictOptions = VERDICTS.map((verdict) => ({ value: verdict, label: VERDICT_LABELS[lang][verdict] }));

  /** Applies the Markdown source to the form state. Returns false when it has errors. */
  function applySource(): boolean {
    const parsed = parseSource(source, lang);
    if (!parsed.ok) {
      setSourceErrors(parsed.errors);
      return false;
    }
    setSourceErrors([]);
    editor.replace(parsed.title, { ...parsed.content, ...(content.image ? { image: content.image } : {}) });
    return true;
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === 'source') {
      setSource(pageToSource(editor.title, useEditor.getState().content, lang));
      setSourceErrors([]);
      setMode('source');
    } else if (applySource()) {
      setMode('form');
    }
  }

  async function save() {
    if (mode === 'source' && !applySource()) return;
    const state = useEditor.getState();
    setSaving(true);
    setError(null);
    try {
      await api('PUT', `/pages/${lang}/${slug}`, {
        title: state.title,
        content: state.content,
        editSummary: state.editSummary,
        baseRevisionId: page?.currentRevision.id ?? null,
      });
      navigate(base);
    } catch (err) {
      if (err instanceof ClientApiError && err.code === 'edit_conflict') setError(t.conflict);
      else setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setSaving(false);
    }
  }

  const tp = content.timePrice;

  return (
    <Container size="md">
      <Stack gap="lg">
        <Group justify="space-between" align="end">
          <Title order={1} size="h2">
            {page ? t.editTitle(t.question(page.title)) : t.createTitle(t.question(editor.title))}
          </Title>
          <SegmentedControl
            value={mode}
            onChange={(value) => switchMode(value as Mode)}
            data={[
              {
                value: 'form',
                label: (
                  <Group gap={6} wrap="nowrap">
                    <IconForms size={16} />
                    {t.formMode}
                  </Group>
                ),
              },
              {
                value: 'source',
                label: (
                  <Group gap={6} wrap="nowrap">
                    <IconMarkdown size={16} />
                    {t.sourceMode}
                  </Group>
                ),
              },
            ]}
          />
        </Group>

        <ImageField
          lang={lang}
          slug={slug}
          title={editor.title}
          pageExists={Boolean(page)}
          image={content.image}
          onChange={editor.setImage}
        />

        {mode === 'source' ? (
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              {t.sourceHint}
            </Text>
            <Textarea
              aria-label={t.sourceMode}
              value={source}
              onChange={(event) => setSource(event.currentTarget.value)}
              autosize
              minRows={24}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13, lineHeight: 1.55 } }}
              spellCheck
            />
            {sourceErrors.length > 0 && (
              <Alert color="red" title={t.sourceErrors}>
                <List size="sm">
                  {sourceErrors.map((issue) => (
                    <List.Item key={`${issue.line}-${issue.message}`}>
                      <Code>
                        {t.line} {issue.line}
                      </Code>{' '}
                      {issue.message}
                    </List.Item>
                  ))}
                </List>
              </Alert>
            )}
          </Stack>
        ) : (
          <Stack gap="lg">
            <Group grow align="end">
              <TextInput
                label={t.subject}
                value={editor.title}
                onChange={(event) => editor.setTitle(event.currentTarget.value)}
                maxLength={120}
                required
              />
              <TextInput
                label={t.emoji}
                value={content.emoji ?? ''}
                onChange={(event) => editor.setEmoji(event.currentTarget.value.trim())}
                maxLength={16}
                maw={120}
              />
            </Group>

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

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={t.scaleType}
                placeholder={t.noScale}
                clearable
                value={content.scale?.type ?? null}
                data={FREE_TYPES.map((type) => ({
                  value: type,
                  label: `${FREE_TYPE_LEVEL[type]} · ${FREE_TYPE_LABELS[lang][type]}`,
                }))}
                onChange={(value) =>
                  editor.setScale(
                    value ? { type: value as FreeType, region: content.scale?.region ?? DEFAULT_REGION[lang] } : undefined,
                  )
                }
              />
              <Select
                label={t.scaleRegion}
                searchable
                disabled={!content.scale}
                value={content.scale?.region ?? null}
                allowDeselect={false}
                data={regionOptions()}
                onChange={(value) => content.scale && value && editor.setScale({ ...content.scale, region: value as Region })}
              />
            </SimpleGrid>

            <MarkdownField
              label={sections.whenFree}
              description={t.markdownHint}
              value={content.whenFree}
              onChange={(value) => editor.setText('whenFree', value)}
              lang={lang}
              sources={content.sources}
              maxLength={5000}
            />
            <MarkdownField
              label={sections.whenNotFree}
              value={content.whenNotFree}
              onChange={(value) => editor.setText('whenNotFree', value)}
              lang={lang}
              sources={content.sources}
              maxLength={5000}
            />
            <MarkdownField
              label={sections.background}
              value={content.background}
              onChange={(value) => editor.setText('background', value)}
              lang={lang}
              sources={content.sources}
              maxLength={8000}
            />

            <Stack gap="sm">
              <Title order={2} size="h4">
                {sections.facts}
              </Title>
              {content.facts.map((fact, index) => (
                <Group key={index} gap="xs" align="end" wrap="nowrap">
                  <TextInput
                    label={t.factLabel}
                    value={fact.label}
                    maxLength={80}
                    onChange={(event) => editor.updateFact(index, { label: event.currentTarget.value })}
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    label={t.factValue}
                    value={fact.value}
                    maxLength={200}
                    onChange={(event) => editor.updateFact(index, { value: event.currentTarget.value })}
                    style={{ flex: 2 }}
                  />
                  <TextInput
                    label={t.factSource}
                    value={fact.sourceUrl ?? ''}
                    onChange={(event) => editor.updateFact(index, { sourceUrl: event.currentTarget.value })}
                    style={{ flex: 1.5 }}
                  />
                  <ActionIcon variant="subtle" color="red" mb={6} aria-label={t.remove} onClick={() => editor.removeFact(index)}>
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <div>
                <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={editor.addFact}>
                  {t.addFact}
                </Button>
              </div>
            </Stack>

            <Stack gap="sm">
              <Title order={2} size="h4">
                {sections.trivia}
              </Title>
              {content.trivia.map((item, index) => (
                <Group key={index} gap="xs" align="end" wrap="nowrap">
                  <TextInput
                    aria-label={t.triviaItem}
                    placeholder={t.triviaItem}
                    value={item}
                    maxLength={300}
                    onChange={(event) => editor.updateTrivia(index, event.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon variant="subtle" color="red" mb={6} aria-label={t.remove} onClick={() => editor.removeTrivia(index)}>
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <div>
                <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={editor.addTrivia}>
                  {t.addTrivia}
                </Button>
              </div>
            </Stack>

            <Stack gap="sm">
              <Title order={2} size="h4">
                {t.timePrice}
              </Title>
              {tp ? (
                <Card withBorder padding="md">
                  <Stack gap="xs">
                    <TextInput
                      label={t.timePriceUnit}
                      value={tp.unit}
                      maxLength={80}
                      onChange={(event) => editor.setTimePrice({ ...tp, unit: event.currentTarget.value })}
                    />
                    <SimpleGrid cols={{ base: 2, sm: 4 }}>
                      <NumberInput
                        label={t.timePricePrice}
                        value={tp.price}
                        min={0}
                        decimalScale={6}
                        onChange={(value) => editor.setTimePrice({ ...tp, price: Number(value) || 0 })}
                      />
                      <NumberInput
                        label={t.timePriceHourlyWage}
                        value={tp.hourlyWage}
                        min={0}
                        decimalScale={2}
                        onChange={(value) => editor.setTimePrice({ ...tp, hourlyWage: Number(value) || 0 })}
                      />
                      <TextInput
                        label={t.timePriceCurrency}
                        value={tp.currency}
                        maxLength={3}
                        onChange={(event) => editor.setTimePrice({ ...tp, currency: event.currentTarget.value.toUpperCase() })}
                      />
                      <Select
                        label={t.region}
                        searchable
                        allowDeselect={false}
                        value={tp.region}
                        data={regionOptions()}
                        onChange={(value) => value && editor.setTimePrice({ ...tp, region: value as Region })}
                      />
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <TextInput
                        label={t.timePriceSourceTitle}
                        value={tp.source.title}
                        maxLength={200}
                        onChange={(event) => editor.setTimePrice({ ...tp, source: { ...tp.source, title: event.currentTarget.value } })}
                      />
                      <TextInput
                        label={t.sourceUrl}
                        value={tp.source.url}
                        onChange={(event) => editor.setTimePrice({ ...tp, source: { ...tp.source, url: event.currentTarget.value } })}
                      />
                    </SimpleGrid>
                    <div>
                      <Button size="xs" variant="subtle" color="red" onClick={() => editor.setTimePrice(undefined)}>
                        {t.removeTimePrice}
                      </Button>
                    </div>
                  </Stack>
                </Card>
              ) : (
                <div>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() =>
                      editor.setTimePrice({
                        unit: '',
                        price: 0,
                        hourlyWage: 0,
                        currency: 'EUR',
                        region: DEFAULT_REGION[lang],
                        source: { title: '', url: 'https://' },
                      })
                    }
                  >
                    {t.addTimePrice}
                  </Button>
                </div>
              )}
            </Stack>

            <Stack gap="sm">
              <Title order={2} size="h4">
                {sections.regions}
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
                          <IconX size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <MarkdownField
                      label={t.text}
                      value={block.text}
                      onChange={(value) => editor.updateRegion(index, { text: value })}
                      lang={lang}
                      sources={content.sources}
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
                  leftSection={<IconPlus size={14} />}
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
                {sections.sources}
              </Title>
              <Text size="xs" c="dimmed">
                {t.citeHint}
              </Text>
              {content.sources.map((source, index) => (
                <Group key={index} gap="xs" align="end" wrap="nowrap">
                  <Text fw={700} c="dimmed" mb={8} w={28}>
                    [{index + 1}]
                  </Text>
                  <TextInput
                    label={t.sourceId}
                    value={source.id}
                    onChange={(event) =>
                      editor.updateSource(index, { id: event.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })
                    }
                    w={150}
                    maxLength={40}
                  />
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
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <div>
                <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={editor.addSource}>
                  {t.addSource}
                </Button>
              </div>
            </Stack>
          </Stack>
        )}

        <TextInput
          label={t.editSummary}
          value={editor.editSummary}
          onChange={(event) => editor.setEditSummary(event.currentTarget.value)}
          maxLength={300}
        />

        {error && <Alert color="red">{error}</Alert>}
        <Group>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={mode === 'form' && (!editor.title.trim() || !content.summary.trim())}
          >
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
