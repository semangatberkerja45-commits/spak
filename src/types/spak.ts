import { z } from 'zod';

export const APP_FOLDER_NAME = 'SPAK-TIK';

export const SUBFOLDER_NAMES = {
  KNOWLEDGE_CENTER: '01_Pusat_Pengetahuan',
  KNOWLEDGE_INDEX: '02_Indeks_Pengetahuan',
  ANALYSIS_RESULTS: '03_Hasil_Analisis',
  DOCUMENT_TEMPLATES: '04_Template_Dokumen',
  DATABASE: '05_Database',
  DEMO_DATA: '06_Data_Demo',
  BACKUP: '07_Backup',
} as const;

export const DATABASE_SPREADSHEET_NAME = 'SPAK-TIK_Database';
export const MANIFEST_FILE_NAME = 'spak_tik_manifest.json';
export const GLOBAL_INDEX_FILE_NAME = 'spak_tik_search_index.json';

export const WORKSHEET_NAMES = [
  'Documents',
  'Categories',
  'Analyses',
  'AnalysisSources',
  'Conversations',
  'Templates',
  'Settings',
  'AuditLogs',
] as const;

export type WorksheetName = (typeof WORKSHEET_NAMES)[number];

export type ProcessingStatus =
  | 'Validate'
  | 'Uploading'
  | 'Uploaded'
  | 'Extracting'
  | 'Indexing'
  | 'Ready'
  | 'Memerlukan OCR'
  | 'Failed';

export interface WorkspaceManifest {
  application_version: string;
  owner_google_user_id: string;
  root_folder_id: string;
  folder_ids: {
    '01_Pusat_Pengetahuan': string;
    '02_Indeks_Pengetahuan': string;
    '03_Hasil_Analisis': string;
    '04_Template_Dokumen': string;
    '05_Database': string;
    '06_Data_Demo': string;
    '07_Backup': string;
  };
  spreadsheet_id: string;
  schema_version: string;
  initialized_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  file_id: string;
  title: string;
  file_name: string;
  mime_type: string;
  category_ids: string; // JSON or comma-separated IDs
  source_agency: string;
  document_date: string;
  description: string;
  extracted_file_id: string;
  index_version: string;
  processing_status: ProcessingStatus | string;
  is_demo: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  parent_id: string;
  active: boolean;
  sort_order: number;
  updated_at: string;
  version: number;
}

export type AnalysisType =
  | 'Isu Strategis'
  | 'Permasalahan'
  | 'Akar Penyebab'
  | 'Kesenjangan'
  | 'Risiko'
  | 'Kebijakan Komprehensif'
  | 'Alternatif Kebijakan'
  | 'Perkembangan Isu';

export type AnalysisDepth = 'Ringkas' | 'Standar' | 'Mendalam';

export type AnalysisFocus =
  | 'Teknis'
  | 'Kebijakan'
  | 'Kelembagaan'
  | 'Strategis'
  | 'Komprehensif';

export interface AnalysisSections {
  ringkasan_eksekutif: string;
  latar_belakang: string;
  kondisi_faktual: string;
  identifikasi_permasalahan: string;
  analisis_pembahasan_komprehensif: string;
  alternatif_kebijakan: string;
  rekomendasi: string;
  kesimpulan: string;
  sumber_dan_referensi: string[];
}

export interface AnalysisInputMeta {
  latar_belakang_input?: string;
  permasalahan_input?: string;
  tujuan?: string;
  pertanyaan_analisis?: string;
  ruang_lingkup?: string;
  periode?: string;
  focus?: AnalysisFocus;
}

export interface AnalysisRecord {
  id: string;
  title: string;
  topic: string;
  type: AnalysisType | string;
  depth: AnalysisDepth | string;
  selected_document_ids: string; // JSON array string
  result_file_id: string;
  status: 'Draft' | 'Running' | 'Completed' | 'Failed';
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AnalysisResultPayload {
  analysis_id: string;
  title: string;
  topic: string;
  type: string;
  depth: string;
  focus: string;
  input_meta: AnalysisInputMeta;
  sections: AnalysisSections;
  markdown_content: string;
  agent_trace: {
    retrieval_summary: string;
    synthesis_summary: string;
    quality_review_summary: string;
    verified_claims_count: number;
    confidence_notes: string;
  };
  sources: AnalysisSourceRecord[];
  updated_at: string;
  version: number;
}

export interface AnalysisSourceRecord {
  id: string;
  analysis_id: string;
  document_id: string;
  source_location: string;
  claim_id: string;
  verification_status: 'Verified' | 'Partial' | 'Unverified';
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: string[];
  source_chunks?: DocumentChunk[];
  quality_notes?: string;
  timestamp: string;
}

export interface ConversationRecord {
  id: string;
  title: string;
  messages_file_id: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateRecord {
  id: string;
  name: string;
  type: 'DOCX' | 'Markdown';
  file_id: string;
  active: boolean;
  is_default: boolean;
  version: number;
  updated_at: string;
}

export interface SettingRecord {
  key: string;
  value: string;
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  status: 'SUCCESS' | 'ERROR' | 'WARNING';
  details: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  file_id: string;
  title: string;
  document_date: string;
  source_agency: string;
  location: string; // e.g., "Halaman 2", "Slide 3", "Sheet: Indikator_BTS (A1:F15)"
  timestamp: string;
  content: string;
}

export interface ExtractedDocumentFile {
  document_id: string;
  file_id: string;
  title: string;
  document_date: string;
  source_agency: string;
  mime_type: string;
  extracted_at: string;
  ocr_required?: boolean;
  notes?: string;
  chunks: DocumentChunk[];
}

export const KnowledgeQueryOutputSchema = z.object({
  answer_body: z.string(),
  quality_review_note: z.string(),
  verified_claims: z.array(
    z.object({
      claim_id: z.string(),
      statement: z.string(),
      document_id: z.string(),
      document_title: z.string(),
      document_date: z.string(),
      location: z.string(),
      verification_status: z.enum(['Verified', 'Partial', 'Unverified']),
    })
  ),
  references: z.array(z.string()),
});

export const PolicySynthesisOutputSchema = z.object({
  sections: z.object({
    ringkasan_eksekutif: z.string(),
    latar_belakang: z.string(),
    kondisi_faktual: z.string(),
    identifikasi_permasalahan: z.string(),
    analisis_pembahasan_komprehensif: z.string(),
    alternatif_kebijakan: z.string(),
    rekomendasi: z.string(),
    kesimpulan: z.string(),
    sumber_dan_referensi: z.array(z.string()),
  }),
  agent_trace: z.object({
    retrieval_summary: z.string(),
    synthesis_summary: z.string(),
    quality_review_summary: z.string(),
    verified_claims_count: z.number(),
    confidence_notes: z.string(),
  }),
  claims_mapping: z.array(
    z.object({
      claim_id: z.string(),
      document_id: z.string(),
      source_location: z.string(),
      verification_status: z.enum(['Verified', 'Partial', 'Unverified']),
    })
  ),
});
