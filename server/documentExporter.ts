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
 * Generates a clean A4 PDF report for policy analysis.
 */
export async function exportAnalysisToPdf(analysis: AnalysisResultPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let page = pdfDoc.addPage([595.28, 841.89]); // A4
  const margin = 50;
  const contentWidth = 595.28 - margin * 2;
  let y = 841.89 - margin;

  const checkPageBreak = (neededHeight: number = 30) => {
    if (y - neededHeight < margin) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 841.89 - margin;
    }
  };

  const drawWrappedText = (
    text: string,
    fontSize: number = 10,
    font = fontRegular,
    color = rgb(0.1, 0.1, 0.15),
    lineHeight: number = 14
  ) => {
    const words = (text || '').split(' ');
    let currentLine = '';

    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (textWidth > contentWidth) {
        checkPageBreak(lineHeight);
        page.drawText(currentLine, { x: margin, y, size: fontSize, font, color });
        y -= lineHeight;
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      checkPageBreak(lineHeight);
      page.drawText(currentLine, { x: margin, y, size: fontSize, font, color });
      y -= lineHeight;
    }
  };

  // Header
  page.drawText('KEMENTERIAN KOORDINATOR BIDANG POLITIK DAN KEAMANAN RI', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.09, 0.21, 0.36),
  });
  y -= 15;
  page.drawText('ASISTEN DEPUTI KOORDINASI TELEKOMUNIKASI DAN INFORMATIKA', {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.14, 0.38, 0.92),
  });
  y -= 25;

  // Title
  drawWrappedText(analysis.title.toUpperCase(), 15, fontBold, rgb(0.09, 0.21, 0.36), 18);
  y -= 6;
  drawWrappedText(
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
    page.drawText(title, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.09, 0.21, 0.36),
    });
    y -= 16;
    drawWrappedText(body, 9.5, fontRegular, rgb(0.1, 0.1, 0.15), 14);
    y -= 10;
  }

  // Chapter IX: Sources
  checkPageBreak(40);
  page.drawText('IX. Sumber dan Referensi', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.09, 0.21, 0.36),
  });
  y -= 16;

  const sources = analysis.sections.sumber_dan_referensi || [];
  if (sources.length === 0) {
    drawWrappedText('Tidak ada dokumen rujukan yang tercatat.', 9, fontItalic, rgb(0.4, 0.45, 0.55), 12);
  } else {
    sources.forEach((s, idx) => {
      drawWrappedText(`${idx + 1}. ${s.replace(/^\d+\.\s*/, '')}`, 8.5, fontItalic, rgb(0.2, 0.25, 0.35), 12);
      y -= 3;
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
