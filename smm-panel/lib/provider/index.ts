import 'server-only';
import type { SmmProviderAdapter } from './types';
import { MockProviderAdapter } from './mock-adapter';

export * from './types';

let cached: SmmProviderAdapter | null = null;

/**
 * Single entry point the rest of the app uses to talk to "the provider".
 * Nothing outside lib/provider/* should import a concrete adapter class
 * directly — this is what makes multi-provider support later a matter of
 * adding a new adapter + a lookup by `service.providerId`, not a rewrite.
 *
 * PROVIDER_MODE=mock (default outside production) uses in-memory sample
 * data. Set PROVIDER_MODE=live and SMMCOST_API_KEY to hit the real API.
 */
export function getProvider(): SmmProviderAdapter {
  if (cached) return cached;

  const mode = process.env.PROVIDER_MODE ?? (process.env.NODE_ENV === 'production' ? 'live' : 'mock');

  if (mode === 'live') {
    // Lazy import so the real adapter (and its server-only key read) is
    // never bundled/evaluated unless explicitly selected.
    const { SmmCostAdapter } = require('./smmcost-adapter') as typeof import('./smmcost-adapter');
    cached = new SmmCostAdapter();
  } else {
    cached = new MockProviderAdapter();
  }
  return cached;
}
