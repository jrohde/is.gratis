import { Anchor, Box, Button, Container, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChecklist, IconEye, IconLanguage, IconLogout, IconSettings, IconUser } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LANGUAGES, LOGO_LINE, SLOGAN } from '@isgratis/types';
import { LANGUAGE_NAMES, messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';
import { useSession } from '~/stores/session';
import { usePreferences } from '~/stores/preferences';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

function UserMenu() {
  const lang = useUiLang();
  const t = messages(lang);
  const { user, loaded, logout } = useSession();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);

  if (!loaded) return <Box w={90} />;
  if (!user) {
    return (
      <Button
        component={Link}
        to={`/account/login?lang=${lang}&next=${next}`}
        variant="subtle"
        size="compact-md"
        leftSection={<IconUser size={16} />}
      >
        {t.login}
      </Button>
    );
  }
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton fw={600}>
          <Group gap={6} wrap="nowrap">
            <IconUser size={16} aria-hidden />
            {user.displayName}
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to={`/account/watchlist?lang=${lang}`} leftSection={<IconEye size={16} />}>
          {t.watchlist}
        </Menu.Item>
        <Menu.Item component={Link} to={`/review?lang=${lang}`} leftSection={<IconChecklist size={16} />}>
          {t.review}
        </Menu.Item>
        {user.role === 'admin' && (
          <Menu.Item component={Link} to={`/admin?lang=${lang}`} leftSection={<IconSettings size={16} />}>
            Admin
          </Menu.Item>
        )}
        <Menu.Item onClick={() => void logout()} leftSection={<IconLogout size={16} />}>
          {t.logout}
        </Menu.Item>
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
          <Group gap={4} wrap="nowrap">
            <IconLanguage size={16} aria-hidden />
            {lang}
          </Group>
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
            <Logo href={`/${lang}`} lang={lang} />
            <Group gap="sm">
              <Anchor component={Link} to={`/a-z/${lang}`} size="sm" fw={600} c="dimmed" visibleFrom="xs">
                {t.indexLink}
              </Anchor>
              <Anchor component={Link} to={`/regions/${lang}`} size="sm" fw={600} c="dimmed" visibleFrom="sm">
                {t.regionsLink}
              </Anchor>
              <LanguageMenu />
              <ThemeToggle />
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
          <Group justify="space-between" gap="sm" align="start">
            <Stack gap={4}>
              <Logo href={`/${lang}`} size={22} lang={lang} />
              <Text size="sm" fw={600}>
                {SLOGAN[lang]}
              </Text>
              <Text size="xs" c="dimmed">
                {LOGO_LINE[lang]}
              </Text>
              <Text size="xs" c="dimmed">
                {t.footer}
              </Text>
            </Stack>
            <Group gap="md">
              <Anchor component={Link} to={`/a-z/${lang}`} size="sm" c="dimmed">
                {t.indexLink}
              </Anchor>
              <Anchor component={Link} to={`/regions/${lang}`} size="sm" c="dimmed">
                {t.regionsLink}
              </Anchor>
              <Anchor component={Link} to={`/review?lang=${lang}`} size="sm" c="dimmed">
                {t.review}
              </Anchor>
              <Anchor component={Link} to={`/methodology?lang=${lang}`} size="sm" c="dimmed">
                {t.methodologyLink}
              </Anchor>
              <Anchor component={Link} to={`/developers?lang=${lang}`} size="sm" c="dimmed">
                {t.developers}
              </Anchor>
              <Anchor component={Link} to={`/advertise?lang=${lang}`} size="sm" c="dimmed">
                {t.advertiseTitle}
              </Anchor>
              <Anchor href={`/${lang}/feed.xml`} size="sm" c="dimmed">
                RSS
              </Anchor>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  );
}
