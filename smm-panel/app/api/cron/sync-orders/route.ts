import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getProvider } from '@/lib/provider';

const STATUS_MAP: Record<string, any> = {
  Pending: 'PENDING',
  'In progress': 'IN_PROGRESS',
  Processing: 'PROCESSING',
  Completed: 'COMPLETED',
  Partial: 'PARTIAL',
  Canceled: 'CANCELED',
  Error: 'ERROR',
};

/**
 * GET /api/cron/sync-orders
 * Wired up in vercel.json to run on a schedule (see that file). This is
 * what keeps order status current WITHOUT relying on any customer's
 * browser being open — required since the customer's polling endpoint
 * throttles itself and won't refresh orders nobody is actively viewing.
 *
 * Protected by CRON_SECRET so it can't be triggered by random requests.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const openOrders = await prisma.order.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS', 'PROCESSING'] }, providerOrderId: { not: null } },
    take: 100, // batch size — keep well under serverless execution time limit
  });

  if (openOrders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  const provider = getProvider();
  const ids = openOrders.map((o) => o.providerOrderId!) ;

  try {
    const results = await provider.getMultipleOrderStatus(ids);
    const byId = new Map(results.map((r) => [r.providerOrderId, r]));

    let updatedCount = 0;
    for (const order of openOrders) {
      const result = byId.get(order.providerOrderId!);
      if (!result) continue;
      await prisma.order.update({
        where: { id: order.id },
        data: { status: STATUS_MAP[result.status] ?? order.status, lastCheckedAt: new Date() },
      });
      updatedCount++;
    }

    return NextResponse.json({ ok: true, checked: openOrders.length, updated: updatedCount });
  } catch (err: any) {
    console.error('[cron/sync-orders] failed:', err.message);
    return NextResponse.json({ ok: false, error: 'Sync failed' }, { status: 502 });
  }
}
