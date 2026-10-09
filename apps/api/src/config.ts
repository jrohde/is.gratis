/**
 * Runtime configuration, read once from the environment.
 *
 * Everything the API and the worker need is configured here so a Kubernetes ConfigMap and
 * Secret are the only inputs. Defaults are chosen for local development, where a .env file
 * in the working directory is read as well. Variables that are already set always win.
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function list(name: string): string[] {
  return str(name, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTrustProxy(value: string): boolean | number {
  if (/^\d+$/.test(value)) return Number(value);
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export interface Config {
  /** Public address of the site, for absolute links in feeds and MCP answers. */
  publicOrigin: string;
  databaseUrl: string;
  databasePoolMax: number;
  port: number;
  host: string;
  logLevel: string;
  /**
   * Proxies in front of the API whose X-Forwarded-For entries are trusted: true trusts all
   * (local development), a number trusts that many hops (ingress + Varnish = 2), so clients
   * cannot pick their own IP address for rate limiting.
   */
  trustProxy: boolean | number;
  corsOrigins: string[];
  /** Origins allowed to send state-changing requests. Empty disables the check. */
  trustedOrigins: string[];
  cookieDomain: string | undefined;
  cookieSecure: boolean;
  sessionTtlDays: number;
  migrateOnStart: boolean;
  /** Emails that get the admin role when they register. */
  adminEmails: string[];
  ipHashSalt: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
  };
  drafts: {
    perIpPerHour: number;
    globalPerHour: number;
    maxAttempts: number;
    pollIntervalMs: number;
    /** Also generate an illustration for every new LLM draft (needs image generation). */
    withImage: boolean;
  };
  /** Image generation through an OpenAI-compatible images endpoint. Off when no model is set. */
  images: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    size: string;
    timeoutMs: number;
    perUserPerHour: number;
    globalPerHour: number;
  };
  /** Monthly price of a sponsored spot: base plus a price per thousand views in the last 30 days. */
  sponsorPricing: {
    baseCents: number;
    perThousandCents: number;
  };
  /** The worker checks source URLs between jobs. */
  sourceChecks: {
    enabled: boolean;
    /** Check a URL again after this many days. */
    intervalDays: number;
    batchSize: number;
    timeoutMs: number;
  };
  /**
   * host:port of the HTTP cache (Varnish) to send BAN requests to after a page changes.
   * A hostname is resolved to all its addresses, so a headless Service reaches every replica.
   */
  cacheBanTarget: string | undefined;
}

export function loadConfig(): Config {
  const cookieDomain = str('COOKIE_DOMAIN', '');
  const cacheBanTarget = str('CACHE_BAN_TARGET', '');
  return {
    publicOrigin: str('PUBLIC_ORIGIN', 'http://localhost:5173').replace(/\/+$/, ''),
    databaseUrl: str('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/isgratis'),
    databasePoolMax: int('DATABASE_POOL_MAX', 10),
    port: int('PORT', 4000),
    host: str('HOST', '0.0.0.0'),
    logLevel: str('LOG_LEVEL', 'info'),
    trustProxy: parseTrustProxy(str('TRUST_PROXY', 'true')),
    corsOrigins: list('CORS_ORIGINS'),
    trustedOrigins: list('TRUSTED_ORIGINS'),
    cookieDomain: cookieDomain || undefined,
    cookieSecure: bool('COOKIE_SECURE', false),
    sessionTtlDays: int('SESSION_TTL_DAYS', 30),
    migrateOnStart: bool('MIGRATE_ON_START', true),
    adminEmails: list('ADMIN_EMAILS').map((email) => email.toLowerCase()),
    ipHashSalt: str('IP_HASH_SALT', 'change-me-in-production'),
    llm: {
      baseUrl: str('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
      apiKey: str('LLM_API_KEY', ''),
      model: str('LLM_MODEL', 'gpt-4o-mini'),
      timeoutMs: int('LLM_TIMEOUT_MS', 120_000),
    },
    drafts: {
      perIpPerHour: int('DRAFT_RATE_LIMIT_PER_HOUR', 3),
      globalPerHour: int('DRAFT_GLOBAL_LIMIT_PER_HOUR', 200),
      maxAttempts: int('DRAFT_MAX_ATTEMPTS', 3),
      pollIntervalMs: int('DRAFT_POLL_INTERVAL_MS', 2000),
      withImage: bool('DRAFT_WITH_IMAGE', false),
    },
    images: {
      enabled: str('IMAGE_MODEL', '') !== '',
      baseUrl: str('IMAGE_BASE_URL', str('LLM_BASE_URL', 'https://api.openai.com/v1')).replace(/\/+$/, ''),
      apiKey: str('IMAGE_API_KEY', str('LLM_API_KEY', '')),
      model: str('IMAGE_MODEL', ''),
      size: str('IMAGE_SIZE', '1536x1024'),
      timeoutMs: int('IMAGE_TIMEOUT_MS', 180_000),
      perUserPerHour: int('IMAGE_RATE_LIMIT_PER_HOUR', 5),
      globalPerHour: int('IMAGE_GLOBAL_LIMIT_PER_HOUR', 50),
    },
    sponsorPricing: {
      baseCents: int('SPONSOR_BASE_PRICE_CENTS', 2500),
      perThousandCents: int('SPONSOR_PRICE_PER_1000_VIEWS_CENTS', 400),
    },
    sourceChecks: {
      enabled: bool('SOURCE_CHECKS', true),
      intervalDays: int('SOURCE_CHECK_INTERVAL_DAYS', 7),
      batchSize: int('SOURCE_CHECK_BATCH', 10),
      timeoutMs: int('SOURCE_CHECK_TIMEOUT_MS', 10_000),
    },
    cacheBanTarget: cacheBanTarget || undefined,
  };
}
