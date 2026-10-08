import { Alert, Anchor, Badge, Button, Card, Container, Group, Loader, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { SponsorBooking, SponsorRequestStatus } from '@isgratis/types';
import type { Route } from './+types/admin';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { formatDate, messages } from '~/lib/i18n';
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

  async function review(status: SponsorRequestStatus) {
    setError(null);
    try {
      await api('POST', `/admin/sponsors/${booking.id}/review`, {
        status,
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
        <Group justify="space-between">
          <Title order={1} size="h2">
            {t.adminTitle}
          </Title>
          <SegmentedControl
            value={filter}
            onChange={(value) => setFilter(value as SponsorRequestStatus | 'all')}
            data={['pending', 'active', 'rejected', 'expired', 'all']}
          />
        </Group>
        {bookings === null ? <Loader /> : bookings.length === 0 ? <Text c="dimmed">–</Text> : null}
        {bookings?.map((booking) => <BookingCard key={booking.id} booking={booking} onChange={() => void load()} />)}
      </Stack>
    </Container>
  );
}
