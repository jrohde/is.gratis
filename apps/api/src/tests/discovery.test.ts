import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, register, resetDatabase, sampleContent, type TestContext } from './helpers.js';

let ctx: TestContext;
let baseUrl: string;

beforeAll(async () => {
  ctx = await createTestApp({ publicOrigin: 'https://is.gratis' });
  await resetDatabase(ctx);
  const { cookie } = await register(ctx, 'editor@example.com');
  const save = (lang: string, slug: string, title: string, content: object) =>
    ctx.app.inject({
      method: 'PUT',
      url: `/api/pages/${lang}/${slug}`,
      headers: { cookie },
      payload: { title, content: { ...sampleContent(), ...content }, baseRevisionId: null },
    });
  await save('nl', 'water', 'water', { summary: 'Hangt ervan af. Kraanwater kost weinig.', verdict: 'depends' });
  await save('nl', 'huisarts', 'de huisarts', { summary: 'Meestal, via de premie.', verdict: 'usually' });
  await save('nl', 'kraanwater', 'kraanwater', {
    summary: 'Kraanwater is goedkoop, net als water uit de fles niet. Zie ook [[de huisarts]] en [[zonnebrandcreme]].',
    whenFree: 'Bij de huisarts krijg je soms een glas water.',
  });
  // listen on a real port: the MCP client speaks HTTP
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  const address = ctx.app.server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => ctx.close());

describe('links between pages', () => {
  it('reports red links and automatic links for existing subjects', async () => {
    const page = (await ctx.app.inject({ method: 'GET', url: '/api/pages/nl/kraanwater' })).json();
    expect(page.links.missing).toEqual(['zonnebrandcreme']);
    expect(page.links.resolved).toEqual({ 'de-huisarts': 'huisarts' });
    expect(page.links.auto).toEqual(expect.arrayContaining([
      { term: 'huisarts', slug: 'huisarts' },
      { term: 'water', slug: 'water' },
    ]));
    expect(page.links.auto.find((link: { slug: string }) => link.slug === 'kraanwater')).toBeUndefined();
  });
});

describe('search', () => {
  it('finds pages by title and short answer, best matches first', async () => {
    const hits = (await ctx.app.inject({ method: 'GET', url: '/api/search?lang=nl&q=water' })).json().pages;
    expect(hits.map((p: { slug: string }) => p.slug)).toEqual(['water', 'kraanwater']);
    const bySummary = (await ctx.app.inject({ method: 'GET', url: '/api/search?lang=nl&q=premie' })).json().pages;
    expect(bySummary.map((p: { slug: string }) => p.slug)).toEqual(['huisarts']);
    const wildcard = (await ctx.app.inject({ method: 'GET', url: '/api/search?lang=nl&q=%25' })).json().pages;
    expect(wildcard).toEqual([]);
  });

  it('lists pages alphabetically for the index', async () => {
    const pages = (await ctx.app.inject({ method: 'GET', url: '/api/pages?lang=nl&sort=title&limit=10' })).json().pages;
    expect(pages.map((p: { title: string }) => p.title)).toEqual(['de huisarts', 'kraanwater', 'water']);
  });
});

describe('social cards', () => {
  it('renders 1200 × 630 PNG cards for pages and the site', async () => {
    for (const url of ['/api/og/nl/water.png?v=1', '/api/og/site/nl.png', '/api/og/nl/bestaat-niet.png']) {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      const meta = await sharp(response.rawPayload).metadata();
      expect([meta.width, meta.height]).toEqual([1200, 630]);
    }
  });
});

describe('MCP server', () => {
  it('lets an MCP client list and call the tools', async () => {
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`)));
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(tools).toEqual(['get_page', 'is_it_free', 'recent_changes', 'search']);

    const answer = await client.callTool({ name: 'is_it_free', arguments: { subject: 'Water', lang: 'nl' } });
    const textOf = (result: typeof answer) => (result.content as Array<{ text: string }>)[0]!.text;
    expect(textOf(answer)).toContain('# Is water gratis?');
    expect(textOf(answer)).toContain('https://is.gratis/nl/water');

    const fuzzy = await client.callTool({ name: 'is_it_free', arguments: { subject: 'huisarts', lang: 'nl' } });
    expect(textOf(fuzzy)).toContain('Is de huisarts gratis?');

    const missing = await client.callTool({ name: 'is_it_free', arguments: { subject: 'ruimtereis', lang: 'nl' } });
    expect(textOf(missing)).toContain('https://is.gratis/nl/ruimtereis');

    const search = await client.callTool({ name: 'search', arguments: { query: 'water', lang: 'nl' } });
    expect(textOf(search)).toContain('Is kraanwater gratis?');
    await client.close();
  });

  it('accepts calls from any origin and refuses GET', async () => {
    const preflight = await fetch(`${baseUrl}/api/mcp`, { method: 'OPTIONS', headers: { origin: 'https://agent.example' } });
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect((await fetch(`${baseUrl}/api/mcp`)).status).toBe(405);
  });
});
