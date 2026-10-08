import { Badge, type MantineSize } from '@mantine/core';
import { motion } from 'motion/react';
import { VERDICT_LABELS, type Language, type Verdict } from '@isgratis/types';
import { wasHydratedBeforeMount } from '~/lib/use-hydrated';
import { VERDICT_COLORS } from '~/theme';

const MotionDiv = motion.div;

export function VerdictBadge({
  verdict,
  lang,
  size = 'md',
  animate = false,
}: {
  verdict: Verdict;
  lang: Language;
  size?: MantineSize;
  animate?: boolean;
}) {
  const badge = (
    <Badge color={VERDICT_COLORS[verdict]} size={size} variant="filled" radius="sm">
      {VERDICT_LABELS[lang][verdict]}
    </Badge>
  );
  if (!animate) return badge;
  // Server-rendered answers are visible immediately; the pop only plays after in-app navigation.
  const play = wasHydratedBeforeMount();
  return (
    <MotionDiv
      style={{ display: 'inline-block' }}
      initial={play ? { scale: 0.6, opacity: 0, rotate: -6 } : false}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
    >
      {badge}
    </MotionDiv>
  );
}
