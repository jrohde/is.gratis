import { describe, expect, it } from 'vitest';
import { isSouthern, logoSvg, moonLitPath, moonPhase, skyAt, skyForHour } from './index.js';

describe('moon phase', () => {
  // Published times (UTC) of recent new and full moons.
  it.each([
    ['2024-01-11T11:57:00Z', 0],
    ['2024-01-25T17:54:00Z', 0.5],
    ['2025-03-14T06:55:00Z', 0.5],
    ['2026-02-17T12:01:00Z', 0],
  ])('matches %s within a day', (iso, expected) => {
    const phase = moonPhase(new Date(iso));
    const distance = Math.min(Math.abs(phase - expected), 1 - Math.abs(phase - expected));
    expect(distance).toBeLessThan(1 / 29.5);
  });

  it('lights the right side of a waxing moon, and the left side in the south', () => {
    expect(moonLitPath(10, 10, 5, 0.25)).toContain('0 0 1 10 15');
    expect(moonLitPath(10, 10, 5, 0.25, true)).toContain('0 0 0 10 15');
    expect(moonLitPath(10, 10, 5, 0.75)).toContain('0 0 0 10 15');
  });
});

describe('sky', () => {
  it('knows day, twilight and night, and the southern hemisphere', () => {
    expect([skyForHour(3), skyForHour(7), skyForHour(12), skyForHour(19), skyForHour(23)]).toEqual([
      'night', 'twilight', 'day', 'twilight', 'night',
    ]);
    expect(isSouthern('Australia/Sydney')).toBe(true);
    expect(isSouthern('Europe/Amsterdam')).toBe(false);
    expect(skyAt(new Date('2026-06-21T12:00:00Z'), 'Europe/Amsterdam').sky).toBe('day');
    expect(skyAt(new Date('2026-06-21T12:00:00Z'), 'Pacific/Auckland')).toMatchObject({ sky: 'night', southern: true });
  });

  it('draws a moon at night and a sun by day', () => {
    expect(logoSvg({ phase: 0.3, sky: 'night', southern: false })).toContain('#fff4cc');
    expect(logoSvg({ phase: 0.3, sky: 'day', southern: false })).toContain('#ffd43b');
    expect(logoSvg({ phase: 0.3, sky: 'day', southern: false }, { idPrefix: 'a' })).toContain('url(#a-sky)');
  });
});
