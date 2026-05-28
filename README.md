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
| `js/` | Moduli ES (auth, api, fiscal, import Intesa, UI) |
| `gestione-spese-condominiali-supabase.html` | Redirect legacy → `index.html` |
| `supabase/migrations/` | Migration versionate |
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
3. Vai in **SQL Editor** ed esegui le migration in ordine:
   - `supabase/migrations/20240101000000_initial_schema.sql`
   - `supabase/migrations/20260528100000_fiscal_and_bank.sql`  
   *(La seconda migration ricrea `dues`/`payments` — usa solo se non hai dati da conservare.)*
4. In **Authentication → Users** crea almeno un utente email/password
5. Vai in **Project Settings → API** e copia:
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
- Dovuti e versamenti legati all'esercizio fiscale
- **Import Excel Banca Intesa** (Lista Operazioni) con anteprima, match suggerito e coda manuale
- Saldo per esercizio (eccedenza / debito / pareggio)
- Dashboard con metriche aggregate
- Tema chiaro/scuro · Responsive · Import/export JSON
- Persistenza Supabase con autenticazione e RLS
