import { Anchor, Tooltip, Typography } from '@mantine/core';
import type { Element, ElementContent } from 'hast';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router';
import type { Language, Source } from '@isgratis/types';

/** Which internal links point to pages that do not exist yet ("red links"). */
export const WikiLinkContext = createContext<{ missing: Set<string>; missingTitle: string }>({
  missing: new Set(),
  missingTitle: '',
});

/** The page's sources, for footnotes, and how to show claims without one. */
export const CitationContext = createContext<{
  sources: Source[];
  lang: Language;
  highlight: boolean;
  neededLabel: string;
  neededHelp: string;
} | null>(null);

const UNSOURCED: CSSProperties = {
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: 'var(--mantine-color-orange-5)',
  textDecorationThickness: 2,
  textUnderlineOffset: 4,
};

function MarkdownLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const { missing, missingTitle } = useContext(WikiLinkContext);
  const citations = useContext(CitationContext);

  // Footnotes: [1](#bron-1) from a [^id] citation.
  const footnote = /^#bron-(\d+)$/.exec(href);
  if (footnote || href === '#bronnen') {
    const source = footnote ? citations?.sources[Number(footnote[1]) - 1] : undefined;
    const link = (
      <Anchor href={href} fz="0.75em" fw={600} style={{ textDecoration: 'none' }} data-citation>
        [{children}]
      </Anchor>
    );
    return <sup>{source ? <Tooltip label={source.title} withArrow>{link}</Tooltip> : link}</sup>;
  }

  // Internal links (/nl/water) navigate inside the app, like links between Wikipedia articles.
  const internal = /^\/(nl|en|de|es)\/([a-z0-9-]+)$/.exec(href);
  if (internal) {
    const isMissing = missing.has(internal[2]!);
    return (
      <Anchor
        component={Link}
        to={href}
        c={isMissing ? 'red.7' : undefined}
        underline={isMissing ? 'always' : 'hover'}
        title={isMissing ? missingTitle : undefined}
        rel={isMissing ? 'nofollow' : undefined}
        data-wikilink={isMissing ? 'missing' : 'existing'}
      >
        {children}
      </Anchor>
    );
  }
  // Links typed by editors get rel="nofollow ugc" so the site does not vouch for them.
  return (
    <Anchor href={href} rel="nofollow ugc noopener" target="_blank">
      {children}
    </Anchor>
  );
}

function hasCitation(node: Element | ElementContent | undefined): boolean {
  if (!node || node.type !== 'element') return false;
  const href = node.properties?.href;
  if (node.tagName === 'a' && typeof href === 'string' && (href.startsWith('#bron-') || href === '#bronnen')) return true;
  return node.children.some((child) => hasCitation(child));
}

/** The "[citation needed]" tag of Wikipedia. */
export function CitationNeeded() {
  const citations = useContext(CitationContext);
  if (!citations) return null;
  return (
    <sup style={{ whiteSpace: 'nowrap' }}>
      <Tooltip label={citations.neededHelp} withArrow multiline w={260}>
        <Anchor
          component={Link}
          to={`/methodology?lang=${citations.lang}#bronnen`}
          c="orange.7"
          fs="italic"
          fz="0.75em"
          ml={2}
          data-unsourced
        >
          [{citations.neededLabel}]
        </Anchor>
      </Tooltip>
    </sup>
  );
}

/** A paragraph or list item: when it holds a claim without a citation, it is marked as such. */
function Claim({ as: Tag, node, children }: { as: 'p' | 'li'; node?: Element; children?: ReactNode }) {
  const citations = useContext(CitationContext);
  const nested = Tag === 'li' && node?.children.some((child) => child.type === 'element' && child.tagName === 'p');
  if (!citations || nested || hasCitation(node)) return <Tag>{children}</Tag>;
  return (
    <Tag>
      <span style={citations.highlight ? UNSOURCED : undefined}>{children}</span>
      <CitationNeeded />
    </Tag>
  );
}

/**
 * Renders editor Markdown. react-markdown never renders raw HTML. With `claims`, every paragraph
 * and list item is treated as a claim that needs a source.
 */
export function Markdown({ children, size, claims = false }: { children: string; size?: 'lg'; claims?: boolean }) {
  return (
    <Typography fz={size === 'lg' ? 'lg' : undefined}>
      <ReactMarkdown
        components={{
          a: ({ href, children: label }) => <MarkdownLink href={href}>{label}</MarkdownLink>,
          ...(claims
            ? {
                p: ({ node, children: content }) => <Claim as="p" node={node}>{content}</Claim>,
                li: ({ node, children: content }) => <Claim as="li" node={node}>{content}</Claim>,
              }
            : {}),
          h1: 'p',
          h2: 'p',
          h3: 'p',
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </Typography>
  );
}
