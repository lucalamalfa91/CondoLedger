/**
 * Importi dell'export in centesimi interi.
 *
 * Il database tiene i soldi in REAL, già arrotondati a due decimali in scrittura
 * (`money()`). Qui si converte quel valore in un intero, così lo snapshot non
 * dipende dal binario del double e due export dello stesso dato coincidono.
 */

export function toCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const negative = n < 0;
  const [whole, frac = '00'] = Math.abs(n).toFixed(2).split('.');
  const cents = Number(whole) * 100 + Number(frac);
  return negative ? -cents : cents;
}
