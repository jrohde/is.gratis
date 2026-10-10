import { Alert, Anchor, Button, Card, Container, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { data, Link } from 'react-router';
import type { Route } from './+types/mailing';
import { api, ClientApiError } from '~/lib/api.client';
import { CACHE } from '~/lib/cache';
import { messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

export function loader({ params }: Route.LoaderArgs) {
  if (params.action !== 'confirm' && params.action !== 'unsubscribe') throw data(null, { status: 404 });
  return null;
}

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': CACHE.none });
export const meta: Route.MetaFunction = () => [{ title: 'is.gratis' }, { name: 'robots', content: 'noindex' }];

/**
 * The links in the mails land here. Confirming and unsubscribing take a click on a button, not
 * just opening the link: mail systems open links to scan them, and that must not count.
 */
export default function Mailing({ params }: Route.ComponentProps) {
  const lang = useUiLang();
  const t = messages(lang);
  const confirm = params.action === 'confirm';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'invalid'>('idle');

  async function go() {
    setState('busy');
    try {
      await api('POST', `/mailing/${confirm ? 'confirm' : 'unsubscribe'}/${params.token}`);
      setState('done');
    } catch (error) {
      setState(error instanceof ClientApiError && error.status === 404 ? 'invalid' : 'idle');
    }
  }

  return (
    <Container size="xs" py="xl">
      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={1} size="h3">
            {confirm ? t.mailingConfirmTitle : t.mailingUnsubscribeTitle}
          </Title>
          {state === 'done' ? (
            <Alert color="green" variant="light">
              {confirm ? t.mailingConfirmed : t.mailingUnsubscribed}
            </Alert>
          ) : state === 'invalid' ? (
            <Alert color="orange" variant="light">
              {t.mailingInvalid}
            </Alert>
          ) : (
            <div>
              <Button onClick={() => void go()} loading={state === 'busy'} color={confirm ? 'green' : 'gray'}>
                {confirm ? t.mailingConfirmButton : t.mailingUnsubscribeButton}
              </Button>
            </div>
          )}
          <Text size="sm">
            <Anchor component={Link} to={`/${lang}`}>
              is.gratis →
            </Anchor>
          </Text>
        </Stack>
      </Card>
    </Container>
  );
}
