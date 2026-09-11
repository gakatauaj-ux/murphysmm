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

const SAMPLE_SERVICES: ProviderService[] = [
  {
    providerServiceId: '1001',
    name: 'Instagram Followers - Real Looking',
    category: 'Instagram',
    type: 'Default',
    rate: 1.2,
    min: 100,
    max: 50000,
    refill: true,
    cancel: false,
    description: 'High quality followers, gradual delivery.',
  },
  {
    providerServiceId: '1002',
    name: 'TikTok Views',
    category: 'TikTok',
    type: 'Default',
    rate: 0.15,
    min: 500,
    max: 1000000,
    refill: false,
    cancel: true,
    description: 'Fast start, no drop guarantee.',
  },
  {
    providerServiceId: '1003',
    name: 'YouTube Comments - Custom',
    category: 'YouTube',
    type: 'Custom Comments',
    rate: 8.0,
    min: 10,
    max: 500,
    refill: false,
    cancel: false,
    description: 'Provide your own comments, one per line.',
  },
];

const orders = new Map<string, { status: OrderStatusResult['status']; remains: number }>();
let counter = 5000;

/**
 * In-memory mock used for local dev / demos before real provider
 * credentials or a real response sample are available. Swap
 * `getProvider()` in ./index.ts to use SmmCostAdapter once ready.
 */
export class MockProviderAdapter implements SmmProviderAdapter {
  async getServices(): Promise<ProviderService[]> {
    return SAMPLE_SERVICES;
  }

  async getBalance(): Promise<ProviderBalance> {
    return { balance: 250.5, currency: 'USD' };
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const id = String(++counter);
    orders.set(id, { status: 'Pending', remains: params.quantity ?? 0 });
    return { providerOrderId: id };
  }

  async getOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const o = orders.get(providerOrderId) ?? { status: 'Completed' as const, remains: 0 };
    return { providerOrderId, status: o.status, remains: o.remains, startCount: 0 };
  }

  async getMultipleOrderStatus(providerOrderIds: string[]): Promise<OrderStatusResult[]> {
    return Promise.all(providerOrderIds.map((id) => this.getOrderStatus(id)));
  }

  async refill(providerOrderId: string): Promise<RefillResult> {
    return { refillId: `rf-${providerOrderId}` };
  }

  async getRefillStatus(refillId: string): Promise<RefillStatusResult> {
    return { refillId, status: 'Completed' };
  }

  async cancel(providerOrderIds: string[]): Promise<CancelResult[]> {
    return providerOrderIds.map((id) => ({ providerOrderId: id, status: 'Canceled' }));
  }
}
