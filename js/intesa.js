import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { toIsoDate } from './utils.js';

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const cells = row.map(norm);
    const dataIdx = cells.findIndex(c => c === 'data');
    const importoIdx = cells.findIndex(c => c.startsWith('importo'));
    if (dataIdx >= 0 && importoIdx >= 0) return { index: i, dataIdx, importoIdx, row };
  }
  return null;
}

function colIndex(headerRow, names) {
  const cells = headerRow.map(norm);
  for (const name of names) {
    const idx = cells.findIndex(c => c === name || c.startsWith(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function readWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

export function parseIntesaMovements(rows) {
  const header = findHeaderRow(rows);
  if (!header) throw new Error('Formato Intesa non riconosciuto: intestazione Data/Importo mancante.');

  const opIdx = colIndex(header.row, ['operazione']);
  const detIdx = colIndex(header.row, ['dettagli']);
  const valIdx = colIndex(header.row, ['valuta']);

  const movements = [];
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
    const rawDate = row[header.dataIdx];
    const rawAmount = row[header.importoIdx];
    if (rawDate == null || rawAmount == null || rawAmount === '') continue;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    movements.push({
      movementDate: toIsoDate(rawDate),
      operation: opIdx >= 0 ? String(row[opIdx] || '').trim() : '',
      details: detIdx >= 0 ? String(row[detIdx] || '').trim() : '',
      currency: valIdx >= 0 ? String(row[valIdx] || 'EUR').trim() : 'EUR',
      amount,
      paymentAmount: Math.abs(amount)
    });
  }

  if (!movements.length) throw new Error('Nessun movimento valido trovato nel file.');
  return movements;
}

export async function parseIntesaFile(file) {
  const rows = await readWorkbookRows(file);
  return parseIntesaMovements(rows);
}
