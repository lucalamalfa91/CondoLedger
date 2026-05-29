import {
  buildSituazioneReport,
  carryFromLabel,
  resolveSituazionePdfKind,
  situazioneStatusLabel
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
      cell(p.date || '—'),
      cell(p.method || '—'),
      cell(rata),
      cell(pdfFmt(p.amount))
    ];
  });
}

function renderPreventivoPdf(doc, autoTable, report, totalsRow) {
  const house = report.house;
  let y = renderPdfHeader(doc, house, report.period, 'Situazione preventiva - spese condominiali');
  const prevStatus = situazioneStatusLabel(totalsRow?.balancePreventivo ?? 0);
  const slotsStatus = situazioneStatusLabel(report.slotsBalance ?? 0);

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      [cell('Preventivo (totale voci)'), cell(pdfFmt(totalsRow?.preventivo ?? 0))],
      [cell('Totale versato'), cell(pdfFmt(totalsRow?.paid ?? 0))],
      [cell('Saldo su rate preventivo'), cell(pdfFmt(report.slotsBalance))],
      [cell('Saldo su preventivo (versato - preventivo)'), cell(`${pdfFmt(totalsRow?.balancePreventivo ?? 0)} - ${prevStatus.text}`)],
      [cell('Saldo rate (versato - dovuto rate)'), cell(`${pdfFmt(report.slotsBalance)} - ${slotsStatus.text}`)]
    ],
    styles: { ...PDF_TABLE.styles, fontSize: 9 },
    headStyles: PDF_TABLE.headStyles,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95 }, 1: { cellWidth: 75 } }
  });
  y = doc.lastAutoTable.finalY + 10;

  const { slots } = report;
  if (slots.length) {
    y = addSectionTitle(doc, y, 'Preventivo - dettaglio rate');
    const rateBody = [];
    for (const slot of slots) {
      rateBody.push([
        cell(slot.label),
        cell(slot.dueDescription || '-'),
        cell(pdfFmt(slot.amountDue)),
        cell(pdfFmt(slot.paid)),
        cell(pdfFmt(slot.balance))
      ]);
      for (const pay of slot.payments) {
        rateBody.push([
          cell(`  > vers. ${pay.date || '-'}`),
          cell(pay.method || '-'),
          '',
          cell(pdfFmt(pay.amount)),
          cell(pay.isCarryForward ? 'Riporto' : '')
        ]);
      }
    }
    rateBody.push([
      cell('Totale rate'),
      '',
      cell(pdfFmt(report.slotsTotalDue)),
      cell(pdfFmt(report.slotsTotalPaid)),
      cell(pdfFmt(report.slotsBalance))
    ]);
    autoTable(doc, {
      startY: y,
      head: [['Rata', 'Voce preventivo', 'Dovuto', 'Versato', 'Saldo']].map(row => row.map(cell)),
      body: rateBody,
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [45, 85, 135] }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

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
    cell('Report preventivo: rate e saldi su preventivo. Saldo preventivo = versato - totale voci preventivo.'),
    14,
    Math.min(y + 4, 285),
    { maxWidth: 180 }
  );
}

function renderConsuntivoPdf(doc, autoTable, report, totalsRow) {
  const house = report.house;
  let y = renderPdfHeader(doc, house, report.period, 'Situazione consuntiva - spese condominiali');
  const consStatus = situazioneStatusLabel(totalsRow?.balanceConsuntivo ?? 0);

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      [cell('Consuntivo (totale voci)'), cell(pdfFmt(totalsRow?.consuntivo ?? 0))],
      [cell('Totale versato'), cell(pdfFmt(totalsRow?.paid ?? 0))],
      [cell('Saldo consuntivo (versato - consuntivo)'), cell(`${pdfFmt(totalsRow?.balanceConsuntivo ?? 0)} - ${consStatus.text}`)]
    ],
    styles: { ...PDF_TABLE.styles, fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95 }, 1: { cellWidth: 75 } }
  });
  y = doc.lastAutoTable.finalY + 10;

  const { consuntivoDues } = report;
  if (consuntivoDues.length) {
    y = addSectionTitle(doc, y, 'Consuntivo - voci');
    autoTable(doc, {
      startY: y,
      head: [['Descrizione', 'Importo']].map(row => row.map(cell)),
      body: consuntivoDues.map(d => [cell(d.description || 'Consuntivo'), cell(pdfFmt(d.amount))]),
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [80, 80, 80] }
    });
    y = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(9);
    doc.text(
      cell(`Totale consuntivo: ${pdfFmt(report.consuntivoTotal)} | Versato esercizio: ${pdfFmt(report.paidTotal)} | Saldo: ${pdfFmt(totalsRow?.balanceConsuntivo ?? 0)}`),
      14,
      y + 4
    );
    y += 14;
  }

  if (report.periodPayments.length) {
    y = addSectionTitle(doc, y, 'Versamenti esercizio (contano sul consuntivo)');
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Metodo', 'Rata preventivo', 'Importo']].map(row => row.map(cell)),
      body: paymentPdfRows(house, report.periodPayments),
      ...PDF_TABLE,
      headStyles: { ...PDF_TABLE.headStyles, fillColor: [45, 85, 135] }
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
    cell('Report consuntivo: saldo = versato - consuntivo. I versamenti restano sulle rate preventivo; contano anche sul consuntivo dell\'esercizio.'),
    14,
    Math.min(y + 4, 285),
    { maxWidth: 180 }
  );
}

export async function exportSituazionePdf(house, fiscalPeriodId, requestedKind) {
  const report = buildSituazioneReport(house, fiscalPeriodId);
  report.house = house;
  const { period, totalsRow } = report;
  if (!period) throw new Error('Seleziona un esercizio fiscale.');

  const kind = resolveSituazionePdfKind(report, requestedKind);
  if (!kind) throw new Error('Nessun preventivo o consuntivo per questo esercizio.');

  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  if (kind === 'consuntivo') renderConsuntivoPdf(doc, autoTable, report, totalsRow);
  else renderPreventivoPdf(doc, autoTable, report, totalsRow);

  const safeName = `${house.name}-${period.label}-${kind}`.replace(/[^\w\-]+/g, '_');
  doc.save(`situazione-${safeName}.pdf`);
}
