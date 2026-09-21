import {
  buildSituazioneReport,
  carryFromLabel,
  hasConsuntivoReport,
  hasPreventivoReport,
  hasPriorBalanceReport,
  priorBalancePresentation,
  priorBalanceSourceLabel
} from './situazione-report.js';
import { findInstallment, installmentShortLabel, inferInstallmentKey, installmentSummaryForPeriod } from './installments.js';
import { computeConguaglio, sumConsuntivoDue, sumOrdinarioDue, sumPaid, sumStraordinariDue } from './fiscal.js';
import { pdfFmt, pdfStr } from './utils.js';

async function loadPdfLibs() {
  const [jspdfMod, autoTableMod] = await Promise.all([
    import('https://esm.sh/jspdf@2.5.2'),
    import('https://esm.sh/jspdf-autotable@3.8.4')
  ]);
  const jsPDF = jspdfMod.jsPDF?.default || jspdfMod.jsPDF || jspdfMod.default;
  const autoTable = autoTableMod.default || autoTableMod.autoTable;
  if (!jsPDF || !autoTable) throw new Error('Librerie PDF non disponibili.');
  return { jsPDF, autoTable };
}

const PDF_TABLE = {
  styles: { fontSize: 8, font: 'helvetica', overflow: 'linebreak' },
  headStyles: { font: 'helvetica', fontStyle: 'bold' },
  bodyStyles: { font: 'helvetica' }
};

function cell(value) {
  return pdfStr(value);
}

/** Una data come la scrive chi legge: 30/06/2025, non 2025-06-30. */
function dataIt(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '-');
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** «Rata 4 · settembre 2025»: come la chiama chi paga. */
function nomeRata(slot, indice) {
  const mese = Number(String(slot?.periodStart || '').slice(5, 7));
  const anno = String(slot?.periodStart || '').slice(0, 4);
  return `Rata ${indice + 1}${mese ? ` · ${MESI[mese - 1]} ${anno}` : ''}`;
}

function addSectionTitle(doc, y, title) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(cell(title), 14, y);
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

function renderPdfHeader(doc, house, period, reportTitle) {
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(cell(reportTitle), 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(cell(`Immobile: ${house.name}`), 14, y);
  y += 5;
  doc.text(cell(`Esercizio: ${period.label} (${period.startDate} - ${period.endDate})`), 14, y);
  y += 5;
  doc.text(cell(`Export: ${new Date().toLocaleString('it-IT')}`), 14, y);
  return y + 8;
}

/**
 * Che cosa copre un versamento: la rata a cui è agganciato, il conguaglio
 * dell'anno prima, oppure niente di preciso.
 */
export function coperturaVersamento(house, report, p) {
  if (p.priorBalanceId) {
    const fonte = report.priorBalance ? priorBalanceSourceLabel(house, report.priorBalance) : null;
    return fonte && fonte !== '—' ? `Conguaglio ${fonte}` : 'Conguaglio anno precedente';
  }
  const key = p.installmentKey || inferInstallmentKey(house, p);
  if (!key) return 'Non assegnato';
  const slot = findInstallment(house, key);
  return slot ? nomeRata(slot, Number(slot.slotIndex ?? 0)) : installmentShortLabel(house, key);
}

function paymentPdfRows(house, report, payments) {
  return payments.map(p => [
    cell(coperturaVersamento(house, report, p)),
    cell(dataIt(p.date)),
    cell(p.method || '-'),
    cell(pdfFmt(p.amount))
  ]);
}

function renderPriorBalancePdfSection(doc, autoTable, house, report, startY) {
  if (!report.priorBalance) return startY;
  const pb = report.priorBalance;
  const pres = priorBalancePresentation(pb.amount);
  let y = addSectionTitle(doc, startY, 'Conguaglio arrivato dall’anno precedente');
  autoTable(doc, {
    startY: y,
    head: [['Verso', 'Anno di origine', 'Descrizione', 'Importo']].map(row => row.map(cell)),
    body: [[
      cell(pres.label),
      cell(priorBalanceSourceLabel(house, pb)),
      cell(pb.description || 'Conguaglio anno precedente'),
      cell(pdfFmt(pb.amount))
    ]],
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [70, 110, 60] }
  });
  y = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(8);
  doc.text(
    // I versamenti che lo coprono stanno nel «Dettaglio versamenti» insieme a
    // tutti gli altri: erano in una tabella a parte, e i totali non tornavano.
    cell('Si somma a quello che devi versare quest’anno, senza cambiare le voci del preventivo. I versamenti che lo coprono sono nel Dettaglio versamenti.'),
    14,
    y + 2,
    { maxWidth: 182 }
  );
  return y + 12;
}

function renderVociEsercizioPdf(doc, autoTable, report, startY) {
  const { consuntivoDues } = report;
  if (!consuntivoDues.length) return startY;
  let y = addSectionTitle(doc, startY, 'Consuntivo: le spese dell’anno');
  const consBase = report.consuntivoTotal ?? 0;
  const rows = consuntivoDues.map(d => [cell(d.description || 'Voce'), cell(pdfFmt(d.amount))]);
  rows.push([cell('Totale consuntivo'), cell(pdfFmt(consBase))]);
  autoTable(doc, {
    startY: y,
    head: [['Voce di spesa', 'Importo']].map(row => row.map(cell)),
    body: rows,
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [80, 80, 80] },
    columnStyles: { 1: { halign: 'right' } }
  });
  return doc.lastAutoTable.finalY + 10;
}

/**
 * «Rate: previsto, effettivo e versato».
 *
 * La tabella che si mette a fianco del riparto dell'amministratore. Tre cifre
 * per ogni rata e nient'altro: quanto avevi deciso di versare (il preventivo),
 * quanto sarebbe stato con la spesa vera in mano (il consuntivo ripartito sulle
 * rate) e quanto è effettivamente arrivato. Lo stato dice il resto.
 *
 * La versione precedente mostrava un «Totale» per rata sempre uguale, che non
 * diceva niente, e un rigo «Pagato» che sommava le voci solo delle rate intere
 * ma il totale di tutti i versamenti: due criteri diversi nella stessa riga, e
 * infatti le cifre non tornavano fra loro.
 */
export function buildRatePlanTable(house, periodId) {
  const { slots } = installmentSummaryForPeriod(house, periodId);
  if (!slots.length) return null;

  const consuntivo = sumConsuntivoDue(house, periodId);
  const straordinari = sumStraordinariDue(house, periodId);
  const riportato = saldoRiportatoPdf(house, periodId);

  // Il consuntivo è una cifra sola per tutto l'anno: sulle rate si ripartisce in
  // parti uguali, e l'ultima si prende il resto degli arrotondamenti perché la
  // somma torni al centesimo.
  const quota = round2(consuntivo / slots.length);
  let resto = round2(consuntivo);

  const rows = slots.map((slot, i) => {
    const ultima = i === slots.length - 1;
    const effettivo = consuntivo > 0.005 ? (ultima ? resto : quota) : null;
    if (effettivo != null) resto = round2(resto - effettivo);
    const differenza = round2(slot.paid - slot.amountDue);
    return {
      numero: i + 1,
      nome: nomeRata(slot, i),
      scadenza: slot.periodEnd,
      preventivo: round2(slot.amountDue),
      consuntivo: effettivo,
      versato: round2(slot.paid),
      differenza,
      stato: statoRataPdf(slot.paid, slot.amountDue, differenza)
    };
  });

  const totali = {
    preventivo: round2(rows.reduce((s, r) => s + r.preventivo, 0)),
    consuntivo: consuntivo > 0.005 ? round2(consuntivo) : null,
    versato: round2(rows.reduce((s, r) => s + r.versato, 0))
  };

  return { rows, totali, consuntivo, straordinari, riportato };
}

/** Pagata, parziale o non pagata — confrontando il versato con la rata decisa. */
function statoRataPdf(versato, previsto, differenza) {
  // Senza ripetere la valuta: la tabella è già tutta in euro, e la colonna
  // dello stato deve stare su una riga sola per restare leggibile.
  const quanto = (n) => Math.abs(n).toFixed(2).replace('.', ',');
  if (Math.abs(differenza) <= 0.01) return 'Pagata';
  if (differenza > 0.01) return `Pagata, eccedenza ${quanto(differenza)}`;
  if (versato > 0.005) return `Parziale, mancano ${quanto(differenza)}`;
  return `Non pagata, mancano ${quanto(differenza)}`;
}

/** Il saldo arrivato dall'anno prima, positivo se a debito. */
function saldoRiportatoPdf(house, periodId) {
  const b = (house.priorBalances || []).find(x => String(x.fiscalPeriodId) === String(periodId));
  return round2(b?.amount || 0);
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Le righe che chiudono l'anno, sotto la tabella delle rate.
 *
 * Servono perché la differenza fra consuntivo e versato non è ancora il
 * conguaglio: in mezzo ci sono gli straordinari deliberati e il saldo che
 * arriva dall'anno prima. Scritte una sotto l'altra, la somma si legge.
 */
export function buildChiusuraRows(house, periodId, tabella) {
  const { totali, straordinari, riportato } = tabella;
  // Il versato è quello dell'anno intero, non solo la colonna della tabella:
  // i versamenti a copertura del conguaglio riducono il dovuto come gli altri,
  // e con due totali diversi nella stessa pagina non si capisce più quale vale.
  const versato = round2(sumPaid(house, periodId));
  const righe = [['Totale preventivo (rate decise)', totali.preventivo]];
  if (totali.consuntivo != null) righe.push(['Totale consuntivo (spesa accertata)', totali.consuntivo]);
  if (Math.abs(straordinari) > 0.005) righe.push(['Straordinari deliberati', straordinari]);
  if (Math.abs(riportato) > 0.005) {
    righe.push([riportato > 0 ? 'Saldo a debito dall’anno precedente' : 'Saldo a credito dall’anno precedente', riportato]);
  }
  const dovuto = totali.consuntivo != null
    ? round2(totali.consuntivo + straordinari + riportato)
    : round2(totali.preventivo + straordinari + riportato);
  if (righe.length > 2) righe.push(['Totale dovuto', dovuto]);
  righe.push(['Totale versato nell’anno', versato]);

  const differenza = round2(dovuto - versato);
  const verso = Math.abs(differenza) <= 0.005 ? 'in pari' : differenza > 0 ? 'a debito' : 'a credito';
  const etichetta = totali.consuntivo != null
    ? `Conguaglio dell’anno: ${verso}`
    : `Ancora da versare sul preventivo: ${verso}`;
  righe.push([etichetta, Math.abs(differenza)]);
  return { righe, differenza, verso };
}

function renderRatePlanPdf(doc, autoTable, house, report, startY) {
  const tabella = buildRatePlanTable(house, report.period.id);
  if (!tabella) return startY;
  const { rows, totali } = tabella;

  let y = addSectionTitle(doc, startY, 'Rate: previsto, effettivo e versato');
  doc.setFontSize(8);
  doc.text(
    cell(totali.consuntivo != null
      ? 'La colonna Preventivo è la rata come l’hai decisa; Consuntivo è la spesa accertata dell’anno, ripartita in parti uguali sulle rate.'
      : 'La colonna Preventivo è la rata come l’hai decisa. Il consuntivo dell’anno non è ancora stato registrato.'),
    14, y, { maxWidth: 182 }
  );
  y += 6;

  const body = rows.map(r => [
    cell(`Rata ${r.numero}`),
    cell(dataIt(r.scadenza)),
    cell(pdfFmt(r.preventivo)),
    cell(r.consuntivo != null ? pdfFmt(r.consuntivo) : '-'),
    cell(pdfFmt(r.versato)),
    cell(r.stato)
  ]);
  body.push([
    cell('Totale'), '',
    cell(pdfFmt(totali.preventivo)),
    cell(totali.consuntivo != null ? pdfFmt(totali.consuntivo) : '-'),
    cell(pdfFmt(totali.versato)),
    ''
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Rata', 'Scadenza', 'Preventivo', 'Consuntivo', 'Versato', 'Stato']].map(row => row.map(cell)),
    body,
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [45, 85, 135] },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 24 },
      2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 52 }
    },
    didParseCell: data => {
      if (data.section === 'body' && data.row.index === body.length - 1) data.cell.styles.fontStyle = 'bold';
    }
  });
  y = doc.lastAutoTable.finalY + 8;

  const { righe } = buildChiusuraRows(house, report.period.id, tabella);
  y = addSectionTitle(doc, y, 'Come si chiude l’anno');
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: righe.map(([etichetta, importo]) => [cell(etichetta), cell(pdfFmt(importo))]),
    styles: { ...PDF_TABLE.styles, fontSize: 9 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: 'right' } },
    didParseCell: data => {
      if (data.section === 'body' && data.row.index === righe.length - 1) data.cell.styles.fontStyle = 'bold';
    }
  });
  return doc.lastAutoTable.finalY + 10;
}

/**
 * Le quattro cifre che aprono il resoconto.
 *
 * Prima c'erano «Totale esercizio», «Totale da versare» e «Saldo su totale da
 * versare», tre voci che si assomigliano e che nessuno sa distinguere a colpo
 * d'occhio. Qui ci sono solo le cifre che hanno un nome nella vita vera:
 * quanto era previsto, quanto si è speso davvero, quanto è arrivato e quanto
 * resta da regolare.
 */
export function buildRiepilogoRows(house, report) {
  const periodId = report.period.id;
  const preventivo = sumOrdinarioDue(house, periodId);
  const straordinari = sumStraordinariDue(house, periodId);
  const consuntivo = sumConsuntivoDue(house, periodId);
  const riportato = saldoRiportatoPdf(house, periodId);
  const versato = sumPaid(house, periodId);

  const righe = [['Preventivo dell’anno', preventivo]];
  if (Math.abs(straordinari) > 0.005) righe.push(['Straordinari deliberati', straordinari]);
  if (Math.abs(riportato) > 0.005) {
    righe.push([riportato > 0 ? 'Conguaglio a debito dall’anno precedente' : 'Conguaglio a credito dall’anno precedente', riportato]);
  }
  if (consuntivo > 0.005) righe.push(['Consuntivo (spesa accertata)', consuntivo]);
  righe.push(['Versato nell’anno', versato]);

  const cong = computeConguaglio(house, periodId);
  if (cong) {
    const verso = cong.direction === 'pari' ? 'in pari' : cong.direction === 'debito' ? 'a debito' : 'a credito';
    righe.push([`Conguaglio dell’anno: ${verso}`, Math.abs(cong.amount)]);
  } else {
    const resta = round2(preventivo + straordinari + riportato - versato);
    righe.push([resta > 0.005 ? 'Ancora da versare sul preventivo' : 'Versato in eccedenza sul preventivo', Math.abs(resta)]);
  }
  return righe;
}

/**
 * Tutti i versamenti dell'anno in un elenco solo, conguagli compresi.
 *
 * Prima quelli a copertura del saldo dell'anno prima stavano in una tabella a
 * parte: il «Dettaglio versamenti» ne mostrava meno del totale versato, e chi
 * lo leggeva non ritrovava le cifre.
 */
function renderRateDetailPdf(doc, autoTable, house, report, startY) {
  const payments = [...(report.exercisePayments || []), ...(report.priorBalancePayments || [])];
  if (!payments.length) return startY;
  let y = addSectionTitle(doc, startY, 'Dettaglio versamenti');
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const sorted = [...payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rows = paymentPdfRows(house, report, sorted);
  rows.push([cell('Totale versato'), '', '', cell(pdfFmt(total))]);
  autoTable(doc, {
    startY: y,
    head: [['A copertura di', 'Data', 'Metodo', 'Importo']].map(row => row.map(cell)),
    body: rows,
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [45, 85, 135] }
  });
  return doc.lastAutoTable.finalY + 10;
}

function renderSituazionePdf(doc, autoTable, report, house) {
  let y = renderPdfHeader(doc, house, report.period, 'Situazione esercizio - spese condominiali');
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: buildRiepilogoRows(house, report).map(([etichetta, importo]) => [cell(etichetta), cell(pdfFmt(importo))]),
    styles: { ...PDF_TABLE.styles, fontSize: 9 },
    headStyles: PDF_TABLE.headStyles,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 105 }, 1: { cellWidth: 65, halign: 'right' } }
  });
  y = doc.lastAutoTable.finalY + 10;

  y = renderPriorBalancePdfSection(doc, autoTable, house, report, y);
  y = renderVociEsercizioPdf(doc, autoTable, report, y);
  y = renderRatePlanPdf(doc, autoTable, house, report, y);
  y = renderRateDetailPdf(doc, autoTable, house, report, y);

  if (report.carryDues.length) {
    y = addSectionTitle(doc, y, 'Riporti dentro il preventivo');
    autoTable(doc, {
      startY: y,
      head: [['Descrizione', 'Da esercizio', 'Importo']].map(row => row.map(cell)),
      body: report.carryDues.map(d => [
        cell(d.description || 'Riporto'),
        cell(carryFromLabel(house, d)),
        cell(pdfFmt(d.amount))
      ]),
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [100, 70, 20] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (report.unlinkedPayments.length) {
    y = addSectionTitle(doc, y, 'Versamenti non assegnati a una rata');
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Metodo', 'Importo']].map(row => row.map(cell)),
      body: report.unlinkedPayments.map(p => [
        cell(dataIt(p.date)),
        cell(p.method || '-'),
        cell(pdfFmt(p.amount))
      ]),
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [120, 50, 50] }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  doc.setFontSize(8);
  doc.text(
    cell('Conguaglio dell’anno = consuntivo + straordinari + conguaglio dall’anno precedente − versato.'),
    14,
    Math.min(y + 4, 285),
    { maxWidth: 180 }
  );
}

export async function exportSituazionePdf(house, fiscalPeriodId) {
  const report = buildSituazioneReport(house, fiscalPeriodId);
  report.house = house;
  const { period } = report;
  if (!period) throw new Error('Seleziona un esercizio fiscale.');

  const hasData = hasConsuntivoReport(report) || hasPreventivoReport(report) || hasPriorBalanceReport(report);
  if (!hasData) throw new Error('Nessun dovuto, consuntivo o saldo precedente per questo esercizio.');

  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  renderSituazionePdf(doc, autoTable, report, house);

  const safeName = `${house.name}-${period.label}`.replace(/[^\w\-]+/g, '_');
  doc.save(`situazione-${safeName}.pdf`);
}
