/** Browser-side calls to the API. Same origin, so the session cookie is sent automatically. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    throw new ClientApiError(response.status, payload.error ?? 'error', payload.message ?? response.statusText);
  }
  return payload as T;
}

/** Uploads an image file as the raw request body; the API normalises it to WebP. */
export async function uploadImage(file: File): Promise<{ id: string; width: number; height: number; source: 'upload' | 'ai' }> {
  const response = await fetch('/api/assets', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    asset?: { id: string; width: number; height: number; source: 'upload' | 'ai' };
    error?: string;
    message?: string;
  };
  if (!response.ok || !payload.asset) {
    throw new ClientApiError(response.status, payload.error ?? 'error', payload.message ?? response.statusText);
  }
  return payload.asset;
}
