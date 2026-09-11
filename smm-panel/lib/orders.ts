import { prisma } from './db';
import { getProvider } from './provider';
import { calculateCustomerPrice } from './pricing';
import type { Order } from '@prisma/client';

export type CreateOrderInput = {
  serviceId: string;
  idempotencyKey: string;
  link?: string;
  quantity: number;
  orderedBy?: string; // Telegram chat id, or web session id — free-form until Phase 2 auth
};

export type CreateOrderOutcome =
  | { ok: true; order: Order; deduplicated?: boolean }
  | { ok: false; error: string; order?: Order };

/**
 * Single order-creation path — used by app/api/orders/route.ts (web) and
 * the Telegram bot handler. Keeping one implementation means validation,
 * idempotency, and pricing can never drift between the two channels.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderOutcome> {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { ok: true, order: existing, deduplicated: true };

  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || !service.active) return { ok: false, error: 'Service tidak ditemukan atau nonaktif.' };

  if (input.quantity < service.min || input.quantity > service.max) {
    return { ok: false, error: `Quantity harus antara ${service.min} dan ${service.max}.` };
  }

  const requiredParams = service.requiredParams as string[];
  if (requiredParams.includes('link') && !input.link) {
    return { ok: false, error: 'Link wajib diisi untuk service ini.' };
  }

  const customerPrice = calculateCustomerPrice({
    supplierRate: service.supplierRate,
    quantity: input.quantity,
    markupPercent: service.markupPercent,
    markupFixed: service.markupFixed,
  });

  const order = await prisma.order.create({
    data: {
      serviceId: service.id,
      link: input.link,
      quantity: input.quantity,
      customerPrice,
      idempotencyKey: input.idempotencyKey,
      orderedBy: input.orderedBy,
      status: 'PENDING',
    },
  });

  try {
    const provider = getProvider();
    const result = await provider.createOrder({
      providerServiceId: service.providerServiceId,
      link: input.link,
      quantity: input.quantity,
    });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { providerOrderId: result.providerOrderId, status: 'IN_PROGRESS' },
    });
    return { ok: true, order: updated };
  } catch (err: any) {
    console.error('[createOrder] provider call failed:', err.message);
    const failed = await prisma.order.update({ where: { id: order.id }, data: { status: 'ERROR' } });
    return { ok: false, error: 'Provider menolak order. Coba lagi nanti.', order: failed };
  }
}

const STATUS_MAP: Record<string, Order['status']> = {
  Pending: 'PENDING',
  'In progress': 'IN_PROGRESS',
  Processing: 'PROCESSING',
  Completed: 'COMPLETED',
  Partial: 'PARTIAL',
  Canceled: 'CANCELED',
  Error: 'ERROR',
};

/** Same throttled check-and-refresh logic used by the web status endpoint. */
export async function getOrderWithFreshStatus(orderId: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.providerOrderId) return order;

  const staleEnough = !order.lastCheckedAt || Date.now() - order.lastCheckedAt.getTime() > 30_000;
  if (!staleEnough) return order;

  try {
    const provider = getProvider();
    const result = await provider.getOrderStatus(order.providerOrderId);
    return prisma.order.update({
      where: { id: order.id },
      data: { status: STATUS_MAP[result.status] ?? order.status, lastCheckedAt: new Date() },
    });
  } catch (err: any) {
    console.error('[getOrderWithFreshStatus] provider check failed:', err.message);
    return order;
  }
}

export async function listOrdersFor(orderedBy: string, take = 10) {
  return prisma.order.findMany({
    where: { orderedBy },
    orderBy: { createdAt: 'desc' },
    take,
    include: { service: true },
  });
}
