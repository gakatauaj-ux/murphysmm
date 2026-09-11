/**
 * Converts a provider's supplier rate (price per 1000 units) into what the
 * customer is charged for a given quantity, applying the service's markup.
 *
 * markupFixed (if set) overrides markupPercent entirely for that service —
 * lets admin do flat per-service pricing instead of a percentage.
 */
export function calculateCustomerPrice(params: {
  supplierRate: number; // per 1000
  quantity: number;
  markupPercent: number;
  markupFixed?: number | null;
}): number {
  const { supplierRate, quantity, markupPercent, markupFixed } = params;
  const supplierCost = (supplierRate / 1000) * quantity;

  if (markupFixed != null) {
    return round2(supplierCost + markupFixed);
  }
  return round2(supplierCost * (1 + markupPercent / 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
