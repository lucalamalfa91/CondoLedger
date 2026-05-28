export const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const today = new Date().toISOString().slice(0, 10);

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function fmt(v) {
  return currency.format(Number(v || 0));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return today;
}

export async function hashText(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
