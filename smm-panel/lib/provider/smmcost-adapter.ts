import 'server-only';
import type {
  SmmProviderAdapter,
  ProviderService,
  ProviderBalance,
  CreateOrderParams,
  CreateOrderResult,
  OrderStatusResult,
  RefillResult,
  RefillStatusResult,
  CancelResult,
} from './types';

const API_URL = process.env.SMMCOST_API_URL ?? 'https://smmcost.com/api/v2';

/**
 * `server-only` import above will throw a build error if this file is ever
 * imported from client-side code. That is intentional: this is the ONLY
 * place the provider API key is read and used.
 */
function getApiKey(): string {
  const key = process.env.SMMCOST_API_KEY;
  if (!key) {
    throw new Error('SMMCOST_API_KEY is not set. Configure it in your deployment env vars.');
  }
  return key;
}

async function callProvider(params: Record<string, string | number | undefined>): Promise<unknown> {
  const body = new URLSearchParams();
  body.set('key', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, String(v));
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    // Serverless functions have execution time limits (Vercel default 10-60s
    // depending on plan). Fail fast rather than hanging.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Redact nothing here since we never log `body` (which contains the key).
    throw new Error(`Provider request failed with status ${res.status}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Provider returned a non-JSON response');
  }
}

/**
 * Fields mapped below are ASUMSI based on common SMM-API-v2 conventions.
 * Verify against a real response before relying on this in production —
 * see the note in ./types.ts.
 */
function mapService(raw: any): ProviderService {
  return {
    providerServiceId: String(raw.service),
    name: raw.name,
    category: raw.category,
    type: raw.type ?? 'Default',
    rate: Number(raw.rate),
    min: Number(raw.min),
    max: Number(raw.max),
    refill: Boolean(raw.refill),
    cancel: Boolean(raw.cancel),
    description: raw.description,
  };
}

function mapOrderStatus(raw: any): OrderStatusResult {
  return {
    providerOrderId: String(raw.order ?? raw.charge ? raw.order : raw.order),
    status: raw.status,
    charge: raw.charge !== undefined ? Number(raw.charge) : undefined,
    startCount: raw.start_count !== undefined ? Number(raw.start_count) : undefined,
    remains: raw.remains !== undefined ? Number(raw.remains) : undefined,
    currency: raw.currency,
  };
}

export class SmmCostAdapter implements SmmProviderAdapter {
  async getServices(): Promise<ProviderService[]> {
    const raw = await callProvider({ action: 'services' });
    if (!Array.isArray(raw)) {
      throw new Error('Unexpected /services response shape from provider');
    }
    return raw.map(mapService);
  }

  async getBalance(): Promise<ProviderBalance> {
    const raw: any = await callProvider({ action: 'balance' });
    return { balance: Number(raw.balance), currency: raw.currency ?? 'USD' };
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const raw: any = await callProvider({
      action: 'add',
      service: params.providerServiceId,
      link: params.link,
      quantity: params.quantity,
      runs: params.runs,
      interval: params.interval,
      comments: params.comments,
      usernames: params.usernames,
      hashtags: params.hashtags,
      hashtag: params.hashtag,
      username: params.username,
      media: params.media,
      min: params.min,
      max: params.max,
      posts: params.posts,
      old_posts: params.old_posts,
      delay: params.delay,
      expiry: params.expiry,
      answer_number: params.answer_number,
      groups: params.groups,
    });
    if (raw.error) throw new Error(`Provider error: ${raw.error}`);
    return { providerOrderId: String(raw.order) };
  }

  async getOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const raw: any = await callProvider({ action: 'status', order: providerOrderId });
    return mapOrderStatus({ ...raw, order: providerOrderId });
  }

  async getMultipleOrderStatus(providerOrderIds: string[]): Promise<OrderStatusResult[]> {
    const raw: any = await callProvider({ action: 'status', orders: providerOrderIds.join(',') });
    // ASUMSI: multi-status returns an object keyed by order id, per common convention.
    return Object.entries(raw).map(([orderId, val]) => mapOrderStatus({ ...(val as object), order: orderId }));
  }

  async refill(providerOrderId: string): Promise<RefillResult> {
    const raw: any = await callProvider({ action: 'refill', order: providerOrderId });
    return { refillId: String(raw.refill) };
  }

  async getRefillStatus(refillId: string): Promise<RefillStatusResult> {
    const raw: any = await callProvider({ action: 'refill_status', refill: refillId });
    return { refillId, status: raw.status };
  }

  async cancel(providerOrderIds: string[]): Promise<CancelResult[]> {
    const raw: any = await callProvider({ action: 'cancel', orders: providerOrderIds.join(',') });
    // ASUMSI shape; adjust once real response is known.
    if (Array.isArray(raw)) {
      return raw.map((r: any) => ({ providerOrderId: String(r.order), status: r.status }));
    }
    return providerOrderIds.map((id) => ({ providerOrderId: id, status: raw.status ?? 'unknown' }));
  }
}
