import { Box } from '@mantine/core';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { Region } from '@isgratis/types';
import { MAP_HEIGHT, MAP_WIDTH, REGION_BOUNDS, REGION_CENTROIDS, REGION_PATHS, REST_OF_WORLD } from '~/lib/world-map.data';

/** Too small to click on a world map: they also get a dot. */
const SMALL = new Set(['LU', 'NL', 'BE', 'CH', 'EE', 'DK', 'AT', 'IE', 'PT']);
const EU_MEMBERS = new Set(['NL', 'BE', 'DE', 'AT', 'FR', 'ES', 'IT', 'PT', 'IE', 'DK', 'SE', 'FI', 'PL', 'LU', 'EE']);

/**
 * The part of the map around some countries, with room around them and at least the size of
 * western Europe, in the map's own aspect ratio. Null shows the whole world.
 */
export function focusViewBox(regions: string[]): string | null {
  const boxes = regions
    .flatMap((region) => (region === 'EU' ? ['FR', 'FI', 'PT', 'PL'] : [region]))
    .map((region) => REGION_BOUNDS[region])
    .filter((box): box is [number, number, number, number] => Boolean(box));
  if (boxes.length === 0) return null;
  let x0 = Math.min(...boxes.map((b) => b[0]));
  let y0 = Math.min(...boxes.map((b) => b[1]));
  let x1 = Math.max(...boxes.map((b) => b[2]));
  let y1 = Math.max(...boxes.map((b) => b[3]));
  const aspect = MAP_WIDTH / MAP_HEIGHT;
  let width = Math.max((x1 - x0) * 1.3, 140);
  let height = Math.max((y1 - y0) * 1.3, 70);
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  if (width >= MAP_WIDTH * 0.8) return null;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = Math.min(Math.max(cx - width / 2, 0), MAP_WIDTH - width);
  y0 = Math.min(Math.max(cy - height / 2, 0), MAP_HEIGHT - height);
  x1 = x0 + width;
  y1 = y0 + height;
  return `${x0.toFixed(1)} ${y0.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`;
}

/**
 * A world map drawn from bundled Natural Earth shapes: no tiles and no map service. Countries
 * with a colour are clickable, either as a link or to select them.
 */
export function WorldMap({
  fills,
  label,
  titleFor,
  selected,
  hrefFor,
  onSelect,
  maxWidth,
  focus,
}: {
  /** Colour per region; regions without one are drawn as plain land. "EU" colours all member states. */
  fills: Partial<Record<Region, string>>;
  label: string;
  titleFor: (region: Region) => string;
  selected?: Region;
  hrefFor?: (region: Region) => string;
  onSelect?: (region: Region) => void;
  maxWidth?: number;
  /** Zoom in on these regions instead of showing the whole world. */
  focus?: Region[];
}) {
  // The selected country last, so its outline is drawn over its neighbours.
  const countries = (Object.keys(REGION_PATHS).filter((code) => code !== 'EU') as Region[]).sort(
    (a, b) => Number(a === selected) - Number(b === selected),
  );
  const viewBox = (focus && focusViewBox(focus)) || `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
  // Map units per screen pixel stay roughly constant: dots keep their size when zoomed in.
  const zoom = Number(viewBox.split(' ')[2]) / MAP_WIDTH;
  const tiny = (region: Region) => {
    const box = REGION_BOUNDS[region];
    return SMALL.has(region) && (!box || box[2] - box[0] < 14 * zoom);
  };
  const euFill = fills.EU;

  function wrap(region: Region, child: ReactNode) {
    const className = `clickable${selected === region ? ' selected' : ''}`;
    const title = <title>{titleFor(region)}</title>;
    if (hrefFor) {
      return (
        <Link key={region} to={hrefFor(region)} className={className} aria-label={titleFor(region)}>
          {title}
          {child}
        </Link>
      );
    }
    if (onSelect) {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(region);
        }
      };
      return (
        <g
          key={region}
          role="button"
          tabIndex={0}
          aria-label={titleFor(region)}
          aria-pressed={selected === region}
          className={className}
          onClick={() => onSelect(region)}
          onKeyDown={onKeyDown}
        >
          {title}
          {child}
        </g>
      );
    }
    return (
      <g key={region} className={selected === region ? 'selected' : undefined}>
        {title}
        {child}
      </g>
    );
  }

  return (
    <Box className="world-map" maw={maxWidth} mx={maxWidth ? 'auto' : undefined}>
      <svg viewBox={viewBox} role="group" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path className="land" d={REST_OF_WORLD} />
        {euFill && <path className="country" d={REGION_PATHS.EU} fill={euFill} opacity={0.45} />}
        {countries.map((region) => {
          const fill = fills[region];
          if (!fill) {
            // Covered by the EU colour, or plain land.
            if (euFill && EU_MEMBERS.has(region)) return null;
            return <path key={region} className="land" d={REGION_PATHS[region]} />;
          }
          const [x, y] = REGION_CENTROIDS[region] ?? [0, 0];
          return wrap(
            region,
            <>
              <path className="country" d={REGION_PATHS[region]} fill={fill} />
              {tiny(region) && <circle className="country" cx={x} cy={y} r={4 * zoom} fill={fill} />}
            </>,
          );
        })}
      </svg>
    </Box>
  );
}
