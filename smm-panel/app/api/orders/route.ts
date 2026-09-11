import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder } from '@/lib/orders';

const orderSchema = z.object({
  serviceId: z.string(),
  idempotencyKey: z.string().min(8),
  link: z.string().url().optional(),
  quantity: z.number().int().positive(),
});

/**
 * POST /api/orders — web channel. Delegates to lib/orders.createOrder,
 * the same function the Telegram bot uses, so validation/pricing/
 * idempotency can't drift between channels.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createOrder({ ...parsed.data, orderedBy: 'web' });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, order: result.order }, { status: 400 });
  }
  return NextResponse.json({ ok: true, order: result.order, deduplicated: result.deduplicated });
}
