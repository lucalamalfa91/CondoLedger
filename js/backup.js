import { JSON_SCHEMA_VERSION } from './config.js';
import { periodBounds } from './fiscal.js';

export function exportBackup(data) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    houses: (data.houses || []).map(house => ({
      name: house.name,
      location: house.location || '',
      notes: house.notes || '',
      fiscalStartMonth: house.fiscalStartMonth ?? 6,
      fiscalPeriods: (house.fiscalPeriods || []).map(p => ({
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate
      })),
      dues: (house.dues || []).map(d => ({
        amount: d.amount,
        description: d.description || '',
        date: d.date || null,
        fiscalPeriodLabel: resolvePeriodLabel(house, d.fiscalPeriodId)
      })),
      payments: (house.payments || []).map(p => ({
        amount: p.amount,
        date: p.date || '',
        method: p.method || '',
        fiscalPeriodLabel: resolvePeriodLabel(house, p.fiscalPeriodId)
      }))
    }))
  };
}

function resolvePeriodLabel(house, periodId) {
  const p = house.fiscalPeriods?.find(x => x.id === periodId);
  return p?.label || null;
}

export function parseBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Formato backup non valido');
  if (raw.schemaVersion === JSON_SCHEMA_VERSION) return raw;
  if (!raw.schemaVersion && Array.isArray(raw.houses)) return migrateLegacyV1(raw);
  throw new Error(`Versione backup non supportata: ${raw.schemaVersion ?? 'sconosciuta'}`);
}

function migrateLegacyV1(raw) {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    exportedAt: null,
    migratedFrom: 'v1',
    houses: raw.houses.map(h => ({
      name: h.name,
      location: h.location || '',
      notes: h.notes || '',
      fiscalStartMonth: h.fiscalStartMonth ?? 1,
      fiscalPeriods: [],
      dues: (h.dues || []).map(d => ({
        amount: d.amount,
        description: d.description || '',
        date: d.date || null,
        fiscalPeriodLabel: d.year ? String(d.year) : null,
        _legacyYear: d.year ?? null
      })),
      payments: (h.payments || []).map(p => ({
        amount: p.amount,
        date: p.date || '',
        method: p.method || '',
        fiscalPeriodLabel: p.year ? String(p.year) : null,
        _legacyYear: p.year ?? null
      }))
    }))
  };
}

export function legacyCalendarPeriod(year) {
  return {
    label: String(year),
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  };
}

export function periodFromLabel(house, label, legacyYear) {
  if (label) {
    const found = house.fiscalPeriods.find(p => p.label === label);
    if (found) return found;
    if (/^\d{4}$/.test(label)) return legacyCalendarPeriod(Number(label));
    const startMonth = house.fiscalStartMonth ?? 6;
    const startYear = Number(label.split('/')[0]);
    if (Number.isFinite(startYear)) return periodBounds(startYear, startMonth);
  }
  if (legacyYear) return legacyCalendarPeriod(Number(legacyYear));
  return null;
}
