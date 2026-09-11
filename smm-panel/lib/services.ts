import { prisma } from './db';
import { calculateCustomerPrice } from './pricing';

export type CustomerFacingService = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  min: number;
  max: number;
  refillSupported: boolean;
  cancelSupported: boolean;
  requiredParams: string[];
  pricePer1000: number;
};

/**
 * Single source of truth for "what a customer is allowed to see about a
 * service". Never returns supplierRate/providerServiceId — used by the
 * web API (app/api/services/route.ts) and the Telegram bot alike, so
 * there is exactly one place that decides what's customer-facing.
 */
export async function listCustomerServices(opts: { q?: string; category?: string } = {}): Promise<CustomerFacingService[]> {
  const services = await prisma.service.findMany({
    where: {
      active: true,
      ...(opts.category ? { category: { name: opts.category } } : {}),
      ...(opts.q
        ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' } }, { displayName: { contains: opts.q, mode: 'insensitive' } }] }
        : {}),
    },
    include: { category: true },
    orderBy: { name: 'asc' },
  });

  return services.map((s) => ({
    id: s.id,
    name: s.displayName ?? s.name,
    category: s.category.name,
    description: s.description,
    min: s.min,
    max: s.max,
    refillSupported: s.refillSupported,
    cancelSupported: s.cancelSupported,
    requiredParams: s.requiredParams as string[],
    pricePer1000: calculateCustomerPrice({
      supplierRate: s.supplierRate,
      quantity: 1000,
      markupPercent: s.markupPercent,
      markupFixed: s.markupFixed,
    }),
  }));
}

export async function listCategories(): Promise<string[]> {
  const categories = await prisma.category.findMany({
    where: { services: { some: { active: true } } },
    orderBy: { name: 'asc' },
  });
  return categories.map((c) => c.name);
}
