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
    subtitle: 'La tua situazione, casa per casa',
    defaultSubview: null
  },
  registra: {
    title: 'Registra',
    subtitle: 'Pagamenti, preventivo, conguaglio e saldo iniziale',
    defaultSubview: 'versamenti',
    subviews: {
      versamenti: ['Registra', 'Un pagamento versato al condominio'],
      dovuti: ['Registra', 'Il preventivo dell’anno o il conguaglio del consuntivo'],
      'apertura-esercizio': ['Registra', 'Il saldo iniziale che arriva dall’anno prima']
    }
  },
  importa: {
    title: 'Importa estratto conto',
    subtitle: 'I bonifici al condominio, abbinati alle rate',
    defaultSubview: 'import-banca',
    subviews: {
      'import-banca': ['Importa estratto conto', 'Export «Lista operazioni» di Banca Intesa']
    }
  },
  situazione: {
    title: 'Movimenti',
    subtitle: 'Saldi e registro dell’anno condominiale',
    defaultSubview: 'rendiconto',
    subviews: {
      rendiconto: ['Movimenti', 'Riepilogo dell’anno condominiale'],
      registro: ['Movimenti', 'Tutto quello che hai registrato']
    }
  },
  impostazioni: {
    title: 'Impostazioni',
    subtitle: 'Casa e account',
    defaultSubview: 'casa',
    subviews: {
      casa: ['Impostazioni', 'Le tue case: aggiungi, modifica, elimina'],
      account: ['Impostazioni', 'Profilo e password'],
      calendario: ['Impostazioni', 'Promemoria delle rate su Apple o Google Calendar'],
      backup: ['Impostazioni', 'Esporta e importa i dati']
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
