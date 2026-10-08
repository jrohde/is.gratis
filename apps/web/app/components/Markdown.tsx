import { Anchor, Typography } from '@mantine/core';
import { createContext, useContext, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router';

/** Which internal links point to pages that do not exist yet ("red links"). */
export const WikiLinkContext = createContext<{ missing: Set<string>; missingTitle: string }>({
  missing: new Set(),
  missingTitle: '',
});

function MarkdownLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const { missing, missingTitle } = useContext(WikiLinkContext);
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

/** Renders editor Markdown. react-markdown never renders raw HTML. */
export function Markdown({ children, size }: { children: string; size?: 'lg' }) {
  return (
    <Typography fz={size === 'lg' ? 'lg' : undefined}>
      <ReactMarkdown
        components={{
          a: ({ href, children: label }) => <MarkdownLink href={href}>{label}</MarkdownLink>,
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
