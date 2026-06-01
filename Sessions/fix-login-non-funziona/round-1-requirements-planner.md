## Requirements Planner — Round 1 Response

**Vote**: PROPOSE

**Reasoning**:
"Login non funziona" è un report ambiguo che può coprire almeno otto scenari distinti nel flusso attuale (`createSupabaseClient` → `handleAuthCallbackError` → `bindAuthStateChange` → `restoreSession` / `signIn`). Il dominio documenta già un deadlock storico tra `onAuthStateChange` e `getSession()` che poteva bloccare spinner e chiamate REST; serve quindi definire criteri verificabili per ogni sintomo osservabile (UI bloccata, errore silenzioso, sessione non persistita, redirect errato) prima che Architect/Implementer scelgano la causa root. Le story sotto separano bootstrap iniziale, submit form, restore sessione e flussi satellite (recovery, logout) così il fix è misurabile end-to-end e non solo "il bottone risponde".

**Details**:

### Sintomi possibili di "login broken" (tassonomia)

| # | Sintomo osservabile | Dove nel codice | Ipotesi frequente |
|---|---------------------|-----------------|-------------------|
| S1 | Spinner "Accesso in corso..." infinito **al caricamento pagina** | `initApp` → `setLoginLoading(true)` → `restoreSession` | Deadlock auth listener + `getSession` |
| S2 | Spinner infinito **dopo submit** | `signIn` → `loadHouseData` | Auth OK ma load bloccato |
| S3 | Submit senza reazione | `loginForm` listener | Moduli ES non caricati (SyntaxError upstream) |
| S4 | Errore credenziali con credenziali corrette | `signIn` catch | Config URL/key errata |
| S5 | Login OK ma resta schermata login | `setAuthUI`, race listener | Listener resetta UI |
| S6 | Entra in app ma dati vuoti | `loadFromSupabase` | 401 RLS post-login |
| S7 | Reload riporta al login | `restoreSession` | Sessione non persistita |
| S8 | Recovery/callback errore | `handleAuthCallbackError` | Parametri URL PKCE |

### User stories (US-001 … US-008)

Vedi plan.md per elenco completo con AC.

### Domande diagnostiche per l'operatore

1. Quale sintomo S1–S8?
2. Ambiente: locale o Vercel?
3. Errori Console al load o submit?
4. Network: POST `auth/v1/token` presente?

### Open questions

1. S1 (blocco al load) o S3 (submit muto)?
2. Session key in localStorage dopo tentativo login?
3. Problema tutti utenti o uno solo?
