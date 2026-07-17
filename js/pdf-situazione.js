import {
  buildSituazioneReport,
  carryFromLabel,
  hasConsuntivoReport,
  hasPreventivoReport,
  hasPriorBalanceReport,
  priorBalancePresentation,
  priorBalanceSourceLabel,
  computeSituazioneTotals
} from './situazione-report.js';
import { installmentShortLabel, inferInstallmentKey } from './installments.js';
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

function paymentPdfRows(house, payments) {
  return payments.map(p => {
    const key = p.installmentKey || inferInstallmentKey(house, p);
    const rata = key ? installmentShortLabel(house, key) : '—';
    return [
      cell(rata),
      cell(p.date || '—'),
      cell(p.method || '—'),
      cell(pdfFmt(p.amount))
    ];
  });
}

function renderPriorBalancePdfSection(doc, autoTable, house, report, startY) {
  if (!report.priorBalance) return startY;
  const pb = report.priorBalance;
  const pres = priorBalancePresentation(pb.amount);
  let y = addSectionTitle(doc, startY, 'Saldi anno precedente');
  autoTable(doc, {
    startY: y,
    head: [['Tipo', 'Da esercizio', 'Descrizione', 'Importo']].map(row => row.map(cell)),
    body: [[
      cell(pres.label),
      cell(priorBalanceSourceLabel(house, pb)),
      cell(pb.description || 'Saldo precedente'),
      cell(pdfFmt(pb.amount))
    ]],
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [70, 110, 60] }
  });
  y = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(8);
  doc.text(
    cell('Voce di apertura esercizio: non modifica le voci iniziali; si somma al totale da versare.'),
    14,
    y + 2,
    { maxWidth: 180 }
  );
  y += 8;

  const payments = report.priorBalancePayments || [];
  if (payments.length) {
    y = addSectionTitle(doc, y, 'Versamenti a copertura saldo precedente');
    const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const rows = [...payments]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map(p => [cell(p.date || '—'), cell(p.method || '—'), cell(pdfFmt(p.amount))]);
    rows.push([cell('Totale versato'), '', cell(pdfFmt(total))]);
    autoTable(doc, {
      startY: y,
      head: [['Data vers.', 'Metodo', 'Importo']].map(row => row.map(cell)),
      body: rows,
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [70, 110, 60] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  return y;
}

function renderVociEsercizioPdf(doc, autoTable, report, startY) {
  const { consuntivoDues } = report;
  if (!consuntivoDues.length) return startY;
  let y = addSectionTitle(doc, startY, 'Voci esercizio');
  const consBase = report.consuntivoTotal ?? 0;
  const rows = consuntivoDues.map(d => [cell(d.description || 'Voce'), cell(pdfFmt(d.amount))]);
  rows.push([cell('Totale voci'), cell(pdfFmt(consBase))]);
  autoTable(doc, {
    startY: y,
    head: [['Descrizione', 'Importo']].map(row => row.map(cell)),
    body: rows,
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [80, 80, 80] }
  });
  return doc.lastAutoTable.finalY + 10;
}

function renderRateDetailPdf(doc, autoTable, house, report, startY) {
  const payments = report.exercisePayments || [];
  if (!payments.length) return startY;
  let y = addSectionTitle(doc, startY, 'Dettaglio versamenti');
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const sorted = [...payments].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rows = paymentPdfRows(house, sorted);
  rows.push([cell('Totale versato'), '', '', cell(pdfFmt(total))]);
  autoTable(doc, {
    startY: y,
    head: [['Rata', 'Data vers.', 'Metodo', 'Importo']].map(row => row.map(cell)),
    body: rows,
    ...PDF_TABLE,
    headStyles: { ...PDF_TABLE.headStyles, fillColor: [45, 85, 135] }
  });
  return doc.lastAutoTable.finalY + 10;
}

function renderSituazionePdf(doc, autoTable, report, totalsRow, house) {
  let y = renderPdfHeader(doc, house, report.period, 'Situazione esercizio - spese condominiali');
  const t = computeSituazioneTotals(report, totalsRow);
  const congPres = t.hasPrior ? priorBalancePresentation(t.conguaglio) : null;

  const summaryBody = [
    [cell('Totale esercizio'), cell(pdfFmt(t.totaleEsercizio))],
    [cell(`Conguaglio anno precedente${congPres ? ` (${congPres.label})` : ''}`), cell(pdfFmt(t.conguaglio))],
    [cell('Totale da versare'), cell(pdfFmt(t.totaleDaVersare))],
    [cell('Totale versato'), cell(pdfFmt(t.totaleVersato))],
    [cell(`Saldo su totale da versare (${t.saldoLabel})`), cell(pdfFmt(t.saldo))]
  ];

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: summaryBody,
    styles: { ...PDF_TABLE.styles, fontSize: 9 },
    headStyles: PDF_TABLE.headStyles,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 105 }, 1: { cellWidth: 65 } }
  });
  y = doc.lastAutoTable.finalY + 10;

  y = renderPriorBalancePdfSection(doc, autoTable, house, report, y);
  y = renderVociEsercizioPdf(doc, autoTable, report, y);
  y = renderRateDetailPdf(doc, autoTable, house, report, y);

  if (report.carryDues.length) {
    y = addSectionTitle(doc, y, 'Riporti su preventivo');
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
    y = addSectionTitle(doc, y, 'Versamenti senza rata assegnata');
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Metodo', 'Importo']].map(row => row.map(cell)),
      body: report.unlinkedPayments.map(p => [
        cell(p.date || '-'),
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
    cell('Saldo = versato − totale da versare (esercizio + eventuale conguaglio anno precedente).'),
    14,
    Math.min(y + 4, 285),
    { maxWidth: 180 }
  );
}

export async function exportSituazionePdf(house, fiscalPeriodId) {
  const report = buildSituazioneReport(house, fiscalPeriodId);
  report.house = house;
  const { period, totalsRow } = report;
  if (!period) throw new Error('Seleziona un esercizio fiscale.');

  const hasData = hasConsuntivoReport(report) || hasPreventivoReport(report) || hasPriorBalanceReport(report);
  if (!hasData) throw new Error('Nessun dovuto, consuntivo o saldo precedente per questo esercizio.');

  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  renderSituazionePdf(doc, autoTable, report, totalsRow, house);

  const safeName = `${house.name}-${period.label}`.replace(/[^\w\-]+/g, '_');
  doc.save(`situazione-${safeName}.pdf`);
}
