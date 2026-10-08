/**
 * The web server talks to the API over the internal network. Loaders use this; the browser
 * uses relative /api URLs instead (see api.client.ts).
 */
import { env } from './env.server';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init: { headers?: Record<string, string> } = {}): Promise<T> {
  const response = await fetch(`${env.apiInternalUrl}/api${path}`, {
    headers: { accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(response.status, body.error ?? 'error', body.message ?? response.statusText);
  }
  return (await response.json()) as T;
}

/** Like apiGet, but returns null for a 404. */
export async function apiGetOptional<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
