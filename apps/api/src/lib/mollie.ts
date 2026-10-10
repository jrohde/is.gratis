/**
 * The few calls to Mollie we need: create a payment and look one up. Mollie's webhook only says
 * "payment X changed"; we always ask Mollie for its status instead of trusting the request.
 */
export interface MollieDeps {
  apiKey: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

export class MollieError extends Error {}

const API = 'https://api.mollie.com/v2';

async function call<T>(deps: MollieDeps, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await (deps.fetch ?? fetch)(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${deps.apiKey}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new MollieError(`Mollie answered HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/** Mollie wants amounts as strings with two decimals: "25.00". */
export const mollieAmount = (cents: number) => ({ currency: 'EUR', value: (cents / 100).toFixed(2) });

export async function createPayment(
  deps: MollieDeps,
  input: { amountCents: number; description: string; redirectUrl: string; webhookUrl: string; invoiceId: string; locale: string },
): Promise<{ id: string; checkoutUrl: string }> {
  const payment = await call<{ id: string; _links: { checkout?: { href: string } } }>(deps, 'POST', '/payments', {
    amount: mollieAmount(input.amountCents),
    description: input.description,
    redirectUrl: input.redirectUrl,
    webhookUrl: input.webhookUrl,
    locale: input.locale,
    metadata: { invoiceId: input.invoiceId },
  });
  if (!payment._links.checkout) throw new MollieError('Mollie gave no checkout link');
  return { id: payment.id, checkoutUrl: payment._links.checkout.href };
}

export async function getPayment(
  deps: MollieDeps,
  id: string,
): Promise<{ id: string; status: string; amountCents: number; invoiceId: string | null }> {
  const payment = await call<{ id: string; status: string; amount: { value: string }; metadata?: { invoiceId?: string } | null }>(
    deps,
    'GET',
    `/payments/${encodeURIComponent(id)}`,
  );
  return {
    id: payment.id,
    status: payment.status,
    amountCents: Math.round(Number(payment.amount.value) * 100),
    invoiceId: payment.metadata?.invoiceId ?? null,
  };
}
