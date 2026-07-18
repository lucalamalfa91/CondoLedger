import type { ReminderItem } from './plan.ts';

function icsEscape(text: string): string {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Piega le righe > 75 ottetti come richiesto da RFC 5545 (continuazione con CRLF + spazio). */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const chunks: string[] = [];
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

function dtstampNow(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function dtDate(iso: string): string {
  return iso.replace(/-/g, '');
}

export function buildCalendarFeed(
  houseId: number,
  periodId: number | string,
  houseName: string,
  items: ReminderItem[],
  leadDays: number
): string {
  const dtstamp = dtstampNow();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CondoLedger//Rate Condominiali//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${icsEscape(`Rate condominio - ${houseName}`)}`),
    'X-PUBLISHED-TTL:PT24H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT24H'
  ];

  for (const item of items) {
    const uid = `condoledger-${houseId}-${periodId}-${dtDate(item.date)}@condoledger.app`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dtDate(item.date)}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(item.summary)}`));
    lines.push(foldLine(`DESCRIPTION:${icsEscape(item.description)}`));
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
