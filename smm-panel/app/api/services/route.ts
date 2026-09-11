import { NextRequest, NextResponse } from 'next/server';
import { listCustomerServices } from '@/lib/services';

/**
 * GET /api/services?q=&category=
 * Delegates to lib/services.listCustomerServices, the same function the
 * Telegram bot uses — one place decides what's customer-facing.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const services = await listCustomerServices({
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
  });
  return NextResponse.json({ services });
}
