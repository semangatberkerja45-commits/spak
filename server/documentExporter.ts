import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, BorderStyle } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AnalysisResultPayload } from '../src/types/spak';

/**
 * 20. Generates a formal Government DOCX report with Kemenko Polkam styling.
 */
export async function exportAnalysisToDocx(analysis: AnalysisResultPayload): Promise<Buffer> {
  const s = analysis.sections;

  const doc = new Document({
    title: analysis.title,
    description: `Kajian Kebijakan SPAK-TIK - ${analysis.topic}`,
    sections: [
      {
        properties: {},
        children: [
          // Header / Kop
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'KEMENTERIAN KOORDINATOR BIDANG POLITIK DAN KEAMANAN RI',
                bold: true,
                size: 24,
                font: 'Plus Jakarta Sans',
                color: '17365D',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'ASISTEN DEPUTI KOORDINASI TELEKOMUNIKASI DAN INFORMATIKA',
                bold: true,
                size: 20,
                font: 'Plus Jakarta Sans',
                color: '2563EB',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'TELAAHAN STAF & KAJIAN KEBIJAKAN STRATEGIS',
                bold: true,
                size: 22,
                font: 'Plus Jakarta Sans',
              }),
            ],
          }),
          new Paragraph({ text: '' }),

          // Title
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: analysis.title.toUpperCase(),
                bold: true,
                size: 28,
                color: '17365D',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Topik: ${analysis.topic} | Tipe: ${analysis.type} | Kedalaman: ${analysis.depth} | Fokus: ${analysis.focus}`,
                italics: true,
                size: 18,
                color: '64748B',
              }),
            ],
          }),
          new Paragraph({ text: '' }),

          // Bab I
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'I. RINGKASAN EKSEKUTIF', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.ringkasan_eksekutif, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab II
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'II. LATAR BELAKANG', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.latar_belakang, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab III
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'III. KONDISI FAKTUAL', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.kondisi_faktual, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab IV
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'IV. IDENTIFIKASI PERMASALAHAN', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.identifikasi_permasalahan, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab V
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'V. ANALISIS DAN PEMBAHASAN KOMPREHENSIF', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.analisis_pembahasan_komprehensif, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab VI
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'VI. ALTERNATIF KEBIJAKAN', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.alternatif_kebijakan, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab VII
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'VII. REKOMENDASI', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.rekomendasi, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab VIII
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'VIII. KESIMPULAN', bold: true, size: 22, color: '17365D' })],
          }),
          new Paragraph({ children: [new TextRun({ text: s.kesimpulan, size: 20 })] }),
          new Paragraph({ text: '' }),

          // Bab IX
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'IX. SUMBER DAN REFERENSI', bold: true, size: 22, color: '17365D' })],
          }),
          ...(s.sumber_dan_referensi && s.sumber_dan_referensi.length > 0
            ? s.sumber_dan_referensi.map(
                (ref, idx) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${idx + 1}. ${ref.replace(/^\d+\.\s*/, '')}`,
                        size: 19,
                        italics: true,
                      }),
                    ],
                  })
              )
            : [
                new Paragraph({
                  children: [new TextRun({ text: 'Tidak ada dokumen rujukan yang tercatat.', italics: true })],
                }),
              ]),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Cleans text of markdown and non-WinAnsi characters to prevent pdf-lib encoding crashes.
 */
function cleanForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[\u2014\u2015]/g, ' - ') // em-dash, horizontal bar
    .replace(/[\u2012\u2013]/g, '-')   // en-dash, figure dash
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-') // bullets
    .replace(/[\u2026]/g, '...')       // ellipsis
    .replace(/[^\x00-\x7F\xA0-\xFF]/g, ' '); // remove any remaining non-WinAnsi characters
}

/**
 * Generates a clean A4 PDF report for policy analysis.
 */
export async function exportAnalysisToPdf(analysis: AnalysisResultPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let page = pdfDoc.addPage([595.28, 841.89]); // A4 standard
  const margin = 50;
  const contentWidth = 595.28 - margin * 2;
  let y = 841.89 - margin;

  const checkPageBreak = (neededHeight: number = 30) => {
    if (y - neededHeight < margin + 20) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 841.89 - margin;
    }
  };

  const drawSafeText = (
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      font: any;
      color: any;
    }
  ) => {
    // Strip any raw newlines or carriage returns inside drawText
    const singleLine = (text || '').replace(/[\r\n]+/g, ' ').trim();
    if (!singleLine) return;
    try {
      page.drawText(singleLine, options);
    } catch {
      // Fallback: replace any character that fails WinAnsi with ASCII safe space
      const asciiOnly = singleLine.replace(/[^\x20-\x7E]/g, ' ');
      page.drawText(asciiOnly, options);
    }
  };

  const drawParagraphs = (
    text: string,
    fontSize: number = 9.5,
    font = fontRegular,
    color = rgb(0.1, 0.1, 0.15),
    lineHeight: number = 14
  ) => {
    const cleaned = cleanForPdf(text);
    const paragraphs = cleaned.split(/\r?\n/);

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        y -= lineHeight * 0.45;
        checkPageBreak(lineHeight);
        continue;
      }

      const words = trimmed.split(/\s+/);
      let currentLine = '';

      for (const w of words) {
        if (!w) continue;
        const testLine = currentLine ? `${currentLine} ${w}` : w;
        let textWidth = 0;
        try {
          textWidth = font.widthOfTextAtSize(testLine, fontSize);
        } catch {
          textWidth = testLine.length * fontSize * 0.55;
        }

        if (textWidth > contentWidth && currentLine) {
          checkPageBreak(lineHeight);
          drawSafeText(currentLine, { x: margin, y, size: fontSize, font, color });
          y -= lineHeight;
          currentLine = w;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        checkPageBreak(lineHeight);
        drawSafeText(currentLine, { x: margin, y, size: fontSize, font, color });
        y -= lineHeight;
      }
    }
  };

  // Header Kemenko Polkam
  drawSafeText('KEMENTERIAN KOORDINATOR BIDANG POLITIK DAN KEAMANAN RI', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.09, 0.21, 0.36),
  });
  y -= 15;
  drawSafeText('ASISTEN DEPUTI KOORDINASI TELEKOMUNIKASI DAN INFORMATIKA', {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.14, 0.38, 0.92),
  });
  y -= 25;

  // Title
  drawParagraphs(analysis.title.toUpperCase(), 14, fontBold, rgb(0.09, 0.21, 0.36), 18);
  y -= 4;
  drawParagraphs(
    `Topik: ${analysis.topic} | Tipe: ${analysis.type} | Kedalaman: ${analysis.depth}`,
    9,
    fontItalic,
    rgb(0.4, 0.45, 0.55),
    12
  );
  y -= 15;

  const chapters: [string, string][] = [
    ['I. Ringkasan Eksekutif', analysis.sections.ringkasan_eksekutif],
    ['II. Latar Belakang', analysis.sections.latar_belakang],
    ['III. Kondisi Faktual', analysis.sections.kondisi_faktual],
    ['IV. Identifikasi Permasalahan', analysis.sections.identifikasi_permasalahan],
    ['V. Analisis dan Pembahasan Komprehensif', analysis.sections.analisis_pembahasan_komprehensif],
    ['VI. Alternatif Kebijakan', analysis.sections.alternatif_kebijakan],
    ['VII. Rekomendasi', analysis.sections.rekomendasi],
    ['VIII. Kesimpulan', analysis.sections.kesimpulan],
  ];

  for (const [title, body] of chapters) {
    checkPageBreak(35);
    drawSafeText(title, {
      x: margin,
      y,
      size: 10.5,
      font: fontBold,
      color: rgb(0.09, 0.21, 0.36),
    });
    y -= 16;
    drawParagraphs(body, 9, fontRegular, rgb(0.1, 0.1, 0.15), 13.5);
    y -= 8;
  }

  // Chapter IX: Sources
  checkPageBreak(40);
  drawSafeText('IX. Sumber dan Referensi', {
    x: margin,
    y,
    size: 10.5,
    font: fontBold,
    color: rgb(0.09, 0.21, 0.36),
  });
  y -= 16;

  const sources = analysis.sections.sumber_dan_referensi || [];
  if (sources.length === 0) {
    drawParagraphs('Tidak ada dokumen rujukan yang tercatat.', 9, fontItalic, rgb(0.4, 0.45, 0.55), 12);
  } else {
    sources.forEach((s, idx) => {
      drawParagraphs(`${idx + 1}. ${s.replace(/^\d+\.\s*/, '')}`, 8.5, fontItalic, rgb(0.2, 0.25, 0.35), 12);
      y -= 3;
    });
  }

  // Add Page Numbers at footer
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    try {
      p.drawText(`Halaman ${i + 1} dari ${totalPages}  |  SPAK-TIK Kemenko Polkam RI`, {
        x: margin,
        y: 25,
        size: 8,
        font: fontItalic,
        color: rgb(0.5, 0.55, 0.65),
      });
    } catch {
      // ignore
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
