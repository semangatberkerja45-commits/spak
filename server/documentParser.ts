import fs from 'node:fs';
import path from 'node:path';
import jszip from 'jszip';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import { DocumentChunk, ExtractedDocumentFile } from '../src/types/spak';

export interface ParseResult {
  ocrRequired: boolean;
  notes?: string;
  chunks: DocumentChunk[];
}

/**
 * Normalizes multi-line text into consistent paragraphs.
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Splits plain text into structured chunks of reasonable size with overlap.
 */
function chunkText(
  fullText: string,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  },
  locationPrefix: string = 'Halaman'
): DocumentChunk[] {
  const cleaned = cleanText(fullText);
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: DocumentChunk[] = [];
  let currentText = '';
  let chunkIndex = 1;

  for (const para of paragraphs) {
    if (currentText.length + para.length > 900) {
      if (currentText.trim().length > 20) {
        chunks.push({
          id: `chk_${docMeta.documentId}_${chunkIndex}`,
          document_id: docMeta.documentId,
          file_id: docMeta.fileId,
          title: docMeta.title,
          document_date: docMeta.documentDate,
          source_agency: docMeta.sourceAgency,
          location: `${locationPrefix} ${chunkIndex}`,
          timestamp: new Date().toISOString(),
          content: currentText.trim(),
        });
        chunkIndex++;
      }
      currentText = para + '\n\n';
    } else {
      currentText += (currentText ? '\n\n' : '') + para;
    }
  }

  if (currentText.trim().length > 15) {
    chunks.push({
      id: `chk_${docMeta.documentId}_${chunkIndex}`,
      document_id: docMeta.documentId,
      file_id: docMeta.fileId,
      title: docMeta.title,
      document_date: docMeta.documentDate,
      source_agency: docMeta.sourceAgency,
      location: `${locationPrefix} ${chunkIndex}`,
      timestamp: new Date().toISOString(),
      content: currentText.trim(),
    });
  }

  return chunks;
}

/**
 * 12.4 PDF Parser: Reads text and page count.
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  let pageCount = 1;
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount() || 1;
  } catch {
    // ignore
  }

  // Extract raw text streams from PDF buffer
  const rawString = buffer.toString('latin1');
  const textMatches = rawString.match(/\(([^()]+)\)[\s]*Tj/g) || [];
  let extractedText = '';

  if (textMatches.length > 0) {
    extractedText = textMatches
      .map((m) => m.replace(/^\(/, '').replace(/\)[\s]*Tj$/, ''))
      .join(' ');
  }

  // Also match stream text blocks
  const textStreams = rawString.match(/BT[\s\S]*?ET/g) || [];
  if (textStreams.length > 0) {
    const streamContent = textStreams
      .map((s) => s.replace(/[^a-zA-Z0-9\s.,;:_/-]/g, ' '))
      .join(' ');
    if (streamContent.length > extractedText.length) {
      extractedText = streamContent;
    }
  }

  const cleaned = cleanText(extractedText);
  if (!cleaned || cleaned.length < 50) {
    return {
      ocrRequired: true,
      notes: 'Dokumen tampaknya berupa pindaian/scan atau raster murni. Memerlukan OCR.',
      chunks: [
        {
          id: `chk_${docMeta.documentId}_1`,
          document_id: docMeta.documentId,
          file_id: docMeta.fileId,
          title: docMeta.title,
          document_date: docMeta.documentDate,
          source_agency: docMeta.sourceAgency,
          location: 'Halaman 1',
          timestamp: new Date().toISOString(),
          content: `${docMeta.title} (${docMeta.sourceAgency}). [Memerlukan OCR - Dokumen visual belum diekstrak teks lengkapnya]`,
        },
      ],
    };
  }

  const chunks = chunkText(cleaned, docMeta, 'Halaman');
  return {
    ocrRequired: false,
    chunks: chunks.length > 0 ? chunks : [
      {
        id: `chk_${docMeta.documentId}_1`,
        document_id: docMeta.documentId,
        file_id: docMeta.fileId,
        title: docMeta.title,
        document_date: docMeta.documentDate,
        source_agency: docMeta.sourceAgency,
        location: 'Halaman 1',
        timestamp: new Date().toISOString(),
        content: cleaned.slice(0, 800),
      },
    ],
  };
}

/**
 * 12.5 DOCX Parser: Paragraf, Heading, Tabel, Daftar.
 */
export async function parseDocxBuffer(
  buffer: Buffer,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const fullText = cleanText(result.value);
    if (!fullText) {
      return {
        ocrRequired: false,
        notes: 'File DOCX tidak memiliki teks.',
        chunks: [],
      };
    }
    const chunks = chunkText(fullText, docMeta, 'Paragraf');
    return { ocrRequired: false, chunks };
  } catch (err: any) {
    return {
      ocrRequired: false,
      notes: `Gagal membaca DOCX: ${err.message}`,
      chunks: [],
    };
  }
}

/**
 * 12.6 TXT Parser: UTF-8 Text.
 */
export async function parseTxtBuffer(
  buffer: Buffer,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  const fullText = cleanText(buffer.toString('utf-8'));
  const chunks = chunkText(fullText, docMeta, 'Bagian');
  return { ocrRequired: false, chunks };
}

/**
 * 12.7 XLSX Parser: Sheet, Kolom, Baris, Indikator numerik.
 */
export async function parseXlsxBuffer(
  buffer: Buffer,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  const chunks: DocumentChunk[] = [];
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let chunkSeq = 1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1 });
      if (!jsonRows || jsonRows.length === 0) continue;

      // Header row
      const headers = (jsonRows[0] || []).map((h: any) => String(h || '').trim()).filter(Boolean);
      const dataRows = jsonRows.slice(1);

      // Group rows into blocks of 15
      const blockSize = 15;
      for (let r = 0; r < dataRows.length; r += blockSize) {
        const block = dataRows.slice(r, r + blockSize);
        const textLines: string[] = [
          `Sheet: ${sheetName} | Kolom: ${headers.join(', ')}`,
        ];

        block.forEach((row, rowIdx) => {
          if (!row || row.length === 0) return;
          const rowText = row
            .map((val: any, colIdx: number) => {
              const hName = headers[colIdx] || `Kolom_${colIdx + 1}`;
              return `${hName}: ${val !== undefined && val !== null ? val : '-'}`;
            })
            .join(' | ');
          textLines.push(`Baris ${r + rowIdx + 2}: ${rowText}`);
        });

        const startRow = r + 2;
        const endRow = Math.min(dataRows.length + 1, r + blockSize + 1);
        const location = `Sheet: ${sheetName} (Baris ${startRow}-${endRow})`;

        chunks.push({
          id: `chk_${docMeta.documentId}_${chunkSeq++}`,
          document_id: docMeta.documentId,
          file_id: docMeta.fileId,
          title: docMeta.title,
          document_date: docMeta.documentDate,
          source_agency: docMeta.sourceAgency,
          location,
          timestamp: new Date().toISOString(),
          content: textLines.join('\n'),
        });
      }
    }
  } catch (err: any) {
    return {
      ocrRequired: false,
      notes: `Gagal membaca XLSX: ${err.message}`,
      chunks: [],
    };
  }

  return { ocrRequired: false, chunks };
}

/**
 * 12.8 PPTX Parser: Membaca teks per slide dari format presentasi OpenXML zip.
 */
export async function parsePptxBuffer(
  buffer: Buffer,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  const chunks: DocumentChunk[] = [];
  try {
    const zip = await jszip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(name)
    );

    // Sort naturally by slide number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/[^0-9]/g, '') || '0', 10);
      const numB = parseInt(b.replace(/[^0-9]/g, '') || '0', 10);
      return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = slideFiles[i];
      const xmlText = await zip.files[slidePath].async('string');
      // Extract <a:t> text nodes
      const textMatches = xmlText.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
      const slideTexts = textMatches
        .map((tag) => tag.replace(/<[^>]+>/g, '').trim())
        .filter((t) => t.length > 0);

      const slideNum = i + 1;
      const content = slideTexts.length > 0
        ? slideTexts.join('\n')
        : `[Slide ${slideNum} tidak memiliki teks atau berupa gambar/diagram visual murni]`;

      chunks.push({
        id: `chk_${docMeta.documentId}_${slideNum}`,
        document_id: docMeta.documentId,
        file_id: docMeta.fileId,
        title: docMeta.title,
        document_date: docMeta.documentDate,
        source_agency: docMeta.sourceAgency,
        location: `Slide ${slideNum}`,
        timestamp: new Date().toISOString(),
        content: `Slide ${slideNum}: ${content}`,
      });
    }
  } catch (err: any) {
    return {
      ocrRequired: false,
      notes: `Gagal membaca PPTX: ${err.message}`,
      chunks: [],
    };
  }

  return { ocrRequired: false, chunks };
}

/**
 * Universal dispatcher for all 5 document formats.
 */
export async function parseDocumentBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  docMeta: {
    documentId: string;
    fileId: string;
    title: string;
    documentDate: string;
    sourceAgency: string;
  }
): Promise<ParseResult> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.pdf' || mimeType.includes('pdf')) {
    return parsePdfBuffer(buffer, docMeta);
  }
  if (
    ext === '.docx' ||
    mimeType.includes('officedocument.wordprocessingml') ||
    mimeType.includes('msword')
  ) {
    return parseDocxBuffer(buffer, docMeta);
  }
  if (
    ext === '.xlsx' ||
    ext === '.xls' ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel')
  ) {
    return parseXlsxBuffer(buffer, docMeta);
  }
  if (
    ext === '.pptx' ||
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint')
  ) {
    return parsePptxBuffer(buffer, docMeta);
  }
  // Default to plain text
  return parseTxtBuffer(buffer, docMeta);
}
