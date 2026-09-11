import { NextRequest, NextResponse } from 'next/server';
import { getOrderWithFreshStatus } from '@/lib/orders';

/**
 * GET /api/orders/:id/status — web channel. Same throttled refresh logic
 * used by the bot's status button, via lib/orders.getOrderWithFreshStatus.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const order = await getOrderWithFreshStatus(params.id);
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ ok: true, order });
}
