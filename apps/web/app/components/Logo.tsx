import { Anchor, Group, Text } from '@mantine/core';
import { Link } from 'react-router';

/** The planet mark with the wordmark next to it. */
export function Logo({ href, size = 28 }: { href: string; size?: number }) {
  return (
    <Anchor component={Link} to={href} underline="never" c="inherit" aria-label="is.gratis">
      <Group gap={8} wrap="nowrap">
        <img src="/favicon.svg" width={size} height={size} alt="" style={{ display: 'block' }} />
        <Text fw={900} fz={Math.round(size * 0.86)} lh={1} span>
          is.
          <Text span inherit c="green.7">
            gratis
          </Text>
        </Text>
      </Group>
    </Anchor>
  );
}
