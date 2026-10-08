import { Group, ThemeIcon, Title, type MantineColor } from '@mantine/core';
import type { ReactNode } from 'react';

export function SectionTitle({ icon, color = 'gray', children }: { icon: ReactNode; color?: MantineColor; children: ReactNode }) {
  return (
    <Group gap="xs" mb="sm" wrap="nowrap">
      <ThemeIcon variant="light" color={color} size="md" radius="md" aria-hidden>
        {icon}
      </ThemeIcon>
      <Title order={2} size="h4">
        {children}
      </Title>
    </Group>
  );
}
