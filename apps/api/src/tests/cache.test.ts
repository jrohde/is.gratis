import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCacheInvalidator } from '../lib/cache.js';

// A raw TCP server: Node's HTTP parser rejects the non-standard BAN method that Varnish uses.
let server: Server;
let port: number;
const received: string[] = [];

beforeAll(async () => {
  server = createServer((socket) => {
    socket.on('data', (chunk) => {
      received.push(chunk.toString());
      socket.end('HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nBanned');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const logger = { warn: () => {}, debug: () => {} };

describe('cache invalidation', () => {
  it('sends a BAN for the page, its sub pages and data requests', async () => {
    await createCacheInvalidator(`127.0.0.1:${port}`, logger as never).purgePage('nl', 'water');
    const request = received.at(-1)!;
    expect(request.startsWith('BAN / HTTP/1.1')).toBe(true);
    const pattern = /x-ban-url: (.+)\r\n/i.exec(request)![1]!;
    const regex = new RegExp(pattern);
    for (const url of ['/nl/water', '/nl/water/edit', '/nl/water.data', '/nl/water?x=1']) {
      expect(regex.test(url)).toBe(true);
    }
    for (const url of ['/nl/waterfilter', '/en/water', '/nl/kraanwater']) {
      expect(regex.test(url)).toBe(false);
    }
  });

  it('does nothing without a target', async () => {
    await expect(createCacheInvalidator(undefined, logger as never).purgePage('nl', 'water')).resolves.toBeUndefined();
  });
});
