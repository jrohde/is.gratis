import { Alert, Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { useState } from 'react';
import { REGIONS, type Language, type MailingList, type Region } from '@isgratis/types';
import { api, ClientApiError } from '~/lib/api.client';
import { messages } from '~/lib/i18n';
import { DEFAULT_REGION, regionFlag, regionLabel } from '~/lib/regions';

/** Countries only: "EU" and "WORLD" are what offers can be valid for, not where people live. */
const COUNTRIES = REGIONS.filter((region) => region !== 'EU' && region !== 'WORLD');

/** Sign up for one mailing list. Nothing is sent before the address is confirmed by mail. */
export function MailingSignup({ list, lang }: { list: MailingList; lang: Language }) {
  const t = messages(lang);
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState<string>(DEFAULT_REGION[lang]);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('busy');
    setError(null);
    try {
      await api('POST', '/mailing/subscribe', {
        email,
        list,
        lang,
        region: list === 'offers' && region !== 'all' ? (region as Region) : null,
      });
      setState('done');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : t.errorGeneric);
      setState('idle');
    }
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group gap="xs">
          <IconMail size={18} aria-hidden />
          <Title order={2} size="h4">
            {t.mailingTitle[list]}
          </Title>
        </Group>
        <Text size="sm" c="dimmed">
          {t.mailingIntro[list]}
        </Text>
        {state === 'done' ? (
          <Alert color="green" variant="light">
            {t.mailingCheck}
          </Alert>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <Group align="end" gap="xs">
              <TextInput
                type="email"
                required
                label={t.email}
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                style={{ flex: 1, minWidth: 200 }}
              />
              {list === 'offers' && (
                <Select
                  label={t.mailingRegion}
                  value={region}
                  onChange={(value) => setRegion(value ?? 'all')}
                  data={[
                    { value: 'all', label: t.mailingAllRegions },
                    ...COUNTRIES.map((code) => ({ value: code, label: `${regionFlag(code)} ${regionLabel(code, lang)}` })),
                  ]}
                  allowDeselect={false}
                  w={190}
                />
              )}
              <Button type="submit" loading={state === 'busy'}>
                {t.mailingSubscribe}
              </Button>
            </Group>
          </form>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Text size="xs" c="dimmed">
          {t.mailingPrivacy}
        </Text>
      </Stack>
    </Card>
  );
}
