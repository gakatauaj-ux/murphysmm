import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/orders/list
 * Phase 1 demo: returns the most recent orders with no user scoping.
 * Phase 2: scope this by the authenticated session's userId.
 */
export async function GET() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, status: true, quantity: true, customerPrice: true, createdAt: true },
  });
  return NextResponse.json({ orders });
}
