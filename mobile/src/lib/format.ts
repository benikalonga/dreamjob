export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function salaryText(min: number | null, max: number | null, currency: string) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${currency} ${compact(min)}–${compact(max)} / yr`;
  return `${currency} ${compact((min ?? max)!)} / yr`;
}

export function ago(iso: string | null) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
