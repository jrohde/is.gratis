import { Badge, Box, Center, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { Language, PageContent } from '@isgratis/types';
import { messages } from '~/lib/i18n';
import { mediaSrcSet, mediaUrl } from '~/lib/media';

/** The page image, or a large emoji tile when there is none. */
export function PageHero({ content, lang }: { content: PageContent; lang: Language }) {
  const t = messages(lang);
  const { image } = content;
  if (image) {
    return (
      <figure style={{ margin: 0 }}>
        <Box pos="relative" style={{ borderRadius: 'var(--mantine-radius-lg)', overflow: 'hidden' }}>
          <img
            src={mediaUrl(image.assetId, 960)}
            srcSet={mediaSrcSet(image.assetId, image.width)}
            sizes="(max-width: 960px) 100vw, 912px"
            width={image.width}
            height={image.height}
            alt={image.alt}
            fetchPriority="high"
            style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 420, objectFit: 'cover' }}
          />
          {image.ai && (
            <Badge
              pos="absolute"
              top={10}
              right={10}
              variant="filled"
              color="dark"
              leftSection={<IconSparkles size={12} />}
            >
              {t.aiImage}
            </Badge>
          )}
        </Box>
        {image.credit && (
          <Text component="figcaption" size="xs" c="dimmed" mt={4}>
            {t.imageCredit(image.credit)}
          </Text>
        )}
      </figure>
    );
  }
  if (!content.emoji) return null;
  return (
    <Center
      w={88}
      h={88}
      style={{
        borderRadius: 24,
        background: 'linear-gradient(135deg, var(--mantine-color-green-light), var(--mantine-color-teal-light))',
        fontSize: 48,
      }}
      aria-hidden
    >
      {content.emoji}
    </Center>
  );
}
