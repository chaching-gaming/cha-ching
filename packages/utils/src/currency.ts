/**
 * Format an amount in cents to a display currency string.
 */
export function formatCurrency(amountInCents: number, currency = 'USD'): string {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convert a dollar amount to cents (integer) for safe storage.
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert cents to a dollar amount.
 */
export function fromCents(cents: number): number {
  return cents / 100;
}
