import { DocumentChunk, AnalysisSections } from '../types/spak';

const INDONESIAN_STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'ini', 'itu', 'dengan', 'untuk', 'pada',
  'adalah', 'sebagai', 'dalam', 'tidak', 'akan', 'juga', 'atau', 'ada', 'mereka',
  'sudah', 'saya', 'kita', 'kami', 'bisa', 'oleh', 'karena', 'tersebut', 'lebih',
  'dapat', 'telah', 'bahwa', 'antara', 'secara', 'harus', 'saat', 'terhadap',
  'melalui', 'namun', 'masih', 'hal', 'para', 'sampai', 'seperti', 'apa', 'bagaimana'
]);

/**
 * Normalizes and tokenizes Indonesian/English text for keyword & BM25 indexing.
 */
export function tokenizeAndNormalize(text: string): string[] {
  if (!text) return [];
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !INDONESIAN_STOPWORDS.has(t));
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;
  matchedTerms: string[];
}

/**
 * Ranks document chunks using BM25 scoring + exact phrase & metadata boost.
 */
export function rankChunksBM25(
  query: string,
  chunks: DocumentChunk[],
  topK: number = 12,
  allowedDocumentIds?: string[]
): ScoredChunk[] {
  const filteredChunks =
    allowedDocumentIds && allowedDocumentIds.length > 0
      ? chunks.filter((c) => allowedDocumentIds.includes(c.document_id))
      : chunks;

  if (filteredChunks.length === 0) return [];

  const queryTokens = tokenizeAndNormalize(query);
  if (queryTokens.length === 0) {
    return filteredChunks.slice(0, topK).map((chunk) => ({
      chunk,
      score: 1,
      matchedTerms: [],
    }));
  }

  const N = filteredChunks.length;
  const k1 = 1.5;
  const b = 0.75;

  const docTokensList = filteredChunks.map((c) =>
    tokenizeAndNormalize(`${c.title} ${c.source_agency} ${c.location} ${c.content}`)
  );

  const avgDl =
    docTokensList.reduce((acc, tokens) => acc + tokens.length, 0) / Math.max(1, N);

  // Document frequency for each query token
  const dfMap = new Map<string, number>();
  for (const qToken of queryTokens) {
    let df = 0;
    for (const tokens of docTokensList) {
      if (tokens.includes(qToken)) df++;
    }
    dfMap.set(qToken, df);
  }

  const scored: ScoredChunk[] = [];
  const lowerQuery = query.toLowerCase().trim();

  for (let i = 0; i < filteredChunks.length; i++) {
    const chunk = filteredChunks[i];
    const tokens = docTokensList[i];
    const dl = tokens.length;

    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    let score = 0;
    const matchedTerms: string[] = [];

    for (const qToken of queryTokens) {
      const tf = tfMap.get(qToken) || 0;
      if (tf > 0) {
        matchedTerms.push(qToken);
        const df = dfMap.get(qToken) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const num = tf * (k1 + 1);
        const den = tf + k1 * (1 - b + b * (dl / Math.max(1, avgDl)));
        score += idf * (num / den);
      } else {
        // Partial prefix match fallback
        const partialCount = tokens.filter((t) => t.includes(qToken) || qToken.includes(t)).length;
        if (partialCount > 0) {
          matchedTerms.push(qToken);
          score += 0.35 * Math.min(3, partialCount);
        }
      }
    }

    // Exact phrase boost
    if (lowerQuery.length > 4 && chunk.content.toLowerCase().includes(lowerQuery)) {
      score += 2.5;
    }

    if (score > 0) {
      scored.push({
        chunk,
        score: Number(score.toFixed(4)),
        matchedTerms: Array.from(new Set(matchedTerms)),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // If no lexical match found (e.g. very broad question), return diverse chunks across allowed docs
  if (scored.length === 0) {
    return filteredChunks.slice(0, topK).map((chunk) => ({
      chunk,
      score: 0.1,
      matchedTerms: [],
    }));
  }

  return scored.slice(0, topK);
}

/**
 * Formats a canonical reference line for Section IX / end of response:
 * "Nama Dokumen — tanggal — halaman/slide/sheet"
 */
export function formatCanonicalReference(chunk: Pick<DocumentChunk, 'title' | 'document_date' | 'location'>): string {
  const title = (chunk.title || 'Dokumen Tanpa Judul').trim();
  const date = (chunk.document_date || 'Tanpa Tanggal').trim();
  const loc = (chunk.location || 'Bagian 1').trim();
  return `${title} — ${date} — ${loc}`;
}

/**
 * Deduplicates canonical references preserving order of appearance.
 */
export function deduplicateReferences(chunks: Pick<DocumentChunk, 'title' | 'document_date' | 'location'>[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of chunks) {
    const formatted = formatCanonicalReference(c);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      result.push(formatted);
    }
  }
  return result;
}

/**
 * Enforces Section 17 Global Source Rule:
 * Strips inline bracketed reference numbers like [1], [2, 3], [Sumber 1], (Dokumen 1, Hal. 2)
 * from prose body so citations ONLY appear in the final Sumber dan Referensi section.
 */
export function stripInlineCitations(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/\s*\[(?:Sumber|Ref|Referensi|Dokumen|Chunk)[^\]]*\]/gi, '')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .trim();
}

/**
 * Detects and neutralizes prompt injection attempts inside user queries or document chunks.
 */
export function sanitizeAgainstPromptInjection(input: string): {
  sanitized: string;
  flagged: boolean;
} {
  if (!input) return { sanitized: '', flagged: false };
  const suspiciousPatterns = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
    /abaikan\s+(semua\s+)?instruksi\s+sebelumnya/gi,
    /system\s*prompt\s*override/gi,
    /reveal\s+(your\s+)?(api\s*key|secret|system\s*prompt)/gi,
  ];
  let flagged = false;
  let sanitized = input;
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      flagged = true;
      sanitized = sanitized.replace(pattern, '[INSTRUKSI_DIBLOKIR]');
    }
  }
  return { sanitized, flagged };
}

/**
 * Compiles structured 9-section policy analysis into clean Markdown with
 * Section IX (Sumber dan Referensi) strictly at the very end.
 */
export function compileAnalysisMarkdown(title: string, sections: AnalysisSections): string {
  const clean = (s: string) => stripInlineCitations(s || '');
  const refs =
    sections.sumber_dan_referensi && sections.sumber_dan_referensi.length > 0
      ? sections.sumber_dan_referensi
          .map((r, idx) => `${idx + 1}. ${r.replace(/^\d+\.\s*/, '')}`)
          .join('\n')
      : 'Tidak terdapat sumber dokumen yang memadai untuk diverifikasi.';

  return [
    `# ${title}`,
    '',
    '## I. Ringkasan Eksekutif',
    clean(sections.ringkasan_eksekutif),
    '',
    '## II. Latar Belakang',
    clean(sections.latar_belakang),
    '',
    '## III. Kondisi Faktual',
    clean(sections.kondisi_faktual),
    '',
    '## IV. Identifikasi Permasalahan',
    clean(sections.identifikasi_permasalahan),
    '',
    '## V. Analisis dan Pembahasan Komprehensif',
    clean(sections.analisis_pembahasan_komprehensif),
    '',
    '## VI. Alternatif Kebijakan',
    clean(sections.alternatif_kebijakan),
    '',
    '## VII. Rekomendasi',
    clean(sections.rekomendasi),
    '',
    '## VIII. Kesimpulan',
    clean(sections.kesimpulan),
    '',
    '## IX. Sumber dan Referensi',
    refs,
  ].join('\n');
}
