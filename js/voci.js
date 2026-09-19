/**
 * Le quattro voci di spesa, con il segno che le accompagna ovunque: in app, nei
 * pagamenti e nel PDF. Sono l'unico posto dove vivono lettera, nome e colori.
 *
 *   P  Ordinario     la quota del preventivo, divisa in rate
 *   ±  Conguaglio    consuntivo − pagato, lo calcola l'app
 *   S  Straordinari  spese deliberate a parte, come la facciata
 *   C  Consuntivo    quanto hai speso davvero, a fine anno
 */

export const VOCI = {
  ordinario: { key: 'ordinario', badge: 'P', label: 'Ordinario', long: 'Preventivo' },
  conguaglio: { key: 'conguaglio', badge: '±', label: 'Conguaglio', long: 'Conguaglio' },
  straordinari: { key: 'straordinari', badge: 'S', label: 'Straordinari', long: 'Straordinari' },
  consuntivo: { key: 'consuntivo', badge: 'C', label: 'Consuntivo', long: 'Consuntivo' }
};

/** Le tre voci che finiscono nelle rate, nell'ordine in cui compaiono ovunque. */
export const VOCI_RATA = ['ordinario', 'conguaglio', 'straordinari'];

export function isStraordinarioDue(due) {
  return (due?.voice || '') === 'straordinario' && (due?.dueKind || 'preventivo') !== 'consuntivo';
}

export function isOrdinarioDue(due) {
  return (due?.dueKind || 'preventivo') !== 'consuntivo' && !isStraordinarioDue(due);
}

/** La voce di un dovuto: è lei a decidere segno, colore e posto nei riepiloghi. */
export function dueVoice(due) {
  if ((due?.dueKind || 'preventivo') === 'consuntivo') return 'consuntivo';
  return isStraordinarioDue(due) ? 'straordinari' : 'ordinario';
}

/**
 * Il segno della voce, in quattro misure:
 *   xs  18px  dentro le tabelle e le pastiglie, dove fa da etichetta di colonna
 *   sm  22px  nelle righe compatte — l'anno in corso, l'elenco dei pagamenti
 *   md  28px  nelle righe principali e in cima ai riquadri
 *   lg  36px  quando la voce è il soggetto della schermata
 * @param {string} voice chiave in VOCI
 * @param {'xs'|'sm'|'md'|'lg'} size
 */
export function voceBadge(voice, size = 'md') {
  const v = VOCI[voice];
  if (!v) return '';
  return `<span class="voce-badge voce-badge--${size} voce--${voice}" aria-hidden="true">${v.badge}</span>`;
}

export function voceLabel(voice) {
  return VOCI[voice]?.label || '—';
}
