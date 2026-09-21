/**
 * Chiave localStorage con l'email memorizzata per il prefill del form di accesso.
 * Il nome contiene ancora "supabase" di proposito: rinominarla farebbe perdere il prefill
 * agli utenti esistenti senza alcun beneficio.
 */
export const STORAGE_KEY = 'spese-condominiali-supabase-config';

export const JSON_SCHEMA_VERSION = 5;

export const MATCH_THRESHOLD_SUGGEST = 0.88;
export const MATCH_THRESHOLD_MIN = 0.50;

/**
 * Rotte vecchie → nuove. La v3 riorganizza l'app in quattro sezioni (Panoramica,
 * Pagamenti, Resoconti, Impostazioni): qui restano mappate tutte le rotte che gli
 * utenti possono avere nei segnalibri, comprese quelle delle versioni precedenti.
 */
export const VIEW_ALIASES = {
  dashboard: ['panoramica', null],
  annualita: ['resoconti', 'preventivo'],
  dovuti: ['resoconti', 'preventivo'],
  versamenti: ['pagamenti', 'registra'],
  registra: ['pagamenti', 'registra'],
  importa: ['pagamenti', 'importa'],
  importbanca: ['pagamenti', 'importa'],
  situazione: ['resoconti', 'anno'],
  archivio: ['impostazioni', 'backup'],
  immobile: ['impostazioni', 'casa'],
  account: ['impostazioni', 'account']
};

/** Vecchie sotto-schede della vista unica «movimenti». */
const MOVIMENTI_SUBVIEW_MAP = {
  dovuti: ['resoconti', 'preventivo'],
  versamenti: ['pagamenti', 'registra'],
  'saldi-precedenti': ['resoconti', 'anno'],
  'apertura-esercizio': ['resoconti', 'anno'],
  'import-doc': ['pagamenti', 'importa'],
  import: ['pagamenti', 'importa'],
  documento: ['pagamenti', 'importa'],
  'import-banca': ['pagamenti', 'importa'],
  importbanca: ['pagamenti', 'importa'],
  banca: ['pagamenti', 'importa'],
  situazione: ['resoconti', 'anno'],
  registro: ['resoconti', 'anno'],
  rendiconto: ['resoconti', 'anno']
};

/** Sotto-schede vecchie dentro una vista che esiste ancora. */
const SUBVIEW_ALIASES = {
  impostazioni: { avanzate: 'backup' },
  pagamenti: { versamenti: 'registra', 'import-banca': 'importa', rendiconto: 'da-pagare' },
  resoconti: { rendiconto: 'anno', registro: 'anno', dovuti: 'preventivo', 'apertura-esercizio': 'anno' }
};

export const viewMeta = {
  panoramica: {
    title: 'Panoramica',
    subtitle: 'Quello che devi pagare e come sta andando l\u2019anno',
    defaultSubview: null
  },
  pagamenti: {
    title: 'Pagamenti',
    subtitle: 'Rate, conguagli e straordinari',
    defaultSubview: 'da-pagare',
    subviews: {
      'da-pagare': ['Pagamenti', 'Quello che devi pagare'],
      pagati: ['Pagamenti', 'Quello che hai gi\u00e0 pagato'],
      registra: ['Registra pagamento', 'Segna quello che hai versato al condominio'],
      importa: ['Importa estratto conto', 'I bonifici al condominio, abbinati alle rate']
    }
  },
  resoconti: {
    title: 'Resoconti',
    subtitle: 'Cosa devi, cosa hai pagato e per quale voce, anno per anno',
    defaultSubview: 'anno',
    subviews: {
      anno: ['Resoconti', 'Anno per anno, voce per voce'],
      preventivo: ['Aggiungi il preventivo', 'La quota dell\u2019anno e le sue rate'],
      consuntivo: ['Aggiungi il consuntivo', 'Quanto hai speso davvero, e il conguaglio'],
      rate: ['Rate personalizzate', 'Per ogni rata: mese, anno e cosa contiene']
    }
  },
  impostazioni: {
    title: 'Impostazioni',
    subtitle: 'Casa e account',
    defaultSubview: 'casa',
    subviews: {
      casa: ['Impostazioni', 'Le tue case: aggiungi, modifica, elimina'],
      account: ['Impostazioni', 'Profilo e password'],
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
