import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getProvider } from '@/lib/provider';

/**
 * POST /api/services/sync
 * Pulls the current service list from the provider and upserts it locally.
 * Does NOT overwrite admin-edited fields (displayName, markup, active) —
 * only refreshes the provider-owned facts (name, rate, min/max, refill/cancel).
 *
 * Phase 1: call manually (e.g. from an admin button) or via Vercel Cron
 * (see vercel.json). Phase 2+: gate this behind admin auth.
 */
export async function POST() {
  try {
    const provider = getProvider();
    const services = await provider.getServices();

    let created = 0;
    let updated = 0;

    for (const svc of services) {
      const category = await prisma.category.upsert({
        where: { name: svc.category },
        update: {},
        create: { name: svc.category },
      });

      const existing = await prisma.service.findUnique({
        where: { providerServiceId: svc.providerServiceId },
      });

      await prisma.service.upsert({
        where: { providerServiceId: svc.providerServiceId },
        update: {
          name: svc.name,
          type: svc.type,
          supplierRate: svc.rate,
          min: svc.min,
          max: svc.max,
          refillSupported: svc.refill,
          cancelSupported: svc.cancel,
          description: svc.description,
          categoryId: category.id,
          lastSyncedAt: new Date(),
        },
        create: {
          providerServiceId: svc.providerServiceId,
          name: svc.name,
          type: svc.type,
          supplierRate: svc.rate,
          min: svc.min,
          max: svc.max,
          refillSupported: svc.refill,
          cancelSupported: svc.cancel,
          description: svc.description,
          categoryId: category.id,
          // Minimal required-params guess by type; admin can refine later.
          requiredParams: ['link', 'quantity'],
        },
      });

      existing ? updated++ : created++;
    }

    return NextResponse.json({ ok: true, created, updated, total: services.length });
  } catch (err: any) {
    // Never leak provider key or raw provider error internals to the client.
    console.error('[services/sync] failed:', err.message);
    return NextResponse.json({ ok: false, error: 'Sync failed' }, { status: 502 });
  }
}
