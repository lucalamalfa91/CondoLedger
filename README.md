# Gestione Spese Condominiali

Tieni il conto di quello che devi al condominio e di quello che hai già pagato, per ogni
casa che possiedi.

L'amministratore manda un preventivo a inizio anno e un consuntivo alla fine, e nel mezzo
partono i bonifici. Qui dentro tutto questo diventa un numero solo: **quanto ti manca**.

---

## A cosa serve

- **Sapere se sei in regola.** La Panoramica apre su una risposta secca — in regola, oppure
  quanto manca e da quando. Sotto ci sono le prossime scadenze, le rate dell'anno e gli
  ultimi movimenti.
- **Non perdere una rata.** Dividi il preventivo in rate mensili, bimestrali, semestrali o
  a mesi scelti da te. L'app ti dice qual è la prossima, di quanto, entro quando, e ti
  prepara la causale del bonifico.
- **Non rifare i conti a mano.** Preventivo, conguaglio del consuntivo, saldo che arriva
  dall'anno prima e pagamenti fatti stanno nello stesso riepilogo, anno condominiale per
  anno condominiale.
- **Non riscrivere i bonifici.** Carichi l'estratto conto della banca e i pagamenti al
  condominio vengono riconosciuti e abbinati all'anno giusto.
- **Tenere separate più case.** Ogni immobile ha il suo anno condominiale, i suoi importi,
  la sua storia. Si cambia casa dal menu in alto.

Non è il gestionale dell'amministratore: non calcola i millesimi e non divide le spese fra
i condomini. È il registro di chi le spese le paga.

---

## Come si usa, un anno alla volta

1. **Registra il preventivo.** L'importo approvato in assemblea, con l'anno condominiale a
   cui appartiene (che non deve per forza partire a gennaio: lo imposti tu per ogni casa).
2. **Scegli come pagarlo.** Rate mensili, bimestrali, semestrali o personalizzate: l'app
   spalma l'importo e costruisce il calendario delle scadenze.
3. **Registra i pagamenti.** A mano, uno per uno, oppure importando l'estratto conto della
   banca: i movimenti in uscita che sembrano pagamenti condominiali vengono proposti già
   abbinati all'anno giusto, e tu confermi o correggi. Se ricarichi lo stesso file, niente
   si duplica.
4. **A fine anno, il conguaglio.** Quando arriva il consuntivo registri la differenza: il
   riepilogo si aggiorna e il saldo che avanza — a credito o a debito — si porta dietro
   all'anno dopo.
5. **Controlla e archivia.** Il riepilogo dell'anno si scarica in PDF, da tenere o da
   mostrare all'amministratore quando i conti non tornano.

---

## Le cinque schermate

| | |
|---|---|
| **Panoramica** | Sei in regola o no, prossime scadenze, rate dell'anno, ultimi movimenti |
| **Registra** | Preventivi e conguagli, pagamenti, saldi iniziali di ogni anno |
| **Movimenti** | Il riepilogo dell'anno condominiale e il registro completo, in sola lettura |
| **Importa estratto conto** | Il file della banca, gli abbinamenti proposti, i file già caricati |
| **Impostazioni** | Le tue case, l'account, i promemoria su calendario, il backup |

---

## Qualche dettaglio utile

- **Promemoria sul telefono.** Da Impostazioni → Calendario scarichi un file `.ics` con le
  rate che restano e un avviso 1, 3 o 5 giorni prima: si apre in Apple Calendar o si importa
  su Google Calendar. Se cambiano le rate, riscarichi e reimporti.
- **Import bancario.** Oggi legge l'export Excel di Banca Intesa. Le entrate non vengono mai
  scambiate per pagamenti, e i movimenti che l'app non sa collocare finiscono in una lista
  "da abbinare" dove decidi tu.
- **I tuoi dati sono tuoi.** L'accesso è con email e password, ogni utente vede solo le
  proprie case, e da Impostazioni → Backup esporti tutto in un file JSON.
- **Funziona anche dal telefono.** Stessa applicazione, con la barra di navigazione in basso
  e le liste in forma di schede.

---

## Installazione e deploy

Tutto quello che riguarda l'installazione in locale, la creazione degli account, il deploy
su Vercel + Turso e la migrazione dei dati da Supabase sta nella
[guida tecnica](Docs/TECNICO.md).
