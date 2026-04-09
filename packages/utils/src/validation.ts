export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isPositiveAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}
