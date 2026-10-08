import { Anchor, Typography } from '@mantine/core';
import ReactMarkdown from 'react-markdown';

/**
 * Renders editor Markdown. react-markdown never renders raw HTML, and links from editors get
 * rel="nofollow ugc" so the site does not vouch for them.
 */
export function Markdown({ children, size }: { children: string; size?: 'lg' }) {
  return (
    <Typography fz={size === 'lg' ? 'lg' : undefined}>
      <ReactMarkdown
        components={{
          a: ({ href, children: label }) => (
            <Anchor href={href} rel="nofollow ugc noopener" target="_blank">
              {label}
            </Anchor>
          ),
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
