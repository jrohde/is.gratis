import { Alert, Anchor, Button, Card, Container, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Route } from './+types/register';
import { ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { safeNext } from '~/lib/navigation';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'is.gratis' }, { name: 'robots', content: 'noindex' }];

export default function Register() {
  const lang = useUiLang();
  const t = messages(lang);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const register = useSession((state) => state.register);
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(search.get('next'), `/${lang}`);
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: event.currentTarget.value });

  return (
    <Container size={420}>
      <Card withBorder padding="xl">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await register(form.email, form.password, form.displayName);
              navigate(next);
            } catch (err) {
              setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
              setBusy(false);
            }
          }}
        >
          <Stack>
            <Title order={1} size="h2">
              {t.register}
            </Title>
            <TextInput label={t.displayName} required minLength={2} maxLength={40} value={form.displayName} onChange={set('displayName')} />
            <TextInput label={t.email} type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
            <PasswordInput
              label={t.password}
              description={t.passwordHint}
              autoComplete="new-password"
              required
              minLength={10}
              value={form.password}
              onChange={set('password')}
            />
            {error && <Alert color="red">{error}</Alert>}
            <Button type="submit" loading={busy}>
              {t.register}
            </Button>
            <Text size="sm">
              {t.haveAccount}{' '}
              <Anchor component={Link} to={`/account/login?lang=${lang}&next=${encodeURIComponent(next)}`}>
                {t.login}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}
