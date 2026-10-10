import { Alert, Button, Card, Container, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Route } from './+types/advertise-login';
import { api } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'Inloggen · is.gratis' }, { name: 'robots', content: 'noindex' }];

/**
 * The link from the sign-in mail lands here. Signing in takes a click: mail systems open links
 * to scan them, and the link works only once.
 */
export default function AdvertiseLogin({ params }: Route.ComponentProps) {
  const lang = useUiLang();
  const t = messages(lang);
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'busy' | 'invalid'>('idle');

  async function signIn() {
    setState('busy');
    try {
      await api('POST', `/advertisers/login/${params.token}`);
      navigate(`/advertise/portal?lang=${lang}`);
    } catch {
      setState('invalid');
    }
  }

  return (
    <Container size="xs" py="xl">
      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={1} size="h3">
            {t.portalLoginTitle}
          </Title>
          {state === 'invalid' ? (
            <Alert color="orange" variant="light">
              {t.portalLoginInvalid}{' '}
              <Text component={Link} to={`/advertise/portal?lang=${lang}`} fw={700} inherit>
                {t.portalSendLink}
              </Text>
            </Alert>
          ) : (
            <div>
              <Button onClick={() => void signIn()} loading={state === 'busy'}>
                {t.portalLoginButton}
              </Button>
            </div>
          )}
        </Stack>
      </Card>
    </Container>
  );
}
