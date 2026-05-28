# Gestione Spese Condominiali - Supabase Static

Web app statica per gestire le spese condominiali di più immobili, con persistenza su Supabase e deploy su Vercel.

## Stack

- **Frontend**: HTML/CSS/JS puro, nessun build step
- **Database**: Supabase (PostgreSQL) con Row Level Security
- **Deploy**: Vercel (static site)
- **Auth**: Supabase Auth (email/password)

## File

| File | Descrizione |
|---|---|
| `gestione-spese-condominiali-supabase.html` | App completa (unico file) |
| `supabase-schema.sql` | Schema DB + policy RLS |
| `vercel.json` | Config routing Vercel |

## Setup Supabase

1. Crea un nuovo progetto su [Supabase](https://supabase.com)
2. Vai in **SQL Editor** ed esegui il contenuto di `supabase-schema.sql`
3. In **Authentication → Users** crea il tuo utente email/password
4. Copia **Project URL** e **anon public key** da Project Settings → API

## Configurazione app

### Opzione A — Hardcode nel file (consigliato per uso privato)

Apri `gestione-spese-condominiali-supabase.html` e imposta:

```js
const DEFAULT_SUPABASE_URL = 'https://xxxx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJ...';
```

### Opzione B — Runtime

Lascia i valori vuoti e inseriscili nella sezione **Config** dell'app al primo accesso.

## Deploy su Vercel

### Da interfaccia web

1. Pusha questo repo su GitHub
2. Vai su [Vercel](https://vercel.com) → **Add New Project**
3. Importa il repo GitHub
4. Framework preset: **Other**
5. Clicca **Deploy**

### Da CLI

```bash
npm i -g vercel
vercel       # preview deploy
vercel --prod  # production deploy
```

## Sicurezza

La `anon key` di Supabase è progettata per essere pubblica — la protezione dei dati avviene tramite **Row Level Security (RLS)**: ogni utente può leggere e scrivere solo i propri immobili, dovuti e versamenti.

## Funzionalità

- ✅ Gestione multi-casa
- ✅ Dovuti per annualità
- ✅ Versamenti con data e metodo
- ✅ Saldo per anno (eccedenza / debito / pareggio)
- ✅ Dashboard con metriche aggregate
- ✅ Tema chiaro/scuro
- ✅ Responsive mobile
- ✅ Import/export JSON locale
- ✅ Persistenza Supabase con autenticazione
- ✅ RLS per isolamento dati per utente
