# Gestione Spese Condominiali

Applicazione web per gestire le spese condominiali di più immobili: dovuti per esercizio
fiscale, rate, versamenti, saldi di apertura, import dell'estratto conto Banca Intesa,
rendiconto e promemoria su calendario.

## Stack

- **Frontend**: HTML/CSS/JS puro, moduli ES nativi, nessun build step
- **Backend**: Node + Express
- **Database**: SQLite (un file), via better-sqlite3
- **Autenticazione**: email e password, sessione su cookie HttpOnly

Il server espone la REST API e serve anche i file statici, quindi tutto vive su una sola
origine: niente CORS e nessun token nel browser.

## File

| Path | Descrizione |
|---|---|
| `index.html` | Entry point dell'applicazione |
| `css/app.css` | Stili |
| `js/` | Moduli ES: api, auth, dominio fiscale, rate, import Intesa, UI |
| `server/` | Express, schema SQLite, autenticazione, rotte |
| `server/schema.sql` | Schema del database, applicato all'avvio |
| `scripts/` | CLI utenti, migrazione dati, smoke test |
| `data/` | Il file `.db` (non versionato) |
| `Dockerfile`, `fly.toml` | Deploy |
| `references/intesa-format.md` | Formato dell'export Excel di Banca Intesa |

---

## Avvio in locale

```bash
npm install
cp .env.example .env          # i default vanno bene per lo sviluppo
npm run create-user -- tua@email.it
npm start
```

Poi apri `http://localhost:3000`.

Il database viene creato al primo avvio in `./data/condoledger.db` e lo schema è applicato
automaticamente: non ci sono migration da lanciare a mano.

Per sviluppare con ricaricamento automatico del server: `npm run dev`.

### Variabili d'ambiente

Tutte hanno un default sensato; vedi `.env.example`.

| Variabile | Default | Note |
|---|---|---|
| `PORT` | `3000` | |
| `DB_PATH` | `./data/condoledger.db` | In produzione punta al volume persistente |
| `COOKIE_SECURE` | `false` | **`true` in produzione**: su HTTPS il cookie va marcato Secure |
| `SESSION_TTL_DAYS` | `30` | Durata della sessione, rinnovata a scorrimento |
| `NODE_ENV` | `development` | |

---

## Gestione utenti

Non esiste registrazione dall'applicazione: gli account si creano da riga di comando, sulla
macchina che ospita il database.

```bash
npm run create-user  -- tua@email.it     # nuovo utente
npm run set-password -- tua@email.it     # password dimenticata
```

`set-password` chiude tutte le sessioni aperte di quell'utente. Non c'è invio di email:
senza un servizio SMTP il recupero password passa da qui. Il cambio password dall'interno
dell'app (Impostazioni → Account) funziona normalmente.

---

## Test

```bash
npm test
```

Esegue `scripts/smoke-api.test.mjs` con il runner integrato di Node su un database
temporaneo. Copre login, isolamento fra utenti, CRUD di dovuti, versamenti e saldi, import
bancario con il collegamento fra movimento e versamento, cancellazioni a cascata e cambio
password. Non serve nessun servizio esterno.

---

## Migrazione da Supabase

Se stai arrivando dalla versione che usava Supabase, i dati si importano una volta sola:

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run migrate:supabase -- --dry-run     # legge e conta, non scrive
```

Verificati i conteggi, rilancia senza `--dry-run` su un database **vuoto**. Lo script
preserva gli id, verifica l'integrità referenziale alla fine e confronta le righe lette con
quelle scritte.

La `service_role` key serve perché scavalca le policy RLS: con la `anon` key si
esporterebbero solo le righe di un singolo utente. Prendila da Supabase → Project Settings →
API e cancellala dall'ambiente dopo la migrazione.

Le password non sono migrabili (sono hash bcrypt interni a Supabase): al termine lo script
elenca i comandi `set-password` da eseguire.

Dopo il passaggio, **metti in pausa il progetto Supabase e ruota le chiavi**: la vecchia
`anon` key resta nella cronologia git di questo repository.

---

## Deploy

Serve un host con **disco persistente**: SQLite è un file, e su piattaforme serverless con
filesystem effimero (come Vercel, usato in precedenza) il database verrebbe perso.

La configurazione inclusa è per Fly.io:

```bash
fly launch --no-deploy --copy-config
fly volumes create condoledger_data --size 1 --region cdg
fly deploy
fly ssh console -C "node scripts/create-user.mjs tua@email.it"
```

`fly.toml` tiene `min_machines_running = 1` e il volume montato su `/data`. **Non scalare
oltre una istanza**: il volume è agganciato a una sola macchina e SQLite ammette un solo
scrittore.

Vanno bene allo stesso modo Railway o Render con un disco persistente, o Docker su un VPS:
il `Dockerfile` è lo stesso.

La CI (`.github/workflows/deploy.yml`) esegue i test su ogni push e pull request, e fa il
deploy su `main` usando il secret `FLY_API_TOKEN`.

### Backup

Il file `.db` è tutto il database. Il volume Fly ha snapshot automatici, ma sono a livello
di blocco: per qualcosa di più solido vale la pena aggiungere
[Litestream](https://litestream.io/), che replica il WAL su S3 o R2 in continuo.

In alternativa, a mano:

```bash
fly ssh console -C "sqlite3 /data/condoledger.db \".backup /data/backup.db\""
fly sftp get /data/backup.db
```

La funzione Backup dentro l'app (Impostazioni → Backup) esporta un JSON ed è la seconda
rete di sicurezza.

---

## Note

- **Dipendenza da CDN**: `js/intesa.js` importa `xlsx` da esm.sh a runtime. Se quel CDN è
  irraggiungibile non si carica il grafo dei moduli e l'intera applicazione non parte, non
  solo l'import bancario. Vale la pena servire la libreria in locale.
- **Contesto sicuro**: l'import bancario usa `crypto.subtle`, disponibile solo su HTTPS o
  `localhost`. Aprendo l'app da un indirizzo IP di rete locale (`http://192.168.x.x`) quella
  funzione fallisce.
- **Import da documento**: la funzionalità di estrazione AI dal documento
  dell'amministratore è stata rimossa insieme a Supabase. I dovuti si inseriscono da
  Registra → Dovuti.
