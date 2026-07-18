# Gestione Spese Condominiali — Supabase Static

Web app statica per gestire le spese condominiali di più immobili, con persistenza su Supabase e deploy su Vercel.

## Stack

- **Frontend**: HTML/CSS/JS puro, nessun build step
- **Database**: Supabase (PostgreSQL) con Row Level Security
- **Deploy**: Vercel (static site)
- **Auth**: Supabase Auth (email/password)

## File

| Path | Descrizione |
|---|---|
| `index.html` | Entry point applicazione |
| `css/app.css` | Stili |
| `js/` | Moduli ES (auth, api, fiscal, import documento AI, import Intesa, UI) |
| `gestione-spese-condominiali-supabase.html` | Redirect legacy → `index.html` |
| `supabase/migrations/` | Migration versionate |
| `supabase/functions/extract-document/` | Edge Function estrazione AI (PDF/DOCX/immagini) |
| `references/document-import.md` | **Flusso import preventivo/consuntivo** (guida utente e tecnica) |
| `references/intesa-format.md` | Formato export Excel Banca Intesa |
| `vercel.json` | Routing Vercel |

---

## Avvio in locale

L'app usa ES Modules serviti staticamente. Avvia un mini server HTTP:

```bash
npx serve .
```

Poi naviga su `http://localhost:3000` (o la porta mostrata).

Entry point: **`index.html`**

---

## Setup Supabase (primo avvio — passi manuali obbligatori)

Questi passaggi non sono automatizzabili dal pipeline CI/CD perché richiedono interazione umana o dati sensibili non replicabili.

1. Crea un account su [supabase.com](https://supabase.com)
2. Crea un nuovo progetto (nota: il provisioning richiede ~2 minuti)
3. Vai in **SQL Editor** ed esegui le migration in ordine (solo quelle non ancora applicate al tuo progetto):
   - `supabase/migrations/20240101000000_initial_schema.sql`
   - `supabase/migrations/20260528100000_fiscal_and_bank.sql`  
   *(Ricrea `dues`/`payments` — solo installazioni nuove senza dati da conservare.)*
   - `supabase/migrations/20260528120000_dues_payments_update.sql`
   - `supabase/migrations/20260529120000_installments.sql`
   - `supabase/migrations/20260529140000_preventivo_consuntivo.sql`
   - `supabase/migrations/20260531120000_split_amounts_document_imports.sql` *(import documento AI + rate esatte)*
4. Per l'**import documento amministratore** (opzionale ma necessario per l'AI): deploy Edge Function — vedi sezione [Import documento amministratore](#import-documento-amministratore) sotto
5. In **Authentication → Users** crea almeno un utente email/password
6. Vai in **Project Settings → API** e copia:
   - **Project URL** → es. `https://abcdefgh.supabase.co`
   - **anon public key** → stringa JWT lunga

---

## Configurazione credenziali nell'app

### Opzione A — Hardcode nel file (consigliato per uso privato/monoente)

Apri `js/config.js` e imposta:

```js
export const DEFAULT_SUPABASE_URL = 'https://xxxx.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJ...';
```

### Opzione B — Runtime via UI

Lascia i valori vuoti. Al primo accesso all'app, vai nella sezione **Config** e inserisci URL e chiave. Vengono salvati in `localStorage`.

---

## Deploy su Vercel (passi manuali)

### Prima volta — dalla UI web (più semplice)

1. Pusha questo repo su GitHub
2. Vai su [vercel.com](https://vercel.com) → **Add New Project**
3. Importa il repo GitHub
4. Framework preset: **Other** (nessun build command)
5. Clicca **Deploy**
6. Vercel si aggancia al repo: ogni `git push` su `main` rideploya automaticamente

### Dalla CLI

```bash
npm i -g vercel
vercel login
vercel link          # collega il progetto locale a Vercel
vercel --prod        # deploy in produzione
```

---

## Pipeline CI/CD con GitHub Actions — Setup manuale dei secrets

Il file `.github/workflows/deploy.yml` (da creare, vedi sezione sotto) richiede 5 secrets configurati manualmente nel repository GitHub.

### Come configurarli

Vai su **GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret** e aggiungi:

| Secret | Come ottenerlo |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) → crea token |
| `VERCEL_ORG_ID` | Dopo `vercel link` leggi `.vercel/project.json` → campo `orgId` |
| `VERCEL_PROJECT_ID` | Dopo `vercel link` leggi `.vercel/project.json` → campo `projectId` |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → crea token |
| `SUPABASE_PROJECT_REF` | Supabase → Project Settings → General → **Reference ID** (12 caratteri) |

### Ottenere `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` tramite CLI

```bash
npm i -g vercel
vercel login
vercel link   # segui i prompt
cat .vercel/project.json
# { "orgId": "team_xxx", "projectId": "prj_xxx" }
```

### Aggiunta rapida via GitHub CLI

```bash
gh secret set VERCEL_TOKEN         --body "token_qui"
gh secret set VERCEL_ORG_ID        --body "team_xxx"
gh secret set VERCEL_PROJECT_ID    --body "prj_xxx"
gh secret set SUPABASE_ACCESS_TOKEN --body "sbp_xxx"
gh secret set SUPABASE_PROJECT_REF  --body "abcdefghijkl"
```

---

## Limitazioni del pipeline automatico

Questo progetto ha caratteristiche che rendono alcuni aspetti del CI/CD non completamente automatizzabili:

### 1. Primo avvio sempre manuale
Il progetto Supabase e l'utente database devono essere creati a mano. Non esiste un'API pubblica per creare utenti auth da CI senza esporre credenziali admin.

### 2. Modifiche allo schema non tracciate
`supabase-schema.sql` usa `CREATE TABLE IF NOT EXISTS` ma **non è versionato come migration**. Se aggiungi colonne o indici in futuro, devi:
- Scrivere un `ALTER TABLE` separato
- Eseguirlo manualmente in Supabase SQL Editor
- Aggiornare `supabase-schema.sql` a mano

Per un sistema di migration versionato (es. Supabase CLI + cartella `supabase/migrations/`) servirebbero Supabase CLI e una ristrutturazione del repo.

### 3. Nessun ambiente di staging
Non c'è un progetto Supabase separato per le PR/preview. Le preview Vercel puntano alla stessa istanza Supabase di produzione (o a nessuna, se non configurato).

### 4. Credenziali Supabase non iniettate automaticamente
L'URL e la chiave Supabase non vengono iniettate nel file HTML durante il deploy perché non c'è un build step. Gli utenti devono configurarle a runtime (vedi Opzione A/B sopra).

### 5. I secrets vanno aggiornati a mano in caso di rotazione
Se ruoti il `VERCEL_TOKEN` o `SUPABASE_ACCESS_TOKEN`, devi aggiornarli manualmente nei secrets GitHub.

---

## Sicurezza

La `anon key` di Supabase è progettata per essere pubblica — la protezione dei dati avviene tramite **Row Level Security (RLS)**: ogni utente può leggere e scrivere solo i propri immobili, dovuti e versamenti.

Non committare mai la `service_role key` nel codice o nei secrets pubblici.

---

## Funzionalità

- Gestione multi-casa
- **Esercizio fiscale configurabile** per casa (es. giugno–maggio, etichetta 2024/2025)
- Dovuti e versamenti legati all'esercizio fiscale (preventivo con rate mensili/bimestrali/semestrali/custom o importi per rata dal documento)
- **Import documento amministratore** — PDF, DOCX o foto del preventivo/consuntivo con estrazione AI, anteprima e conferma prima del salvataggio (vedi sotto)
- **Import Excel Banca Intesa** (Lista Operazioni) con anteprima, match suggerito e coda manuale
- Situazione per esercizio ed export PDF
- Saldo per esercizio (eccedenza / debito / pareggio)
- Dashboard con metriche aggregate
- Tema chiaro/scuro · Responsive · Import/export JSON
- Persistenza Supabase con autenticazione e RLS

---

## Import documento amministratore

Carica il preventivo o il consuntivo che ricevi dall'amministratore (PDF, Word o scansione fotografica) e popola automaticamente esercizio fiscale, totale e rate della tua unità.

### Percorso nell'app

**Importa → Da documento**

### Passi tipici

1. Seleziona l'immobile.
2. Carica il file (per più pagine fotografate, seleziona tutte le immagini in una volta).
3. Attendi l'elaborazione AI.
4. In **anteprima**: correggi l'esercizio se serve, attiva le schede Preventivo/Consuntivo presenti nel file, **clicca la riga della tabella che ti riguarda**.
5. Conferma l'import dal riepilogo.

Non ti viene chiesto il nome prima dell'estrazione: scegli la tua riga solo dopo, nella tabella estratta.

Le **rate del preventivo** vengono importate con gli **stessi importi** del documento (non una ripartizione equa approssimata).

Se il file era già importato, puoi **annullare**, **aggiungere** un nuovo dovuto o **sostituire** quelli creati dall'import precedente.

Documentazione completa: [`references/document-import.md`](references/document-import.md)

### Setup Edge Function (una tantum)

Richiede una chiave API nei **Secrets** Supabase (`ANTHROPIC_API_KEY` per Claude **oppure** `OPENAI_API_KEY` per OpenAI) e il **deploy** della function.

**Importante:** se in console del browser vedi un errore **CORS** su `extract-document`, quasi sempre la function **non è deployata** (Supabase risponde 404 al preflight OPTIONS, senza header CORS). Configurare solo il secret non basta.

Da PowerShell nella root del repo (senza installare la CLI globalmente):

```powershell
.\scripts\deploy-extract-document.ps1
```

Oppure manualmente:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref cwvwfrrknmjwdpcnqvhv
npx supabase@latest secrets set ANTHROPIC_API_KEY=sk-ant-...
# opzionale, forza Claude anche se esiste OPENAI_API_KEY:
# npx supabase@latest secrets set AI_PROVIDER=anthropic
npx supabase@latest functions deploy extract-document --project-ref cwvwfrrknmjwdpcnqvhv
```

Verifica: `curl -X OPTIONS https://cwvwfrrknmjwdpcnqvhv.supabase.co/functions/v1/extract-document` deve restituire **HTTP 204** (non 404).

Assicurati di aver eseguito la migration `20260531120000_split_amounts_document_imports.sql`.

Senza deploy, l'upload fallisce; puoi comunque usare **Inserisci manualmente** o l'import Intesa.

### Promemoria rate su calendario (Apple/Google)

Da Impostazioni → Calendario, il wizard genera un file **.ics** scaricabile con le rate residue dell'esercizio corrente (importo mancante ÷ rate rimanenti, tenendo conto di conguagli e versamenti già fatti) e un promemoria (1, 3 o 5 giorni prima). Il file va aperto per aggiungere gli eventi ad Apple Calendar, oppure importato su Google Calendar da calendar.google.com → Impostazioni → Importa e esporta. Tutto avviene lato client: nessun deploy, nessun secret, nessun server coinvolto. Se cambiano le rate va semplicemente riscaricato e reimportato.
