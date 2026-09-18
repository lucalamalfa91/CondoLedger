/**
 * Chiave localStorage con l'email memorizzata per il prefill del form di accesso.
 * Il nome contiene ancora "supabase" di proposito: rinominarla farebbe perdere il prefill
 * agli utenti esistenti senza alcun beneficio.
 */
export const STORAGE_KEY = 'spese-condominiali-supabase-config';

export const JSON_SCHEMA_VERSION = 5;

export const MATCH_THRESHOLD_SUGGEST = 0.88;
export const MATCH_THRESHOLD_MIN = 0.50;

/** Legacy view IDs → [view, defaultSubview] */
export const VIEW_ALIASES = {
  dashboard: ['panoramica', null],
  annualita: ['registra', 'dovuti'],
  versamenti: ['registra', 'versamenti'],
  importbanca: ['importa', 'import-banca'],
  archivio: ['impostazioni', 'backup'],
  immobile: ['impostazioni', 'casa'],
  account: ['impostazioni', 'account']
};

/**
 * La vecchia vista unica "movimenti" (6 sotto-schede) è stata divisa in
 * Registra / Importa / Situazione. Mappa ogni vecchia sotto-scheda (incluse
 * le forme legacy già alias-ate) alla nuova coppia [view, subview].
 */
const MOVIMENTI_SUBVIEW_MAP = {
  dovuti: ['registra', 'dovuti'],
  versamenti: ['registra', 'versamenti'],
  'saldi-precedenti': ['registra', 'apertura-esercizio'],
  // L'import da documento non esiste più: le sue vecchie rotte restano mappate su "Da
  // banca" invece di essere cancellate, altrimenti i segnalibri salvati dagli utenti
  // finirebbero su una sotto-vista inesistente.
  'import-doc': ['importa', 'import-banca'],
  import: ['importa', 'import-banca'],
  documento: ['importa', 'import-banca'],
  'import-banca': ['importa', 'import-banca'],
  importbanca: ['importa', 'import-banca'],
  banca: ['importa', 'import-banca'],
  situazione: ['situazione', 'rendiconto']
};

/** Legacy subview IDs per view → nuova subview */
const SUBVIEW_ALIASES = {
  impostazioni: {
    avanzate: 'backup'
  }
};

export const viewMeta = {
  panoramica: {
    title: 'Panoramica',
    subtitle: 'Riepilogo della casa selezionata',
    defaultSubview: null
  },
  registra: {
    title: 'Registra',
    subtitle: 'Dovuti, versamenti e apertura esercizio',
    defaultSubview: 'dovuti',
    subviews: {
      dovuti: ['Dovuti', 'Quote e annualità'],
      versamenti: ['Versamenti', 'Pagamenti registrati'],
      'apertura-esercizio': ['Apertura esercizio', 'Saldo di partenza per esercizio']
    }
  },
  importa: {
    title: 'Importa',
    subtitle: 'Estratto conto bancario',
    defaultSubview: 'import-banca',
    subviews: {
      'import-banca': ['Da banca', 'Estratto conto Banca Intesa']
    }
  },
  situazione: {
    title: 'Situazione',
    subtitle: 'Saldi per esercizio',
    defaultSubview: 'rendiconto',
    subviews: {
      rendiconto: ['Situazione', 'Saldi per esercizio'],
      registro: ['Registro dettagliato', 'Tutti i movimenti, sola lettura']
    }
  },
  impostazioni: {
    title: 'Impostazioni',
    subtitle: 'Casa e account',
    defaultSubview: 'casa',
    subviews: {
      casa: ['Gestione immobili', 'Aggiungi, modifica ed elimina case'],
      account: ['Account', 'Profilo e password'],
      calendario: ['Calendario', 'Promemoria rate su Apple/Google Calendar'],
      backup: ['Backup', 'Esporta e importa i dati']
    }
  }
};

function remapSubview(view, subview) {
  if (!subview) return subview;
  return SUBVIEW_ALIASES[view]?.[subview] ?? subview;
}

export function resolveView(rawView, rawSubview = null) {
  if (rawView === 'movimenti') {
    const mapped = MOVIMENTI_SUBVIEW_MAP[rawSubview] || MOVIMENTI_SUBVIEW_MAP.dovuti;
    return { view: mapped[0], subview: mapped[1] };
  }
  if (VIEW_ALIASES[rawView]) {
    const [view, sub] = VIEW_ALIASES[rawView];
    return { view, subview: remapSubview(view, rawSubview ?? sub) };
  }
  const meta = viewMeta[rawView];
  if (!meta) return { view: 'panoramica', subview: null };
  return { view: rawView, subview: remapSubview(rawView, rawSubview ?? meta.defaultSubview ?? null) };
}

export function viewHeading(view, subview) {
  const meta = viewMeta[view];
  if (!meta) return ['Panoramica', ''];
  if (subview && meta.subviews?.[subview]) {
    return meta.subviews[subview];
  }
  return [meta.title, meta.subtitle];
}
