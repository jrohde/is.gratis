import { Anchor, Group, Text } from '@mantine/core';
import { useId } from 'react';
import { Link } from 'react-router';
import { logoSvg, skyDotSvg, type Language, type SkyState } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { useSky } from '~/stores/sky';

/** "nieuwe maan", "wassende maansikkel", … or the sun, in the reader's language. */
export function skyDescription(state: SkyState, lang: Language): string {
  const t = messages(lang);
  if (state.sky === 'day') return t.sunUp;
  if (state.sky === 'twilight') return t.sunLow;
  return t.moonPhases[Math.floor(((state.phase + 1 / 16) % 1) * 8)] ?? t.moonPhases[0]!;
}

/**
 * The live mark: a price tag without a price, filled with the sky above the visitor. Its eyelet
 * holds the sun by day and the moon in today's phase by night.
 */
export function LiveMark({ size, lang }: { size: number; lang: Language }) {
  const state = useSky((store) => store.state);
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const title = `is.gratis · ${messages(lang).skyNow}: ${skyDescription(state, lang)}`;
  return (
    <span
      title={title}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: logoSvg(state, { size, idPrefix: id, title }) }}
    />
  );
}

/** The dot of "is.gratis": the same sun or moon, at the size of a full stop. */
function SkyDot({ size }: { size: number }) {
  const state = useSky((store) => store.state);
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', width: size, height: size, margin: `0 ${size * 0.12}px`, verticalAlign: 'baseline' }}
      dangerouslySetInnerHTML={{ __html: skyDotSvg(state, size) }}
    />
  );
}

export function Logo({ href, size = 30, lang }: { href: string; size?: number; lang: Language }) {
  const font = Math.round(size * 0.8);
  return (
    <Anchor component={Link} to={href} underline="never" c="inherit" aria-label="is.gratis">
      <Group gap={8} wrap="nowrap" align="center">
        <LiveMark size={size} lang={lang} />
        <Text fw={900} fz={font} lh={1} span style={{ display: 'inline-flex', alignItems: 'baseline', letterSpacing: -0.5 }}>
          is
          <SkyDot size={Math.round(font * 0.32)} />
          <Text span inherit c="green.7">
            gratis
          </Text>
        </Text>
      </Group>
    </Anchor>
  );
}
