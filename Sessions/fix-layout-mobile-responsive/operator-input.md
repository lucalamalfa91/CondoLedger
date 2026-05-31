# Input operatore — Fix layout mobile responsive

## Richiesta (verbatim)

> La visualizzazione da mobile non è ancora corretta: vedo 3/4 di layout sul mio iPhone 15. Il layout dovrebbe adattarsi allo schermo sul quale viene visualizzato.

## Interpretazione

- **Dispositivo:** iPhone 15 — viewport CSS ~393×852 (Safari iOS).
- **Sintomo:** "vedo 3/4 di layout" → il contenuto è più largo del viewport (overflow orizzontale) oppure la pagina viene scalata/non si adatta, mostrando solo ~75% della larghezza utile.
- **Aspettativa:** layout pienamente responsive che si adatta a qualsiasi larghezza schermo, senza scroll orizzontale dell'intera pagina e senza contenuti tagliati.

## Contesto

- Sessione precedente `verifica-finale-ux-prodotto` aveva identificato MOB-001 (scroll orizzontale su Dovuti/Versamenti/Panoramica) ma **solo come analisi**, nessun fix applicato al codice.
- Questa sessione è un **fix reale** (Execute = modifiche al codice), focalizzato sulla resa mobile.

## Esito desiderato

Fix concreti in `css/app.css` (ed eventualmente `index.html` / `js/render.js`) che eliminino l'overflow orizzontale e garantiscano adattamento allo schermo su iPhone 15 e in generale su mobile, senza regressioni desktop.
