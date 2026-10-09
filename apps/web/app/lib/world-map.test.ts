import { describe, expect, it } from 'vitest';
import { REGIONS } from '@isgratis/types';
import { formatPrice } from './i18n';
import { REGION_CENTROIDS, REGION_PATHS, REST_OF_WORLD } from './world-map.data';

describe('world map', () => {
  it('has a shape for every country we accept as a region, and for the EU', () => {
    for (const region of REGIONS) {
      if (region === 'WORLD') continue;
      expect(REGION_PATHS[region], region).toMatch(/^M/);
      if (region !== 'EU') expect(REGION_CENTROIDS[region], region).toHaveLength(2);
    }
    expect(REST_OF_WORLD.length).toBeGreaterThan(1000);
  });
});

describe('prices', () => {
  it('shows whole euros without decimals', () => {
    expect(formatPrice(2500, 'nl')).toMatch(/^€\s25$/);
    expect(formatPrice(2550, 'en')).toBe('€25.50');
  });
});
