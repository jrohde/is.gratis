/**
 * Generates illustrations with any OpenAI-compatible images endpoint (OpenAI, or a model you
 * host yourself behind LocalAI or a similar server). The result is always labelled as
 * AI-generated on the page.
 */
import type { Language } from '@isgratis/types';
import { questionFor } from '@isgratis/types';
import { LlmError } from './llm.js';

export interface ImageConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  timeoutMs: number;
}

export function buildImagePrompt(lang: Language, title: string, summary: string): string {
  const context = summary.replace(/[*_`>#[\]()]/g, '').replace(/\s+/g, ' ').slice(0, 300);
  return [
    `An editorial illustration for an encyclopedia article that answers the question "${questionFor(lang, title)}".`,
    `Subject: ${title}. Context: ${context}`,
    'Style: friendly, modern flat illustration, soft colours, simple shapes, clean light background, wide composition.',
    'No text, letters, numbers, logos, brand names or watermarks. No recognisable real people.',
  ].join('\n');
}

export async function generateImage(config: ImageConfig, prompt: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, prompt, size: config.size, n: 1 }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new LlmError(`Image request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LlmError(`Image model returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = payload.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first?.url) {
    const image = await fetch(first.url, { signal: AbortSignal.timeout(config.timeoutMs) });
    if (!image.ok) throw new LlmError(`Could not download the generated image: HTTP ${image.status}`);
    return Buffer.from(await image.arrayBuffer());
  }
  throw new LlmError('Image model answer has no image');
}
