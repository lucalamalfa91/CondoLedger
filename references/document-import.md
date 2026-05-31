# Import documento amministratore (preventivo / consuntivo)

Flusso per caricare il preventivo o il consuntivo ricevuto dall'amministratore di condominio e creare automaticamente esercizio fiscale e dovuti nell'app.

## Dove si trova nell'app

**Movimenti → Import → Importa documento amministratore**

Nella stessa pagina resta disponibile l'import Excel Banca Intesa (sotto).

## Formati supportati

| Formato | Estensioni | Note |
|---------|------------|------|
| PDF | `.pdf` | Testo nativo o scansione (vision AI) |
| Word | `.docx` | Testo estratto lato server |
| Immagine | `.jpg`, `.jpeg`, `.png`, `.webp` | Una o più pagine |

- Dimensione massima: **30 MB totali** per singolo import (somma di tutti i file selezionati)
- Più foto (es. scansione pagina per pagina): selezionarle **tutte insieme** nel file picker; vengono elaborate come un unico documento, ordinate per nome file

## Flusso utente

```
1. Seleziona l'immobile (menu in alto)
2. Movimenti → Import
3. "Carica documento" → scegli PDF, DOCX o immagini
4. Attendi "Elaborazione documento in corso…"
5. Anteprima:
   - Verifica / correggi l'esercizio fiscale (es. 2024/2025)
   - Se il file contiene preventivo e consuntivo: attiva le schede che vuoi importare
   - Nella tabella, seleziona la riga che ti riguarda (nome/unità dal documento)
   - Controlla totali e rate estratte
6. "Conferma import" → riepilogo finale → conferma
```

Non viene chiesto nome o cognome **prima** del caricamento: l'estrazione include tutte le righe dell'anagrafica; scegli la tua riga solo in anteprima (revisione guidata).

### Fallback manuale

**Inserisci manualmente** apre il form dovuti classico senza salvare nulla dall'AI.

### Documento già importato

Se lo stesso file (stesso contenuto) è già stato importato per quell'immobile, l'app avvisa e chiede:

| Scelta | Effetto |
|--------|---------|
| **Aggiungi nuovo dovuto** | Crea un nuovo dovuto oltre a quelli esistenti |
| **Sostituisci import precedente** | Dopo il salvataggio dei nuovi dovuti, elimina quelli dell'import precedente |
| **Annulla** | Chiude senza importare |

Se per lo stesso esercizio esistono già dovuti dello stesso tipo (senza stesso file), viene mostrato un avviso aggiuntivo prima del commit.

## Cosa viene creato in database

Per ogni scheda confermata (Preventivo e/o Consuntivo):

1. **Esercizio fiscale** (`fiscal_periods`) — creato o riusato in base all'etichetta estratta e al mese inizio esercizio della casa
2. **Dovuto** (`dues`) con:
   - `due_kind`: `preventivo` o `consuntivo`
   - `amount`: totale della riga selezionata
   - `description`: riferimento a tipo, esercizio, nome riga e file importato

### Rate preventivo (ripartizione fedele al documento)

Se il documento elenca importi per scadenza, vengono salvati in `dues.split_amounts` (JSON) e usati da Situazione, Versamenti e PDF — **senza** ricalcolo in parti uguali.

Esempio struttura:

```json
[
  { "label": "Gen 2025", "periodStart": "2025-01-01", "amount": 120.50 },
  { "label": "Feb 2025", "periodStart": "2025-02-01", "amount": 118.00 }
]
```

Il consuntivo non ha ripartizione rate automatica (come nel form manuale).

## Tracciamento import

La tabella `document_imports` registra hash del file, etichetta sorgente e ID dei dovuti creati (per rilevare duplicati e audit).

## Architettura tecnica

| Componente | Path |
|------------|------|
| UI e stato anteprima | `js/main.js`, `js/render.js`, `index.html` |
| Client API | `js/document-import-api.js` |
| Schema / validazione | `js/document-import-schema.js`, `js/document-import-validate.js` |
| Mapping → dovuti | `js/document-import-map.js` |
| Rate esatte | `js/installments.js` (`split_amounts`) |
| Edge Function (AI) | `supabase/functions/extract-document/index.ts` |
| Migration | `supabase/migrations/20260531120000_split_amounts_document_imports.sql` |

### Sequenza

```
Browser (file) → POST /functions/v1/extract-document (JWT utente)
              → Claude (Anthropic) o OpenAI gpt-4o (JSON strutturato)
              → Anteprima HITL (nessuna scrittura DB)
              → Conferma → ensureFiscalPeriodByLabel + saveDueToSupabase
```

La chiave AI resta solo su Supabase: `OPENAI_API_KEY` (OpenAI) **oppure** `ANTHROPIC_API_KEY` (Claude). Non usare chiavi Cursor/Claude Code. Le foto JPEG vengono compresse nel browser prima dell'upload.

## Setup richiesto (una tantum)

1. Eseguire la migration `20260531120000_split_amounts_document_imports.sql` nel SQL Editor Supabase
2. Deploy della Edge Function e secret:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# oppure: supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy extract-document
```

Senza function deployata, in upload compare un messaggio che invita al deploy.

## Limitazioni attuali

- Qualità estrazione dipende dal layout del documento e dal modello AI
- PDF molto grandi possono essere lenti o costosi
- Voci di costo dettagliate e verifica millesimi: solo parziali in anteprima (estensioni future)
- Un'app = un immobile per casa; la tabella estratta può elencare tutti i condomini ma si importa solo la riga scelta

## Riferimenti council

Piano e decisioni: `Sessions/import-preventivo-consuntivo-ai/`
