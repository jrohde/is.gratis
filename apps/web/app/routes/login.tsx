import { Alert, Anchor, Button, Card, Container, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Route } from './+types/login';
import { ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { safeNext } from '~/lib/navigation';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'is.gratis' }, { name: 'robots', content: 'noindex' }];

export default function Login() {
  const lang = useUiLang();
  const t = messages(lang);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const login = useSession((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(search.get('next'), `/${lang}`);

  return (
    <Container size={420}>
      <Card withBorder padding="xl">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await login(email, password);
              navigate(next);
            } catch (err) {
              setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
              setBusy(false);
            }
          }}
        >
          <Stack>
            <Title order={1} size="h2">
              {t.login}
            </Title>
            <TextInput label={t.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            <PasswordInput label={t.password} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
            {error && <Alert color="red">{error}</Alert>}
            <Button type="submit" loading={busy}>
              {t.login}
            </Button>
            <Text size="sm">
              {t.noAccount}{' '}
              <Anchor component={Link} to={`/account/register?lang=${lang}&next=${encodeURIComponent(next)}`}>
                {t.register}
              </Anchor>
            </Text>
            {/* Accounts are for writers; advertisers sign in with a link by mail. */}
            <Text size="sm" c="dimmed">
              {t.advertiserLoginHint}{' '}
              <Anchor component={Link} to={`/advertise/portal?lang=${lang}`}>
                {t.portalTitle}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}
