export const STORAGE_KEY = 'spese-condominiali-supabase-config';
export const DEFAULT_SUPABASE_URL = 'https://cwvwfrrknmjwdpcnqvhv.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3dndmcnJrbm1qd2RwY25xdmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzgxOTYsImV4cCI6MjA5NTU1NDE5Nn0.KrNu8Wb-rjTaG9p6IV8FL3fLpjbd_NrxVPGqVKjbxAA';

export const JSON_SCHEMA_VERSION = 3;

export const MATCH_THRESHOLD_SUGGEST = 0.85;
export const MATCH_THRESHOLD_MIN = 0.50;

/** Legacy view IDs → [view, defaultSubview] */
export const VIEW_ALIASES = {
  dashboard: ['panoramica', null],
  annualita: ['movimenti', 'dovuti'],
  versamenti: ['movimenti', 'versamenti'],
  importbanca: ['movimenti', 'import'],
  archivio: ['dati', 'backup'],
  immobile: ['impostazioni', 'casa'],
  account: ['impostazioni', 'account']
};

export const viewMeta = {
  panoramica: {
    title: 'Panoramica',
    subtitle: 'Riepilogo della casa selezionata',
    defaultSubview: null
  },
  movimenti: {
    title: 'Movimenti',
    subtitle: 'Dovuti, versamenti e import banca',
    defaultSubview: 'dovuti',
    subviews: {
      dovuti: ['Dovuti', 'Quote e annualità'],
      versamenti: ['Versamenti', 'Pagamenti registrati'],
      import: ['Import', 'Documento amministratore e banca'],
      situazione: ['Situazione', 'Saldi per esercizio']
    }
  },
  dati: {
    title: 'Dati',
    subtitle: 'Backup e registro movimenti',
    defaultSubview: 'backup',
    subviews: {
      backup: ['Backup', 'Export e import JSON'],
      registro: ['Registro', 'Tutti i movimenti']
    }
  },
  impostazioni: {
    title: 'Impostazioni',
    subtitle: 'Casa e account',
    defaultSubview: 'casa',
    subviews: {
      casa: ['Gestione immobili', 'Aggiungi, modifica ed elimina case'],
      account: ['Account', 'Profilo e password'],
      avanzate: ['Avanzate', 'Backup e dati tecnici']
    }
  }
};

export function resolveView(rawView, rawSubview = null) {
  if (VIEW_ALIASES[rawView]) {
    const [view, sub] = VIEW_ALIASES[rawView];
    return { view, subview: rawSubview ?? sub };
  }
  const meta = viewMeta[rawView];
  if (!meta) return { view: 'panoramica', subview: null };
  return { view: rawView, subview: rawSubview ?? meta.defaultSubview ?? null };
}

export function viewHeading(view, subview) {
  const meta = viewMeta[view];
  if (!meta) return ['Panoramica', ''];
  if (subview && meta.subviews?.[subview]) {
    return meta.subviews[subview];
  }
  return [meta.title, meta.subtitle];
}
