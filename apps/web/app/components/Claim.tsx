import { Anchor, Group, Text } from '@mantine/core';
import { Link } from 'react-router';
import { claimFor, footnoteFor, type FreeScale, type Language, type Verdict } from '@isgratis/types';
import { Asterisk, Footnote } from './Logo';

/** A page in a list: "💧 Water is gratis*", linking to the page. */
export function ClaimLink({
  lang,
  slug,
  title,
  plural,
  emoji,
}: {
  lang: Language;
  slug: string;
  title: string;
  plural?: boolean;
  emoji?: string;
}) {
  return (
    <Anchor component={Link} to={`/${lang}/${slug}`} fw={700} c="inherit">
      {emoji && (
        <Text span mr={8} aria-hidden>
          {emoji}
        </Text>
      )}
      {claimFor(lang, title, plural)}
      <Asterisk />
    </Anchor>
  );
}

/** The answer to a claim in a list: "*deels", in the colour of its step on the free scale. */
export function ListFootnote({ lang, verdict, scale }: { lang: Language; verdict: Verdict; scale?: FreeScale }) {
  const note = footnoteFor(lang, { verdict, scale });
  return (
    <Text span fw={800} size="sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      <Footnote text={note.text} color={note.color} />
    </Text>
  );
}

/** Claim on the left, footnote on the right: one line of a list. */
export function ClaimRow(props: {
  lang: Language;
  slug: string;
  title: string;
  plural?: boolean;
  emoji?: string;
  verdict: Verdict;
  scale?: FreeScale;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" align="baseline">
      <ClaimLink {...props} />
      <ListFootnote lang={props.lang} verdict={props.verdict} scale={props.scale} />
    </Group>
  );
}
