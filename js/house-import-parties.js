/** @typedef {{ role: 'owner'|'tenant', firstName: string, lastName: string }} ImportParty */

export const PARTY_MATCH_PRESELECT = 0.88;
export const PARTY_MATCH_WARN = 0.7;

export function normalizePartyName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function partyDisplayName(p) {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
}

/** @returns {ImportParty[]} */
export function parseImportPartiesFromDb(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(p => ({
      role: p.role === 'tenant' ? 'tenant' : 'owner',
      firstName: String(p.firstName ?? p.first_name ?? '').trim(),
      lastName: String(p.lastName ?? p.last_name ?? '').trim()
    }))
    .filter(p => p.firstName || p.lastName);
}

/** @param {ImportParty[]} parties */
export function serializeImportParties(parties) {
  return (parties || []).map(p => ({
    role: p.role === 'tenant' ? 'tenant' : 'owner',
    firstName: String(p.firstName || '').trim(),
    lastName: String(p.lastName || '').trim()
  }));
}

/** @param {ImportParty[]} parties */
export function validateParties(parties) {
  const warnings = [];
  const list = parties || [];
  if (!list.length) return warnings;
  const tenants = list.filter(p => p.role === 'tenant');
  if (tenants.length > 1) warnings.push('È consentito al massimo un affittuario.');
  for (const p of list) {
    const fn = p.firstName?.trim();
    const ln = p.lastName?.trim();
    if ((fn && !ln) || (!fn && ln)) {
      warnings.push(`Completa nome e cognome per ${p.role === 'tenant' ? 'affittuario' : 'proprietario'}.`);
    }
    if (fn && ln) continue;
    if (fn || ln) {
      warnings.push(`Completa nome e cognome per ${p.role === 'tenant' ? 'affittuario' : 'proprietario'}.`);
    }
  }
  return warnings;
}

export function hasConfiguredParties(house) {
  return (house?.importParties || []).some(
    p => p.role === 'owner' && p.firstName?.trim() && p.lastName?.trim()
  );
}

/** Legge nominativi dal form impostazioni casa. */
export function collectImportPartiesFromDom(root) {
  if (!root) return [];
  const parties = [];
  root.querySelectorAll('[data-party-row]').forEach(row => {
    const role = row.dataset.role === 'tenant' ? 'tenant' : 'owner';
    const firstName = row.querySelector('[data-party-first]')?.value?.trim() || '';
    const lastName = row.querySelector('[data-party-last]')?.value?.trim() || '';
    if (!firstName && !lastName) return;
    parties.push({ role, firstName, lastName });
  });
  const tenantOn = root.querySelector('#houseTenantEnabled')?.checked;
  if (!tenantOn) return parties.filter(p => p.role !== 'tenant');
  return parties;
}
