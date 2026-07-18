function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Piega le righe > 75 ottetti come richiesto da RFC 5545 (continuazione con CRLF + spazio). */
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const chunks = [];
  let current = '';
  let byteLen = 0;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (byteLen + chBytes > 74 && current) {
      chunks.push(current);
      current = '';
      byteLen = 0;
    }
    current += ch;
    byteLen += chBytes;
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

function dtstampNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function dtDate(iso) {
  return iso.replace(/-/g, '');
}

/** File .ics (VCALENDAR) con le rate residue del piano promemoria, pronto per import diretto. */
export function buildIcsCalendar(house, plan, leadDays) {
  const dtstamp = dtstampNow();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CondoLedger//Rate Condominiali//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${icsEscape(`Rate condominio - ${house.name}`)}`)
  ];

  for (const item of plan.items) {
    const uid = `condoledger-${house.id}-${plan.period?.id ?? 'none'}-${dtDate(item.date)}@condoledger.app`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dtDate(item.date)}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(item.summary)}`));
    lines.push(foldLine(`DESCRIPTION:${icsEscape(item.causale)}`));
    if (leadDays > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(foldLine(`DESCRIPTION:${icsEscape('Promemoria rata condominio')}`));
      lines.push(`TRIGGER:-P${leadDays}D`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function isIosDevice() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function downloadIcsFile(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Su iOS un download forzato (attributo "download") salva sempre il file
  // in Download/File senza offrire "Aggiungi a Calendario"; aprendo invece
  // l'URL direttamente, iOS riconosce il tipo text/calendar e propone
  // l'import nativo. Su desktop/Android il download resta il flusso corretto
  // (l'utente importa il file manualmente su Google Calendar).
  if (isIosDevice()) {
    a.target = '_blank';
    a.rel = 'noopener';
  } else {
    a.download = filename;
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
