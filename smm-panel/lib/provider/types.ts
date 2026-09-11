/**
 * Provider abstraction layer.
 *
 * IMPORTANT: field names below marked "ASUMSI" are based on the common
 * "SMM API v2" convention used by many panels, NOT confirmed from the
 * actual provider response. Do not treat them as verified until you've
 * captured a real response from https://smmcost.com/api/v2 and compared it
 * here. Update this file (and smmcost-adapter.ts) the moment you have
 * real payloads — nothing downstream should need to change except the
 * mapping functions in the adapter.
 */

export interface ProviderService {
  providerServiceId: string; // provider's "service" id
  name: string;
  category: string;
  type: string; // e.g. "Default", "Custom Comments", "Poll", "Package" — ASUMSI, provider-specific
  rate: number; // supplier price per 1000 (or provider's unit) — ASUMSI unit
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
  description?: string;
  // Some providers include a `dripfeed`, `average time`, etc. Left out until confirmed.
}

export interface CreateOrderParams {
  providerServiceId: string;
  link?: string;
  quantity?: number;
  runs?: number;
  interval?: number;
  comments?: string;
  usernames?: string;
  hashtags?: string;
  hashtag?: string;
  username?: string;
  media?: string;
  min?: number;
  max?: number;
  posts?: number;
  old_posts?: number;
  delay?: number;
  expiry?: string;
  answer_number?: string;
  groups?: string;
}

export interface CreateOrderResult {
  providerOrderId: string;
}

export type ProviderOrderStatus =
  | 'Pending'
  | 'In progress'
  | 'Completed'
  | 'Partial'
  | 'Processing'
  | 'Canceled'
  | 'Error';

export interface OrderStatusResult {
  providerOrderId: string;
  status: ProviderOrderStatus;
  charge?: number; // supplier charge, ASUMSI
  startCount?: number;
  remains?: number;
  currency?: string;
}

export interface RefillResult {
  refillId: string;
}

export interface RefillStatusResult {
  refillId: string;
  status: string;
}

export interface CancelResult {
  providerOrderId: string;
  status: string;
}

export interface ProviderBalance {
  balance: number;
  currency: string;
}

/**
 * Every upstream provider (current: smmcost, future: provider B, C, ...)
 * implements this interface. The rest of the application only depends on
 * this interface, never on a concrete provider class.
 */
export interface SmmProviderAdapter {
  getServices(): Promise<ProviderService[]>;
  getBalance(): Promise<ProviderBalance>;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  getOrderStatus(providerOrderId: string): Promise<OrderStatusResult>;
  getMultipleOrderStatus(providerOrderIds: string[]): Promise<OrderStatusResult[]>;
  refill(providerOrderId: string): Promise<RefillResult>;
  getRefillStatus(refillId: string): Promise<RefillStatusResult>;
  cancel(providerOrderIds: string[]): Promise<CancelResult[]>;
}
