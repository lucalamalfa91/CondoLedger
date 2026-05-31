# Devil's Advocate Review — Fix layout mobile responsive

**Sessione:** `fix-layout-mobile-responsive` · **Data:** 2026-05-31
**Oggetto:** `plan-and-verification.md` (output Fase 1)
**Voto DA:** OBJECT (11 challenge)

---

## Esito consolidamento (coordinatore)

Il Devil's Advocate solleva una critica fondata di **overclaim**: il verdetto APPROVE era presentato come "fix verificato/risolto" mentre la copertura runtime è parziale (16/30 AC PARTIAL o NOT-TESTED), su **casa senza dati**, **solo in emulazione Chrome**. Alcune challenge sono invece già mitigate da CSS preesistente.

**Risultato:** verdetto rivisto da **APPROVE** a **APPROVE condizionato** — il fix è corretto e l'overflow di pagina è eliminato con evidenza geometrica (immune al clip) sulle viste testate, ma il **sign-off finale** è subordinato ai controlli elencati. Output emendato in `plan-and-verification-after-devils-review.md` (originale invariato).

| # | Challenge | Categoria | Risoluzione |
|---|-----------|-----------|-------------|
| 1 | "adattarsi" ≠ "clippare overflow" | contradiction | **Parz. accolta** — `overflow-x:clip` è una rete di sicurezza, non il meccanismo di adattamento (quello è T-002/T-003/T-004). Da chiarire nel report; mantenere ma documentare. |
| 2 | Metrica binaria = artefatto del clip | error | **Parz. accolta** — la metrica primaria è lo scan offender via `getBoundingClientRect` (geometria reale, **immune** a `clip`), eseguito su tutte le viste con offender di pagina = 0; `scrollWidth` è corroborazione. Wording emendato. |
| 3 | Casa vuota non generalizza a dati densi | assumption | **Accolta (materiale)** — verifica su dati sparsi. Test con dataset denso = **prerequisito** per sign-off. |
| 4 | Nessuna baseline pre-fix del difetto | completeness-gap | **Accolta** — manca evidenza before/after. Raccomandato baseline su dati densi. |
| 5 | Safari iOS reale mai testato | assumption | **Accolta** — solo emulazione Chrome. `overflow:clip` atteso su Safari 16+ (iOS 17) ma da confermare su dispositivo reale (quirk `clip`+`sticky`+`backdrop-filter`). |
| 6 | Ellissi titolo globale → può tagliare (anche desktop) | contradiction | **Parz. accolta** — `.page-title` ellissi non è in media query. Titoli attuali sono stringhe corte fisse (rischio basso) ma la regola è non scoperta: raccomandato confinarla a mobile o confermare. |
| 7 | "Nessuna regressione desktop" da copertura parziale | completeness-gap | **Accolta** — misurato solo 1440×900. Affermazione ammorbidita: "nessuna regressione osservata a 1440; 1280/split/dati densi da verificare". |
| 8 | "Tutte le viste" non copre modali/sheet/drawer/form | vagueness | **Accolta** — NOT-TESTED. Aggiunti ai controlli obbligatori pre-rilascio. |
| 9 | Scroll orizzontale interno sub-nav riclassificato "voluto" | assumption | **Parz. accolta** — è comportamento **preesistente** della `.sub-nav` (non introdotto da questo fix); l'operatore conferma l'accettabilità a livello di requisito. |
| 10 | IBAN/`code` non spezzabile → clip taglierebbe | completeness-gap | **Respinta (con evidenza)** — `.guide-copy-row code` ha già `word-break:break-all` (`css/app.css:382`); celle generiche ora hanno `td{overflow-wrap:anywhere}`. Rischio già mitigato. |
| 11 | Touch-target width non verificata | unspecified-element | **Parz. respinta** — il CSS garantisce `.row-actions .btn{min-width:44px}` (`:124`) e `.icon-btn{width:44px;height:44px}` (`:126`); larghezza runtime non misurata → follow-up a basso rischio, non blocker. |

## Note metodologiche accettate

- Distinguere **evidenza geometrica** (offender scan, immune al clip) da **scrollWidth** (potenzialmente influenzato da `clip`): la prima è la prova primaria.
- "Eliminato l'overflow di pagina sulle viste testate (dati sparsi, Chrome)" ≠ "fix completamente verificato": il secondo richiede dati densi + Safari iOS reale + stati overlay.

## Challenge respinte/ridimensionate con evidenza

- C10: word-break IBAN già presente (`:382`).
- C11: min touch-target già garantito da CSS (`:124`, `:126`).
- C2 (in parte): offender scan via `getBoundingClientRect` già eseguito e immune al clip.
