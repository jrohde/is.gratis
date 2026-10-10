/**
 * Prices of sponsored spots, set by the admin in the app. The configuration (SPONSOR_*) gives
 * the defaults; what the admin saves wins. Per region a percentage of the "everywhere" price:
 * an offer only for readers in Belgium reaches fewer people than one for everybody.
 */
import { eq } from 'drizzle-orm';
import type { Region } from '@isgratis/types';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import { settings } from '../db/schema.js';

export interface Pricing {
  baseCents: number;
  perThousandCents: number;
  mailingCents: number;
  exclusivePercent: number;
  /** Percentage of the everywhere price per region; a missing region costs 100%. */
  regionPercent: Partial<Record<Region, number>>;
}

const KEY = 'pricing';
const CACHE_MS = 30_000;
let cached: { at: number; value: Pricing } | null = null;

export function clearPricingCache(): void {
  cached = null;
}

export async function getPricing(db: Database, defaults: Config['sponsorPricing']): Promise<Pricing> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KEY)).limit(1);
  const value: Pricing = { ...defaults, regionPercent: {}, ...((row?.value as Partial<Pricing> | undefined) ?? {}) };
  cached = { at: Date.now(), value };
  return value;
}

export async function setPricing(db: Database, value: Pricing, userId: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  clearPricingCache();
}

export function regionPercent(pricing: Pricing, region: Region | null): number {
  return region ? (pricing.regionPercent[region] ?? 100) : 100;
}

/**
 * Monthly price of a spot: a base price plus a price per thousand views in the last 30 days,
 * times the percentage for the region, rounded up to whole euros.
 */
export function spotPrice(views30: number, region: Region | null, pricing: Pricing): number {
  const cents = (pricing.baseCents + (views30 / 1000) * pricing.perThousandCents) * (regionPercent(pricing, region) / 100);
  return Math.ceil(cents / 100) * 100;
}
