import { Anchor, Box, Button, Container, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LANGUAGES } from '@isgratis/types';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';
import { usePreferences } from '~/stores/preferences';

function Logo({ href }: { href: string }) {
  return (
    <Anchor component={Link} to={href} underline="never" c="inherit" fw={900} fz={24} lh={1}>
      is.
      <Text span inherit c="green.7">
        gratis
      </Text>
    </Anchor>
  );
}

function UserMenu() {
  const lang = useUiLang();
  const t = messages(lang);
  const { user, loaded, logout } = useSession();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);

  if (!loaded) return <Box w={90} />;
  if (!user) {
    return (
      <Button component={Link} to={`/account/login?lang=${lang}&next=${next}`} variant="subtle" size="compact-md">
        {t.login}
      </Button>
    );
  }
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton fw={600}>{user.displayName}</UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {user.role === 'admin' && (
          <Menu.Item component={Link} to={`/admin?lang=${lang}`}>
            Admin
          </Menu.Item>
        )}
        <Menu.Item onClick={() => void logout()}>{t.logout}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function LanguageMenu() {
  const lang = useUiLang();
  const navigate = useNavigate();
  const setLang = usePreferences((state) => state.setLang);
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton fw={600} tt="uppercase" aria-label="Language">
          {lang}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGUAGES.map((code) => (
          <Menu.Item
            key={code}
            onClick={() => {
              setLang(code);
              navigate(`/${code}`);
            }}
          >
            {LANGUAGE_NAMES[code]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const lang = useUiLang();
  const t = messages(lang);
  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" py="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Container size="md">
          <Group justify="space-between">
            <Logo href={`/${lang}`} />
            <Group gap="md">
              <LanguageMenu />
              <UserMenu />
            </Group>
          </Group>
        </Container>
      </Box>
      <Box component="main" py="xl" style={{ flex: 1 }}>
        {children}
      </Box>
      <Box component="footer" py="lg" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Container size="md">
          <Group justify="space-between" gap="xs">
            <Text size="sm" c="dimmed">
              {t.footer}
            </Text>
            <Group gap="md">
              <Anchor component={Link} to={`/advertise?lang=${lang}`} size="sm" c="dimmed">
                {t.advertiseTitle}
              </Anchor>
              <Anchor href="/api/docs" size="sm" c="dimmed">
                {t.api}
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  );
}
