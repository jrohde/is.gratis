import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LANGUAGES, toSlug, type Language, type SponsorBooking, type SponsorRequestStatus } from '@isgratis/types';
import type { Route } from './+types/admin';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { formatDate, formatNumber, formatPrice, LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { STARTER_TOPICS } from '@isgratis/types';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'Admin · is.gratis' }, { name: 'robots', content: 'noindex' }];

const STATUS_COLORS: Record<SponsorRequestStatus, string> = {
  pending: 'yellow',
  active: 'green',
  rejected: 'gray',
  expired: 'gray',
};

/** Date input (yyyy-mm-dd) to an ISO timestamp at the start or end of that day, UTC. */
function dayToIso(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).toISOString();
}

function BookingCard({ booking, onChange }: { booking: SponsorBooking; onChange: () => void }) {
  const lang = useUiLang();
  const t = messages(lang);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useSuggestion, setUseSuggestion] = useState(false);
  const advice = booking.editor;

  async function review(status: SponsorRequestStatus) {
    setError(null);
    // Going live without the editor's approval is allowed, but only on purpose.
    const override = status === 'active' && advice !== null && advice.decision !== 'approve';
    if (override && !window.confirm(t.overrideEditor)) return;
    try {
      await api('POST', `/admin/sponsors/${booking.id}/review`, {
        status,
        override,
        applySuggestion: status === 'active' && useSuggestion,
        startsAt: status === 'active' ? dayToIso(startsAt, false) : booking.startsAt,
        endsAt: status === 'active' ? dayToIso(endsAt, true) : status === 'expired' ? new Date().toISOString() : booking.endsAt,
      });
      onChange();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap={6}>
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color={STATUS_COLORS[booking.status]}>{booking.status}</Badge>
            <Anchor component={Link} to={`/${booking.lang}/${booking.slug}`} fw={700}>
              /{booking.lang}/{booking.slug}
            </Anchor>
            {booking.region && <Badge variant="outline">{booking.region}</Badge>}
            {booking.priceCents !== null && (
              <Badge variant="light" color="green">
                {formatPrice(booking.priceCents, lang)} / mnd
              </Badge>
            )}
            {booking.exclusive && (
              <Badge variant="filled" color="dark">
                {t.exclusiveBadge}
              </Badge>
            )}
            {booking.inMailing && (
              <Badge variant="light" color="grape">
                {t.inMailing}
                {booking.mailingPriceCents !== null ? ` +${formatPrice(booking.mailingPriceCents, lang)}` : ''}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {formatDate(booking.createdAt, lang)}
          </Text>
        </Group>
        <Text fw={700}>{booking.title}</Text>
        <Text size="sm">{booking.description}</Text>
        <Text size="sm">
          {booking.advertiserName} · <Anchor href={`mailto:${booking.contactEmail}`}>{booking.contactEmail}</Anchor> ·{' '}
          <Anchor href={booking.url} target="_blank" rel="noopener noreferrer">
            {booking.url}
          </Anchor>
        </Text>
        {booking.message && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
            {booking.message}
          </Text>
        )}
        {(booking.startsAt || booking.endsAt) && (
          <Text size="xs" c="dimmed">
            {booking.startsAt ? formatDate(booking.startsAt, lang) : '…'} – {booking.endsAt ? formatDate(booking.endsAt, lang) : '…'}
          </Text>
        )}
        {booking.status === 'pending' &&
          (advice ? (
            <Alert
              color={advice.decision === 'approve' ? 'green' : advice.decision === 'reject' ? 'red' : 'orange'}
              variant="light"
              p="xs"
              title={t.offerEditor[advice.decision]}
            >
              <Stack gap={6}>
                <Text size="sm">{advice.notes}</Text>
                {advice.suggestion && (
                  <>
                    <Text size="sm" fw={600}>
                      {t.offerSuggestion}
                    </Text>
                    {advice.suggestion.title && <Text size="sm">{advice.suggestion.title}</Text>}
                    {advice.suggestion.description && <Text size="sm">{advice.suggestion.description}</Text>}
                    <Checkbox
                      size="xs"
                      label={t.applySuggestion}
                      checked={useSuggestion}
                      onChange={(e) => setUseSuggestion(e.currentTarget.checked)}
                    />
                  </>
                )}
              </Stack>
            </Alert>
          ) : (
            <Text size="xs" c="dimmed">
              {t.offerEditorPending}
            </Text>
          ))}
        {error && <Alert color="red">{error}</Alert>}
        {booking.status === 'pending' && (
          <Group align="end" gap="xs">
            <TextInput type="date" label={t.startsAt} size="xs" value={startsAt} onChange={(e) => setStartsAt(e.currentTarget.value)} />
            <TextInput type="date" label={t.endsAt} size="xs" value={endsAt} onChange={(e) => setEndsAt(e.currentTarget.value)} />
            <Button size="xs" onClick={() => void review('active')}>
              {t.approve}
            </Button>
            <Button size="xs" variant="default" onClick={() => void review('rejected')}>
              {t.reject}
            </Button>
          </Group>
        )}
        {booking.status === 'active' && (
          <div>
            <Button size="xs" variant="default" onClick={() => void review('expired')}>
              {t.end}
            </Button>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function BulkDrafts() {
  const uiLang = useUiLang();
  const t = messages(uiLang);
  const [lang, setLang] = useState<Language>(uiLang);
  const [subjects, setSubjects] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ queued: string[]; skipped: Array<{ slug: string; reason: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const slugs = subjects.split('\n').map(toSlug).filter((slug): slug is string => Boolean(slug));
    if (slugs.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api('POST', '/admin/drafts', { lang, slugs: slugs.slice(0, 200) }));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="sm">
        {t.bulkHelp}
      </Text>
      <Group align="end">
        <Select
          label={t.pageLanguage}
          value={lang}
          allowDeselect={false}
          data={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))}
          onChange={(value) => value && setLang(value as Language)}
          w={180}
        />
        <Button variant="default" onClick={() => setSubjects(STARTER_TOPICS[lang].join('\n'))}>
          {t.bulkSuggest}
        </Button>
      </Group>
      <Textarea autosize minRows={8} maxRows={20} value={subjects} onChange={(event) => setSubjects(event.currentTarget.value)} />
      {error && <Alert color="red">{error}</Alert>}
      {result && (
        <Alert color="green">
          {t.bulkResult(result.queued.length, result.skipped.length)}
          {result.skipped.length > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              {result.skipped.map((item) => `${item.slug} (${item.reason})`).join(', ')}
            </Text>
          )}
        </Alert>
      )}
      <Group>
        <Button onClick={() => void submit()} loading={busy}>
          {t.bulkSubmit}
        </Button>
        <Anchor component={Link} to={`/review?lang=${uiLang}`} size="sm">
          {t.reviewTitle} →
        </Anchor>
      </Group>
    </Stack>
  );
}

function BulkTranslate() {
  const uiLang = useUiLang();
  const t = messages(uiLang);
  const [from, setFrom] = useState<Language>(uiLang);
  const [to, setTo] = useState<Language>(uiLang === 'en' ? 'nl' : 'en');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const options = LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }));

  async function submit() {
    setBusy(true);
    try {
      const { queued, skipped } = await api<{ queued: number; skipped: number }>('POST', '/admin/translations', { from, to, limit: 200 });
      setResult(t.bulkTranslateResult(queued, skipped));
    } catch (err) {
      setResult(err instanceof ClientApiError ? err.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="sm" mt="xl">
      <Title order={3} size="h4">
        {t.bulkTranslateTitle}
      </Title>
      <Text c="dimmed" size="sm">
        {t.bulkTranslateHelp}
      </Text>
      <Group align="end">
        <Select label={t.from} value={from} allowDeselect={false} data={options} onChange={(v) => v && setFrom(v as Language)} w={160} />
        <Select label={t.to} value={to} allowDeselect={false} data={options} onChange={(v) => v && setTo(v as Language)} w={160} />
        <Button onClick={() => void submit()} loading={busy} disabled={from === to}>
          {t.bulkSubmit}
        </Button>
      </Group>
      {result && <Alert color="green">{result}</Alert>}
    </Stack>
  );
}

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'moderator' | 'admin';
  createdAt: string;
}

function Users() {
  const lang = useUiLang();
  const t = messages(lang);
  const me = useSession((state) => state.user);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const load = useCallback(async () => {
    const result = await api<{ users: AdminUser[] }>('GET', `/admin/users?q=${encodeURIComponent(q.trim())}`);
    setUsers(result.users);
  }, [q]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  return (
    <Stack gap="sm">
      <TextInput placeholder={t.usersSearch} value={q} onChange={(e) => setQ(e.currentTarget.value)} maw={360} />
      {users === null ? (
        <Loader />
      ) : (
        <Table striped>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td fw={600}>{user.displayName}</Table.Td>
                <Table.Td c="dimmed">{user.email}</Table.Td>
                <Table.Td c="dimmed">{formatDate(user.createdAt, lang)}</Table.Td>
                <Table.Td w={170}>
                  <Select
                    size="xs"
                    value={user.role}
                    allowDeselect={false}
                    disabled={user.id === me?.id}
                    data={[
                      { value: 'user', label: t.roles.user },
                      { value: 'moderator', label: t.roles.moderator },
                      { value: 'admin', label: t.roles.admin },
                    ]}
                    onChange={(role) => role && void api('POST', `/admin/users/${user.id}/role`, { role }).then(load)}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

interface BotRun {
  task: string;
  key: string;
  status: 'running' | 'done' | 'failed';
  attempts: number;
  detail: string | null;
  updatedAt: string;
}

const RUN_COLORS = { running: 'blue', done: 'green', failed: 'red' } as const;

interface EditorReview {
  lang: string;
  slug: string;
  title: string;
  decision: 'publish' | 'revise' | 'reject' | 'error';
  notes: string;
  createdAt: string;
}

const DECISION_COLORS = { publish: 'green', revise: 'teal', reject: 'orange', error: 'red' } as const;

interface MailingStats {
  lists: Array<{ list: string; lang: string; confirmed: number; waiting: number }>;
  outbox: Record<string, number>;
}

/** Subscribers per list and language, and what the outbox is doing. */
function MailingNumbers() {
  const t = messages(useUiLang());
  const [stats, setStats] = useState<MailingStats | null>(null);
  useEffect(() => {
    void api<MailingStats>('GET', '/admin/mailing').then(setStats);
  }, []);
  if (stats === null) return <Loader />;
  return (
    <Stack gap="xs">
      {stats.lists.length === 0 ? (
        <Text c="dimmed">—</Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {stats.lists.map((row) => (
              <Table.Tr key={`${row.list}/${row.lang}`}>
                <Table.Td fw={600}>{row.list}</Table.Td>
                <Table.Td tt="uppercase">{row.lang}</Table.Td>
                <Table.Td>
                  {row.confirmed} {t.mailingConfirmedCount}
                </Table.Td>
                <Table.Td c="dimmed">
                  {row.waiting} {t.mailingWaitingCount}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Text size="sm" c="dimmed">
        {t.mailingOutbox}:{' '}
        {['queued', 'sent', 'failed'].map((status) => `${status} ${stats.outbox[status] ?? 0}`).join(' · ')}
      </Text>
    </Stack>
  );
}

/** What the editorial language model decided, newest first. */
function EditorReviews() {
  const lang = useUiLang();
  const [reviews, setReviews] = useState<EditorReview[] | null>(null);
  useEffect(() => {
    void api<{ reviews: EditorReview[] }>('GET', '/admin/editor').then((result) => setReviews(result.reviews));
  }, []);
  if (reviews === null) return <Loader />;
  if (reviews.length === 0) return <Text c="dimmed">—</Text>;
  return (
    <Table striped>
      <Table.Tbody>
        {reviews.map((review, i) => (
          <Table.Tr key={i}>
            <Table.Td>
              <Badge color={DECISION_COLORS[review.decision]} variant="light">
                {review.decision}
              </Badge>
            </Table.Td>
            <Table.Td fw={600}>
              <Anchor component={Link} to={`/${review.lang}/${review.slug}`}>
                {review.title}
              </Anchor>
            </Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{review.notes}</Table.Td>
            <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {new Date(review.createdAt).toLocaleString(lang)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** What the bot did: every run of every task, newest first. */
function BotRuns() {
  const lang = useUiLang();
  const t = messages(lang);
  const [runs, setRuns] = useState<BotRun[] | null>(null);
  useEffect(() => {
    void api<{ runs: BotRun[] }>('GET', '/admin/bot').then((result) => setRuns(result.runs));
  }, []);
  if (runs === null) return <Loader />;
  if (runs.length === 0) return <Text c="dimmed">{t.botEmpty}</Text>;
  return (
    <Table striped>
      <Table.Tbody>
        {runs.map((run) => (
          <Table.Tr key={`${run.task}/${run.key}`}>
            <Table.Td>
              <Badge color={RUN_COLORS[run.status]} variant="light">
                {run.status}
              </Badge>
            </Table.Td>
            <Table.Td fw={600}>{run.task}</Table.Td>
            <Table.Td c="dimmed">{run.key}</Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{run.detail}</Table.Td>
            <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {new Date(run.updatedAt).toLocaleString(lang)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

interface ViewRow {
  lang: Language;
  slug: string;
  title: string;
  views30: number;
  priceCents: number;
}

function ViewStats() {
  const lang = useUiLang();
  const t = messages(lang);
  const [rows, setRows] = useState<ViewRow[] | null>(null);
  useEffect(() => {
    void api<{ pages: ViewRow[] }>('GET', '/admin/views?limit=100').then((result) => setRows(result.pages));
  }, []);
  if (rows === null) return <Loader />;
  if (rows.length === 0) return <Text c="dimmed">–</Text>;
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t.viewsTitle}</Table.Th>
          <Table.Th ta="right">{t.viewsLabel}</Table.Th>
          <Table.Th ta="right">{t.quoteTitle}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.lang}/${row.slug}`}>
            <Table.Td>
              <Anchor component={Link} to={`/${row.lang}/${row.slug}`}>
                /{row.lang}/{row.slug}
              </Anchor>
            </Table.Td>
            <Table.Td ta="right">{formatNumber(row.views30, lang)}</Table.Td>
            <Table.Td ta="right">{formatPrice(row.priceCents, lang)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export default function Admin() {
  const lang = useUiLang();
  const t = messages(lang);
  const { user, loaded } = useSession();
  const [filter, setFilter] = useState<SponsorRequestStatus | 'all'>('pending');
  const [bookings, setBookings] = useState<SponsorBooking[] | null>(null);

  const load = useCallback(async () => {
    const query = filter === 'all' ? '' : `?status=${filter}`;
    const result = await api<{ bookings: SponsorBooking[] }>('GET', `/admin/sponsors${query}`);
    setBookings(result.bookings);
  }, [filter]);

  useEffect(() => {
    if (user?.role === 'admin') void load();
  }, [user, load]);

  if (!loaded) return <Container><Loader /></Container>;
  if (user?.role !== 'admin') {
    return (
      <Container size="sm">
        <Alert color="red">{t.notAllowed}</Alert>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1} size="h2">
          {t.adminTitle}
        </Title>
        <Tabs defaultValue="sponsors" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="sponsors">{t.advertiseTitle}</Tabs.Tab>
            <Tabs.Tab value="drafts">{t.bulkTitle}</Tabs.Tab>
            <Tabs.Tab value="views">{t.viewsTitle}</Tabs.Tab>
            <Tabs.Tab value="users">{t.usersTitle}</Tabs.Tab>
            <Tabs.Tab value="bot">Bot</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="sponsors">
            <Stack gap="md">
              <SegmentedControl
                value={filter}
                onChange={(value) => setFilter(value as SponsorRequestStatus | 'all')}
                data={['pending', 'active', 'rejected', 'expired', 'all']}
              />
              {bookings === null ? <Loader /> : bookings.length === 0 ? <Text c="dimmed">–</Text> : null}
              {bookings?.map((booking) => <BookingCard key={booking.id} booking={booking} onChange={() => void load()} />)}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="drafts">
            <BulkDrafts />
            <BulkTranslate />
          </Tabs.Panel>
          <Tabs.Panel value="views">
            <ViewStats />
          </Tabs.Panel>
          <Tabs.Panel value="users">
            <Users />
          </Tabs.Panel>
          <Tabs.Panel value="bot">
            <Stack gap="lg">
              <Title order={3}>{t.editorDecisions}</Title>
              <EditorReviews />
              <Title order={3}>{t.mailingStatsTitle}</Title>
              <MailingNumbers />
              <Title order={3}>{t.botRuns}</Title>
              <BotRuns />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
