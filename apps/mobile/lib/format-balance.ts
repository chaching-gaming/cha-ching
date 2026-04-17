/** "+1,234" / "-500" — signed, thousands-separated. Shared between rooms list and room header. */
export function formatBalance(balance: number): string {
  const abs = Math.abs(balance);
  const formatted = abs >= 1000 ? abs.toLocaleString() : String(abs);
  return balance >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function balanceColorClass(balance: number): string {
  return balance >= 0 ? 'text-primary' : 'text-error';
}
