'use strict';

const ApiError = require('./ApiError');
const logger = require('./logger');
const {
  OBS_COLORS, OBS_LABELS, DEFAULT_TOOTH_COLOR, buildToothMap,
} = require('./dentalChartUtils');

let PDFDocument = null;
try {
  PDFDocument = require('pdfkit');
} catch {
  logger.warn('pdfkit not installed — dental scan PDF generation unavailable');
}

const CONFIDENCE_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
const TEAL = '#14b8a6';

/**
 * Draw a simple teal medical-cross badge icon.
 */
function _drawLogoBadge(doc, x, y, size) {
  const crossW = Math.round(size * 0.18);
  const crossLen = Math.round(size * 0.55);
  const cx = x + size / 2;
  const cy = y + size / 2;

  // Teal rounded square
  doc.roundedRect(x, y, size, size, size * 0.18).fill(TEAL);

  // White medical cross
  doc.rect(cx - crossLen / 2, cy - crossW / 2, crossLen, crossW).fill('#ffffff');
  doc.rect(cx - crossW / 2, cy - crossLen / 2, crossW, crossLen).fill('#ffffff');
}

/**
 * Draw a single tooth cell — supports multiple stacked color bands for
 * teeth with more than one observation type.
 */
function _drawToothCell(doc, x, y, toothW, toothH, toothNum, entries) {
  const hasFindings = entries && entries.length > 0;

  if (!hasFindings) {
    doc.roundedRect(x, y, toothW, toothH, 3).fill(DEFAULT_TOOTH_COLOR);
    doc.roundedRect(x, y, toothW, toothH, 3).lineWidth(0.5).stroke('#94a3b8');
    doc.fillOpacity(1);
    doc.fontSize(6).font('Helvetica').fillColor('#475569')
      .text(String(toothNum), x, y + toothH / 2 - 4, { width: toothW, align: 'center' });
    return;
  }

  // Draw stacked color bands clipped to rounded rect
  const bandH = toothH / entries.length;
  doc.save();
  doc.roundedRect(x, y, toothW, toothH, 3).clip();
  for (let j = 0; j < entries.length; j++) {
    doc.fillOpacity(entries[j].opacity);
    doc.rect(x, y + j * bandH, toothW, bandH).fill(entries[j].color);
  }
  doc.restore();
  doc.fillOpacity(1);

  // Border
  doc.roundedRect(x, y, toothW, toothH, 3).lineWidth(0.5).stroke('#94a3b8');

  // Tooth number (white on colored background)
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#ffffff')
    .text(String(toothNum), x, y + toothH / 2 - 4, { width: toothW, align: 'center' });

  // Multi-finding count badge
  if (entries.length > 1) {
    const badgeR = 4;
    const bx = x + toothW - 3;
    const by = y + 3;
    doc.circle(bx, by, badgeR).fill('#1e293b');
    doc.fontSize(5).font('Helvetica-Bold').fillColor('#ffffff')
      .text(String(entries.length), bx - badgeR, by - 3, { width: badgeR * 2, align: 'center' });
  }
}

// FDI tooth arrays for chart layout (left-to-right as viewed)
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function _drawDentalChart(doc, observations, startY) {
  const TOOTH_W = 26;
  const TOOTH_H = 26;
  const GAP = 2;
  const ROW_W = 16 * (TOOTH_W + GAP) - GAP;
  const LEFT = (doc.page.width - ROW_W) / 2;

  const toothMap = buildToothMap(observations);

  // Section header
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
    .text('Dental Chart (FDI)', 50, startY, { width: doc.page.width - 100, align: 'center' });

  const chartY = startY + 20;

  // Quadrant labels
  const q1x = LEFT + 7 * (TOOTH_W + GAP) / 2;
  const q2x = LEFT + 8 * (TOOTH_W + GAP) + 7 * (TOOTH_W + GAP) / 2;
  doc.fontSize(6).font('Helvetica').fillColor('#94a3b8');
  doc.text('Q1 (UR)', LEFT, chartY - 10, { width: 8 * (TOOTH_W + GAP), align: 'center' });
  doc.text('Q2 (UL)', LEFT + 8 * (TOOTH_W + GAP), chartY - 10, { width: 8 * (TOOTH_W + GAP), align: 'center' });

  // Upper arch: FDI 18→11 | 21→28
  for (let i = 0; i < 16; i++) {
    const toothNum = UPPER_TEETH[i];
    const x = LEFT + i * (TOOTH_W + GAP);
    _drawToothCell(doc, x, chartY, TOOTH_W, TOOTH_H, toothNum, toothMap[toothNum]);
  }

  // Midline between tooth 8 and 9 (position 11 and 21)
  const midX = LEFT + 8 * (TOOTH_W + GAP) - GAP / 2;
  doc.moveTo(midX, chartY - 2).lineTo(midX, chartY + TOOTH_H + 2)
    .lineWidth(1).strokeColor(TEAL).stroke();

  // Separator line
  const sepY = chartY + TOOTH_H + 4;
  doc.fillOpacity(1);
  doc.moveTo(LEFT, sepY).lineTo(LEFT + ROW_W, sepY)
    .lineWidth(0.5).strokeColor('#cbd5e1').stroke();

  // Lower arch quadrant labels
  const lowerY = sepY + 4;
  doc.fontSize(6).font('Helvetica').fillColor('#94a3b8');
  doc.text('Q4 (LR)', LEFT, lowerY + TOOTH_H + 3, { width: 8 * (TOOTH_W + GAP), align: 'center' });
  doc.text('Q3 (LL)', LEFT + 8 * (TOOTH_W + GAP), lowerY + TOOTH_H + 3, { width: 8 * (TOOTH_W + GAP), align: 'center' });

  // Lower arch: FDI 48→41 | 31→38
  for (let i = 0; i < 16; i++) {
    const toothNum = LOWER_TEETH[i];
    const x = LEFT + i * (TOOTH_W + GAP);
    _drawToothCell(doc, x, lowerY, TOOTH_W, TOOTH_H, toothNum, toothMap[toothNum]);
  }

  // Lower midline
  doc.moveTo(midX, lowerY - 2).lineTo(midX, lowerY + TOOTH_H + 2)
    .lineWidth(1).strokeColor(TEAL).stroke();

  // Legend — dynamic spacing centered
  const legendY = lowerY + TOOTH_H + 12;
  const usedTypes = new Set((observations || []).map((o) => o.type));
  const legendItems = Object.entries(OBS_COLORS).filter(([t]) => usedTypes.has(t));

  if (legendItems.length > 0) {
    const DOT_R = 3.5;
    const DOT_TEXT_GAP = 5;
    const ITEM_GAP = 14;

    doc.fontSize(7).font('Helvetica');
    const itemWidths = legendItems.map(([type]) => {
      const label = OBS_LABELS[type] || type;
      return DOT_R * 2 + DOT_TEXT_GAP + doc.widthOfString(label);
    });
    const totalWidth = itemWidths.reduce((s, w) => s + w, 0) + ITEM_GAP * (legendItems.length - 1);

    let lx = (doc.page.width - totalWidth) / 2;
    for (let i = 0; i < legendItems.length; i++) {
      const [type, color] = legendItems[i];
      doc.fillOpacity(1);
      doc.circle(lx + DOT_R, legendY + DOT_R, DOT_R).fill(color);
      doc.fontSize(7).font('Helvetica').fillColor('#475569')
        .text(OBS_LABELS[type] || type, lx + DOT_R * 2 + DOT_TEXT_GAP, legendY, { lineBreak: false });
      lx += itemWidths[i] + ITEM_GAP;
    }
  }

  return legendY + 16;
}

/**
 * Generate a dental scan PDF report buffer.
 * @param {object} scan - GuestScan document with result, lead, images
 * @param {string} reportId - Report identifier
 * @returns {Promise<Buffer>}
 */
async function generateDentalScanReport(scan, reportId) {
  if (!PDFDocument) {
    throw ApiError.serviceUnavailable('PDF generation unavailable — pdfkit not installed');
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const result = scan.result || {};
    const lead = scan.lead || {};
    const observations = result.observations || [];
    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;

    // ═══ HEADER WITH LOGO ═══
    const headerY = 40;
    const logoSize = 28;
    _drawLogoBadge(doc, margin, headerY, logoSize);

    // Brand name next to logo
    doc.fontSize(22).font('Helvetica-Bold').fillColor(TEAL)
      .text('BestoClinic', margin + logoSize + 10, headerY + 2, { lineBreak: false });

    // Subtitle
    doc.fontSize(10).font('Helvetica').fillColor('#64748b')
      .text('AI Dental Scan Report', margin + logoSize + 10, headerY + 26, { lineBreak: false });

    // Report meta (right-aligned)
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
      .text(`Report: ${reportId}`, pageWidth - margin - 130, headerY + 6, { width: 130, align: 'right' })
      .text(
        new Date(scan.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' }),
        pageWidth - margin - 130, headerY + 18, { width: 130, align: 'right' },
      );

    // Teal accent line
    const lineY = headerY + logoSize + 10;
    doc.moveTo(margin, lineY).lineTo(pageWidth - margin, lineY)
      .lineWidth(2).strokeColor(TEAL).stroke();
    doc.y = lineY + 14;

    // ═══ PATIENT INFO ═══
    const infoY = doc.y;
    const infoH = 52;
    doc.roundedRect(margin, infoY, contentWidth, infoH, 4).fill('#f8fafc');
    doc.roundedRect(margin, infoY, contentWidth, infoH, 4).lineWidth(0.5).stroke('#e2e8f0');

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b')
      .text('Patient Details', margin + 12, infoY + 8, { lineBreak: false });

    const col1X = margin + 12;
    const col2X = margin + contentWidth / 2 + 12;
    doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
    doc.text(`Name: ${lead.name || 'N/A'}`, col1X, infoY + 24, { lineBreak: false });
    doc.text(`Phone: ${lead.phone || 'N/A'}`, col1X, infoY + 37, { lineBreak: false });
    doc.text(`Email: ${lead.email || 'N/A'}`, col2X, infoY + 24, { lineBreak: false });
    doc.text(
      `Scan Date: ${new Date(scan.createdAt).toLocaleDateString('en-IN')}`,
      col2X, infoY + 37, { lineBreak: false },
    );

    doc.y = infoY + infoH + 14;

    // ═══ AI SUMMARY ═══
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
      .text('AI Analysis Summary', margin);
    doc.moveDown(0.3);

    const summaryY = doc.y;
    const summaryText = result.overallSummary || 'No summary available.';
    const summaryHeight = doc.heightOfString(summaryText, { width: contentWidth - 24 }) + 16;

    doc.roundedRect(margin, summaryY, contentWidth, summaryHeight, 4).fill('#f0fdf4');
    doc.roundedRect(margin, summaryY, contentWidth, summaryHeight, 4)
      .lineWidth(0.5).stroke('#bbf7d0');

    doc.fontSize(9).font('Helvetica').fillColor('#166534')
      .text(summaryText, margin + 12, summaryY + 8, { width: contentWidth - 24 });
    doc.y = summaryY + summaryHeight + 14;

    // ═══ HEALTH SCORE ═══
    const healthScore = result.healthScore;
    if (healthScore && healthScore.overall != null) {
      const scoreY = doc.y;
      const scoreBoxH = 60;

      // Score label color
      const scoreColor = healthScore.overall >= 90 ? '#059669'
        : healthScore.overall >= 75 ? '#2563eb'
        : healthScore.overall >= 60 ? '#d97706'
        : healthScore.overall >= 40 ? '#ea580c'
        : '#dc2626';

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Oral Health Score', margin, scoreY, { width: contentWidth, align: 'center' });

      const badgeY = scoreY + 18;

      // Overall score badge
      const badgeCx = margin + contentWidth / 2;
      doc.circle(badgeCx, badgeY + 18, 22).fill(scoreColor);
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
        .text(String(healthScore.overall), badgeCx - 22, badgeY + 10, { width: 44, align: 'center' });
      doc.fontSize(7).font('Helvetica').fillColor(scoreColor)
        .text(healthScore.label, badgeCx - 40, badgeY + 42, { width: 80, align: 'center' });

      // Sub-score bars (side by side)
      const barY = badgeY + 56;
      const barW = 80;
      const barH = 6;
      const barGap = (contentWidth - 4 * barW) / 5;
      const subcats = [
        { label: 'Teeth', value: healthScore.teeth },
        { label: 'Gums', value: healthScore.gums },
        { label: 'Alignment', value: healthScore.alignment },
        { label: 'Hygiene', value: healthScore.hygiene },
      ];

      for (let i = 0; i < subcats.length; i++) {
        const bx = margin + barGap + i * (barW + barGap);
        const { label, value } = subcats[i];
        const barColor = value >= 90 ? '#059669' : value >= 75 ? '#2563eb' : value >= 60 ? '#d97706' : value >= 40 ? '#ea580c' : '#dc2626';

        doc.fontSize(7).font('Helvetica').fillColor('#475569')
          .text(label, bx, barY, { width: barW, align: 'center' });
        // Background bar
        doc.roundedRect(bx, barY + 10, barW, barH, 3).fill('#e5e7eb');
        // Filled bar
        const fillW = Math.max(2, barW * value / 100);
        doc.roundedRect(bx, barY + 10, fillW, barH, 3).fill(barColor);
        // Value label
        doc.fontSize(7).font('Helvetica-Bold').fillColor(barColor)
          .text(String(value), bx, barY + 19, { width: barW, align: 'center' });
      }

      doc.y = barY + 32;
    }

    // ═══ DENTAL CHART ═══
    const afterChart = _drawDentalChart(doc, observations, doc.y);
    doc.y = afterChart + 10;

    // ═══ OBSERVATIONS TABLE ═══
    if (observations.length > 0) {
      if (doc.y > doc.page.height - 150) doc.addPage();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Detailed Findings', margin);
      doc.moveDown(0.3);

      const tableLeft = margin;
      const colWidths = [90, 72, 50, 58, contentWidth - 90 - 72 - 50 - 58];
      const headers = ['Finding', 'Area', 'Teeth', 'Confidence', 'Description'];

      // Header row
      const hdrY = doc.y;
      doc.roundedRect(tableLeft, hdrY, contentWidth, 20, 2).fill(TEAL);

      let tx = tableLeft;
      for (let i = 0; i < headers.length; i++) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff')
          .text(headers[i], tx + 6, hdrY + 5, { width: colWidths[i] - 12, lineBreak: false });
        tx += colWidths[i];
      }
      doc.y = hdrY + 22;

      // Data rows
      for (let r = 0; r < observations.length; r++) {
        const obs = observations[r];

        // Page break check
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          doc.y = 50;
        }

        const rowData = [
          OBS_LABELS[obs.type] || obs.type,
          obs.area || '\u2014',
          (obs.toothNumbers || []).join(', ') || '\u2014',
          CONFIDENCE_LABELS[obs.confidence] || obs.confidence,
          obs.description || '\u2014',
        ];

        // Calculate row height based on tallest cell
        doc.fontSize(8).font('Helvetica');
        let maxCellH = 0;
        for (let i = 0; i < rowData.length; i++) {
          const h = doc.heightOfString(rowData[i], { width: colWidths[i] - 12 });
          if (h > maxCellH) maxCellH = h;
        }
        const rowHeight = Math.max(20, maxCellH + 10);

        // *** FIX: save Y before drawing — use this for ALL cells ***
        const rowY = doc.y;
        const rowBg = r % 2 === 0 ? '#f8fafc' : '#ffffff';

        // Row background
        doc.rect(tableLeft, rowY, contentWidth, rowHeight).fill(rowBg);

        // Row bottom border
        doc.moveTo(tableLeft, rowY + rowHeight)
          .lineTo(tableLeft + contentWidth, rowY + rowHeight)
          .lineWidth(0.3).strokeColor('#e2e8f0').stroke();

        // Cell text — all rendered at the same rowY + 5 (no staircase)
        tx = tableLeft;
        for (let i = 0; i < rowData.length; i++) {
          doc.fontSize(8).font('Helvetica').fillColor('#334155')
            .text(rowData[i], tx + 6, rowY + 5, { width: colWidths[i] - 12 });
          tx += colWidths[i];
        }

        // Manually advance Y past the row
        doc.y = rowY + rowHeight;
      }
      doc.moveDown(0.6);
    }

    // ═══ RECOMMENDED SPECIALISTS ═══
    const specs = result.recommendedSpecs || [];
    if (specs.length > 0) {
      if (doc.y > doc.page.height - 100) doc.addPage();

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
        .text('Recommended Specialists', margin);
      doc.moveDown(0.2);
      for (const spec of specs) {
        doc.fontSize(9).font('Helvetica').fillColor('#475569')
          .text(`  \u2022  ${spec}`, margin);
      }
      doc.moveDown(0.6);
    }

    // ═══ DISCLAIMER ═══
    if (doc.y > doc.page.height - 80) doc.addPage();

    const disclaimerText = result.disclaimer ||
      'This is a preliminary AI assessment only. It is not a substitute for professional dental examination, diagnosis, or treatment. Always seek the advice of a qualified dentist with any questions regarding dental conditions.';

    const disclaimerY = doc.y;
    doc.fontSize(7.5).font('Helvetica-Oblique');
    const disclaimerH = doc.heightOfString(disclaimerText, { width: contentWidth - 24 }) + 26;

    doc.roundedRect(margin, disclaimerY, contentWidth, disclaimerH, 4).fill('#fefce8');
    doc.roundedRect(margin, disclaimerY, contentWidth, disclaimerH, 4)
      .lineWidth(0.5).stroke('#fde68a');

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#92400e')
      .text('Disclaimer', margin + 12, disclaimerY + 7, { lineBreak: false });
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#92400e')
      .text(disclaimerText, margin + 12, disclaimerY + 19, { width: contentWidth - 24 });

    // ═══ FOOTER ═══
    const footerY = doc.page.height - 35;
    doc.moveTo(margin, footerY - 6).lineTo(pageWidth - margin, footerY - 6)
      .lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(
        'Generated by BestoClinic AI Dental Scanner  \u2022  www.bestoclinic.com  \u2022  Preliminary AI assessment \u2014 not a professional diagnosis',
        margin, footerY, { width: contentWidth, align: 'center' },
      );

    doc.end();
  });
}

module.exports = { generateDentalScanReport };
