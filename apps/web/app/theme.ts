import { createTheme, type MantineColor } from '@mantine/core';
import type { Verdict } from '@isgratis/types';

export const theme = createTheme({
  primaryColor: 'green',
  defaultRadius: 'md',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '800' },
});

export const VERDICT_COLORS: Record<Verdict, MantineColor> = {
  yes: 'green',
  usually: 'teal',
  depends: 'orange',
  no: 'red',
};
