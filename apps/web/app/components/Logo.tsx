import { Anchor, Text, type MantineStyleProp } from '@mantine/core';
import { Link } from 'react-router';
import { asteriskSvg, SLOGAN, type Language } from '@isgratis/types';

const ASTERISK = asteriskSvg();

/**
 * The brand asterisk, sized in em so it follows the surrounding text. After a word it sits like a
 * superscript; before a footnote it sits a little lower, like a footnote mark.
 */
export function Asterisk({ position = 'after', color }: { position?: 'after' | 'before'; color?: string }) {
  const after = position === 'after';
  const style: MantineStyleProp = {
    display: 'inline-block',
    width: after ? '0.44em' : '0.62em',
    height: after ? '0.44em' : '0.62em',
    verticalAlign: after ? '0.34em' : '0.08em',
    margin: after ? '0 0 0 0.03em' : '0 0.1em 0 0',
    flexShrink: 0,
  };
  return (
    <span
      aria-hidden
      style={style}
      dangerouslySetInnerHTML={{ __html: color ? asteriskSvg({ color }) : ASTERISK }}
    />
  );
}

/** "is.gratis*": the name in the text colour, the asterisk in green. */
export function Wordmark({ size }: { size: number | string }) {
  return (
    <Text component="span" fw={800} fz={size} lh={1} style={{ letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
      is.gratis
      <Asterisk />
    </Text>
  );
}

/** "*Is het?" — the slogan, set as a footnote. */
export function Slogan({ lang }: { lang: Language }) {
  return <Footnote text={SLOGAN[lang]} />;
}

/** A footnote mark followed by its text: "*deels". */
export function Footnote({ text, color }: { text: string; color?: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap', color }}>
      <Asterisk position="before" />
      {text}
    </span>
  );
}

export function Logo({ href, size = 26 }: { href: string; size?: number }) {
  return (
    <Anchor component={Link} to={href} underline="never" c="inherit" aria-label="is.gratis" style={{ display: 'inline-flex' }}>
      <Wordmark size={size} />
    </Anchor>
  );
}

