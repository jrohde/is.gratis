import '@mantine/core/styles.css';
import './app.css';
import { Button, ColorSchemeScript, Container, MantineProvider, Stack, Text, Title, mantineHtmlProps } from '@mantine/core';
import { useEffect, type ReactNode } from 'react';
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import { SiteLayout } from './components/SiteLayout';
import { apiGet } from './lib/api.server';
import { env } from './lib/env.server';
import { classifyRequestHost } from './lib/host.server';
import { messages } from './lib/i18n';
import { useMarkHydrated } from './lib/use-hydrated';
import { useUiLang } from './lib/use-lang';
import { usePreferences } from './stores/preferences';
import { useSession } from './stores/session';
import { theme } from './theme';

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-48.png', type: 'image/png', sizes: '48x48' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
];

/**
 * Subdomains are shareable addresses: water.is.gratis redirects to is.gratis/<lang>/water,
 * with the language picked from the slug's existing pages and the visitor's Accept-Language.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const target = classifyRequestHost(host, env.baseDomain);
  const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Accept-Language' };

  if (target.kind === 'www') {
    throw redirect(`${env.publicOrigin}${url.pathname}${url.search}`, { status: 301 });
  }
  if (target.kind === 'subdomain') {
    if (!target.slug) throw redirect(`${env.publicOrigin}/`, { status: 302, headers: noStore });
    const resolved = await apiGet<{ lang: string; slug: string }>(`/resolve/${target.slug}`, {
      headers: { 'accept-language': request.headers.get('accept-language') ?? '' },
    });
    throw redirect(`${env.publicOrigin}/${resolved.lang}/${resolved.slug}`, { status: 302, headers: noStore });
  }
  return null;
}

export function shouldRevalidate() {
  return false;
}

export function Layout({ children }: { children: ReactNode }) {
  const lang = useUiLang();
  return (
    <html lang={lang} {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2f9e44" />
        <ColorSchemeScript defaultColorScheme="auto" />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          {children}
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function useClientState() {
  useMarkHydrated();
  const loadSession = useSession((state) => state.load);
  useEffect(() => {
    void usePreferences.persist.rehydrate();
    void loadSession();
  }, [loadSession]);
}

export default function App() {
  useClientState();
  return (
    <SiteLayout>
      <Outlet />
    </SiteLayout>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  useClientState();
  const lang = useUiLang();
  const t = messages(lang);
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <SiteLayout>
      <Container size="sm">
        <Stack gap="md" align="start">
          <Title order={1}>{notFound ? '404' : t.errorGeneric}</Title>
          <Text c="dimmed">{notFound ? t.notFound : t.errorGeneric}</Text>
          <Button component={Link} to={`/${lang}`} variant="light">
            {t.backHome}
          </Button>
        </Stack>
      </Container>
    </SiteLayout>
  );
}
