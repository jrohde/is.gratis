import { Anchor, Button, Card, Container, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconShare } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { data, Link } from 'react-router';
import {
  claimFor,
  FREE_TYPE_LEVEL,
  FREE_TYPES,
  SCALE_FOOTNOTES,
  SCALE_TEXT_COLORS,
  type FreeType,
  type PageListItem,
} from '@isgratis/types';
import type { Route } from './+types/quiz';
import { Asterisk, Footnote } from '~/components/Logo';
import { api } from '~/lib/api.client';
import { env } from '~/lib/env.server';
import { messages } from '~/lib/i18n';
import { plainText } from '~/lib/markdown';
import { parseLang } from '~/lib/params';

export function loader({ params }: Route.LoaderArgs) {
  return data({ lang: parseLang(params.lang), origin: env.publicOrigin }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600' } });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [];
  const t = messages(loaderData.lang);
  return [{ title: `${t.quizTitle} | is.gratis` }, { name: 'description', content: t.quizIntro }];
};

/** From "really" (5) to "really not" (0): the six answers on the free scale. */
const ANSWERS = [...FREE_TYPES].sort((a, b) => FREE_TYPE_LEVEL[b] - FREE_TYPE_LEVEL[a]);
const ROUNDS = 10;

/** Guess the footnote: how free is it really? Exactly right is 2 points, one step off is 1. */
export default function Quiz({ loaderData }: Route.ComponentProps) {
  const { lang, origin } = loaderData;
  const t = messages(lang);
  const [questions, setQuestions] = useState<PageListItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [guess, setGuess] = useState<FreeType | null>(null);
  const [shared, setShared] = useState(false);

  const start = useCallback(() => {
    setQuestions(null);
    setIndex(0);
    setScore(0);
    setGuess(null);
    setShared(false);
    api<{ questions: PageListItem[] }>('GET', `/quiz?lang=${lang}&count=${ROUNDS}`)
      .then((result) => setQuestions(result.questions))
      .catch(() => setQuestions([]));
  }, [lang]);
  useEffect(start, [start]);

  if (questions === null) return <Container size="sm"><Loader /></Container>;
  if (questions.length === 0) return <Container size="sm"><Text c="dimmed">{t.quizEmpty}</Text></Container>;

  const max = questions.length * 2;
  const done = index >= questions.length;
  const question = questions[Math.min(index, questions.length - 1)]!;
  const answer = question.scale!.type;

  function choose(type: FreeType) {
    if (guess) return;
    setGuess(type);
    const off = Math.abs(FREE_TYPE_LEVEL[type] - FREE_TYPE_LEVEL[answer]);
    setScore((s) => s + (off === 0 ? 2 : off === 1 ? 1 : 0));
  }

  async function share() {
    const text = t.quizShare(score, max);
    const url = `${origin}/quiz/${lang}`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  }

  return (
    <Container size="sm">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>{t.quizTitle}</Title>
          <Text c="dimmed">{t.quizIntro}</Text>
        </Stack>
        <Progress value={(Math.min(index + (guess ? 1 : 0), questions.length) / questions.length) * 100} size="sm" />
        {done ? (
          <Card withBorder padding="xl" ta="center">
            <Stack align="center" gap="sm">
              <Text fz={56} fw={900} lh={1}>
                {score}
                <Text span fz={28} c="dimmed">
                  /{max}
                </Text>
              </Text>
              <Text fw={700} fz="lg">
                {score >= max * 0.8 ? t.quizGreat : score >= max * 0.5 ? t.quizGood : t.quizTryAgain}
              </Text>
              <Group>
                <Button leftSection={<IconShare size={16} />} onClick={() => void share()}>
                  {shared ? t.copied : t.quizShareButton}
                </Button>
                <Button variant="default" onClick={start}>
                  {t.quizAgain}
                </Button>
              </Group>
            </Stack>
          </Card>
        ) : (
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                {index + 1} / {questions.length} · {t.quizScore(score)}
              </Text>
              <Title order={2} fz={{ base: 28, sm: 36 }}>
                {question.emoji ? `${question.emoji} ` : ''}
                {claimFor(lang, question.title, question.plural)}
                <Asterisk />
              </Title>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                {ANSWERS.map((type) => {
                  const level = FREE_TYPE_LEVEL[type];
                  const right = guess && type === answer;
                  const wrong = guess === type && type !== answer;
                  return (
                    <Button
                      key={type}
                      variant={right ? 'filled' : wrong ? 'light' : 'default'}
                      color={right ? 'green' : wrong ? 'red' : undefined}
                      onClick={() => choose(type)}
                      styles={{ label: { color: right ? undefined : SCALE_TEXT_COLORS[level], fontWeight: 800 } }}
                    >
                      <Footnote text={SCALE_FOOTNOTES[lang][type]} />
                    </Button>
                  );
                })}
              </SimpleGrid>
              {guess && (
                <Stack gap="xs">
                  <Text fw={800} c={SCALE_TEXT_COLORS[FREE_TYPE_LEVEL[answer]]}>
                    <Footnote text={SCALE_FOOTNOTES[lang][answer]} />
                  </Text>
                  <Text size="sm" c="dimmed">
                    {plainText(question.summary, 220)}{' '}
                    <Anchor component={Link} to={`/${lang}/${question.slug}`} size="sm" target="_blank">
                      {t.quizWhy}
                    </Anchor>
                  </Text>
                  <div>
                    <Button onClick={() => { setIndex((i) => i + 1); setGuess(null); }}>
                      {index + 1 < questions.length ? t.next : t.quizResult}
                    </Button>
                  </div>
                </Stack>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
