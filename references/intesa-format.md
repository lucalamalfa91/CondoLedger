# Formato export Banca Intesa — Lista Operazioni

Riferimento derivato da `Lista_Operazioni_28052026.xlsx`.

## Foglio

- Nome tipico: `Lista Operazione`
- Righe metadata (conti, periodo export) fino ~riga 20
- **Intestazione dati** (riga con `Data` e `Importo`):

| Colonna | Nome header |
|---------|-------------|
| A | Data |
| B | Operazione |
| C | Dettagli |
| D | Conto o carta |
| E | Contabilizzazione |
| F | Categoria |
| G | Valuta |
| H | Importo |

## Importo

- Valori **negativi** = uscite (pagamenti verso amministratore / spese)
- Valori **positivi** = entrate
- Il parser importa tutti i movimenti non zero; il matching privilegia le uscite come possibili pagamenti condominio

## Parser

Implementato in `js/intesa.js` — individua automaticamente la riga header.
