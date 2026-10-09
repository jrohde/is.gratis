import { Anchor, Code, Container, List, Stack, Text, Title } from '@mantine/core';
import { IconApi, IconFileText, IconPlugConnected, IconRss } from '@tabler/icons-react';
import { useLoaderData } from 'react-router';
import type { Language } from '@isgratis/types';
import type { Route } from './+types/developers';
import { SectionTitle } from '~/components/SectionTitle';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { useUiLang } from '~/lib/use-lang';

export function loader() {
  return { origin: env.publicOrigin };
}

export const headers: Route.HeadersFunction = () => ({ 'Cache-Control': 'public, max-age=0, s-maxage=3600' });
export const meta: Route.MetaFunction = () => [{ title: 'Developers · is.gratis' }];

const TEXT: Record<'nl' | 'en', {
  intro: string;
  mcpTitle: string;
  mcp: string;
  mcpTools: string[];
  mcpClaude: string;
  mcpConfig: string;
  apiTitle: string;
  api: string;
  llmsTitle: string;
  llms: string;
  feedsTitle: string;
  feeds: string;
}> = {
  nl: {
    intro: 'Alles op is.gratis is ook bruikbaar voor software: AI-agents, zoekmachines, feedlezers en je eigen apps.',
    mcpTitle: 'MCP-server voor AI-agents',
    mcp: 'Een openbare server volgens het Model Context Protocol (Streamable HTTP). Zonder sleutel, alleen lezen.',
    mcpTools: [
      'is_it_free: beantwoordt “is X gratis?” met voorwaarden, regio’s en bronnen',
      'free_in_country: wat in één land gratis is en wat niet',
      'search: zoekt pagina’s op onderwerp',
      'get_page: geeft één pagina als Markdown',
      'recent_changes: de laatst bijgewerkte pagina’s',
    ],
    mcpClaude: 'Toevoegen aan Claude Code:',
    mcpConfig: 'Of in de configuratie van een andere client:',
    apiTitle: 'REST-API',
    api: 'Pagina’s, versies, zoeken en concepten, met een OpenAPI-beschrijving.',
    llmsTitle: 'llms.txt',
    llms: 'Elke pagina is ook beschikbaar als Markdown: zet /llms.txt achter het adres. Er is ook een index per taal en voor de hele site.',
    feedsTitle: 'RSS-feeds',
    feeds: 'Volg nieuwe en bijgewerkte pagina’s per taal, of alle wijzigingen van één pagina via /feed.xml achter het adres.',
  },
  en: {
    intro: 'Everything on is.gratis also works for software: AI agents, search engines, feed readers and your own apps.',
    mcpTitle: 'MCP server for AI agents',
    mcp: 'A public server following the Model Context Protocol (Streamable HTTP). No key needed, read-only.',
    mcpTools: [
      'is_it_free: answers “is X free?” with conditions, regions and sources',
      'free_in_country: what is and is not free in one country',
      'search: finds pages by subject',
      'get_page: returns one page as Markdown',
      'recent_changes: the most recently updated pages',
    ],
    mcpClaude: 'Add it to Claude Code:',
    mcpConfig: 'Or in the configuration of another client:',
    apiTitle: 'REST API',
    api: 'Pages, revisions, search and drafts, with an OpenAPI description.',
    llmsTitle: 'llms.txt',
    llms: 'Every page is also available as Markdown: add /llms.txt to its address. There is an index per language and one for the whole site.',
    feedsTitle: 'RSS feeds',
    feeds: 'Follow new and updated pages per language, or every change to one page by adding /feed.xml to its address.',
  },
};

export default function Developers() {
  const { origin } = useLoaderData<typeof loader>();
  const lang: Language = useUiLang();
  const t = messages(lang);
  const c = TEXT[lang === 'nl' ? 'nl' : 'en'];
  const mcpUrl = `${origin}/api/mcp`;
  const config = JSON.stringify({ mcpServers: { 'is-gratis': { type: 'http', url: mcpUrl } } }, null, 2);
  return (
    <Container size="md">
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={1}>{t.developers}</Title>
          <Text size="lg">{c.intro}</Text>
        </Stack>

        <section>
          <SectionTitle icon={<IconPlugConnected size={18} />} color="grape">
            {c.mcpTitle}
          </SectionTitle>
          <Stack gap="sm">
            <Text>{c.mcp}</Text>
            <Code block>{mcpUrl}</Code>
            <List size="sm" spacing={4}>
              {c.mcpTools.map((tool) => (
                <List.Item key={tool}>{tool}</List.Item>
              ))}
            </List>
            <Text size="sm">{c.mcpClaude}</Text>
            <Code block>{`claude mcp add --transport http is-gratis ${mcpUrl}`}</Code>
            <Text size="sm">{c.mcpConfig}</Text>
            <Code block>{config}</Code>
          </Stack>
        </section>

        <section>
          <SectionTitle icon={<IconApi size={18} />} color="blue">
            {c.apiTitle}
          </SectionTitle>
          <Text>
            {c.api}{' '}
            <Anchor href="/api/docs">{`${origin}/api/docs`}</Anchor>
          </Text>
        </section>

        <section>
          <SectionTitle icon={<IconFileText size={18} />} color="teal">
            {c.llmsTitle}
          </SectionTitle>
          <Text>
            {c.llms} <Anchor href="/llms.txt">{`${origin}/llms.txt`}</Anchor>
          </Text>
        </section>

        <section>
          <SectionTitle icon={<IconRss size={18} />} color="orange">
            {c.feedsTitle}
          </SectionTitle>
          <Text>
            {c.feeds} <Anchor href={`/${lang}/feed.xml`}>{`${origin}/${lang}/feed.xml`}</Anchor>
          </Text>
        </section>
      </Stack>
    </Container>
  );
}
