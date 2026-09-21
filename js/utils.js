/**
 * Gli importi si scrivono col simbolo davanti — «€ 2.400,00» — come nel disegno e
 * come li scrive l'amministratore nei riparti: l'occhio trova prima la valuta e poi
 * la cifra, e le colonne di numeri restano allineate sulla virgola.
 */
export const currency = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', currencyDisplay: 'symbol'
});
export const today = new Date().toISOString().slice(0, 10);

/** «28 giu 2025»: la data come la scrive l'app, dovunque la mostri. */
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function fmtDate(iso) {
  const parts = String(iso || '').slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return '—';
  return DATE_FMT.format(new Date(parts[0], parts[1] - 1, parts[2]));
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function fmt(v) {
  const n = Number(v || 0);
  const body = Math.abs(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}\u20ac\u00a0${body}`;
}

/** Importi ASCII per jsPDF (Helvetica non supporta bene EUR/Unicode). */
export function pdfFmt(v) {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  const body = abs.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${body} EUR`;
}

/** Testo sicuro per jsPDF: niente frecce, meno unicode, spazi normali. */
export function pdfStr(value) {
  return String(value ?? '')
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, ' -> ')
    .replace(/[\u21b3\u2937]/g, '>')
    .replace(/\u00b7/g, ' | ')
    .replace(/\u20ac/g, 'EUR')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00c0-\u024f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function hashBlob(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function chunkArray(items, size = 80) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
