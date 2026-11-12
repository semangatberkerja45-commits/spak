import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { DriveStorageService, DriveStorageError } from './server/driveStorageService';
import { SheetsRepository } from './server/sheetsRepository';
import { parseDocumentBuffer } from './server/documentParser';
import {
  executeKnowledgeAssistantQuery,
  executeComprehensivePolicyAnalysis,
} from './server/policyAgents';
import { exportAnalysisToDocx, exportAnalysisToPdf } from './server/documentExporter';
import { seedDemoDataIdempotent, resetDemoData } from './server/demoGenerator';
import {
  WorkspaceManifest,
  DocumentRecord,
  ExtractedDocumentFile,
  DocumentChunk,
  AnalysisRecord,
  AnalysisResultPayload,
} from './src/types/spak';
import { sanitizeAgainstPromptInjection } from './src/utils/ragEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'spak-tik-session-secret'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB
});

// Session token extractor (Client sends Google Access Token in Authorization: Bearer <token>)
interface AuthContext {
  token: string;
  userId: string;
  userEmail: string;
  isSandbox: boolean;
}

function resolveAuthContext(req: Request): AuthContext | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      // Decode user info if available from client headers or sandbox token
      const isSandbox = token.startsWith('demo_token') || req.query.autostart === '1';
      const userId = (req.headers['x-user-id'] as string) || (isSandbox ? 'usr_sandbox_tester' : 'usr_polkam_analyst');
      const userEmail = (req.headers['x-user-email'] as string) || (isSandbox ? 'analis.demo@polkam.go.id' : 'analis.kebijakan@polkam.go.id');
      return { token, userId, userEmail, isSandbox };
    }
  }

  // Also support session cookie fallback or dev test query
  const cookieToken = req.cookies?.spak_token;
  if (cookieToken) {
    return {
      token: cookieToken,
      userId: req.cookies?.spak_user_id || 'usr_cookie_session',
      userEmail: req.cookies?.spak_user_email || 'analis@polkam.go.id',
      isSandbox: cookieToken.startsWith('demo_token'),
    };
  }

  // Support local development / preview sandbox mode when ?autostart=1 or test header is provided
  if (req.query.autostart === '1' || req.headers['x-spak-sandbox'] === 'true') {
    return {
      token: 'demo_token_ephemeral_sandbox',
      userId: 'usr_sandbox_analyst',
      userEmail: 'analis.demo@polkam.go.id',
      isSandbox: true,
    };
  }

  return null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Sesi Google Drive belum terhubung. Silakan login dengan Google.',
    });
  }
  (req as any).auth = auth;
  next();
}

/**
 * Helper to get active WorkspaceManifest from Drive.
 */
async function getActiveWorkspace(auth: AuthContext): Promise<{
  driveService: DriveStorageService;
  sheetsRepo: SheetsRepository;
  manifest: WorkspaceManifest;
}> {
  const driveService = new DriveStorageService(auth.token, auth.isSandbox);
  const sheetsRepo = new SheetsRepository(auth.token, auth.isSandbox);

  const { manifest } = await driveService.loadManifest();
  if (!manifest) {
    // If not initialized, initialize now idempotently
    const initialized = await driveService.initializeWorkspaceFolders(
      auth.userId,
      async (dbFldId, existingSpreadsheetId) => {
        return sheetsRepo.ensureDatabaseSpreadsheet(dbFldId, existingSpreadsheetId);
      }
    );
    return { driveService, sheetsRepo, manifest: initialized };
  }
  return { driveService, sheetsRepo, manifest };
}

// ==========================================
// 23. BACKEND API ROUTES
// ==========================================

// --- AUTHENTICATION ---
app.get('/api/auth/session', (req: Request, res: Response) => {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return res.json({
      authenticated: false,
      user: null,
      appUrl: process.env.APP_URL || '',
      oauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  }
  return res.json({
    authenticated: true,
    user: {
      id: auth.userId,
      email: auth.userEmail,
      isSandbox: auth.isSandbox,
    },
    appUrl: process.env.APP_URL || '',
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('spak_token', { sameSite: 'none', secure: true });
  res.clearCookie('spak_user_id', { sameSite: 'none', secure: true });
  res.clearCookie('spak_user_email', { sameSite: 'none', secure: true });
  res.json({ success: true, message: 'Berhasil logout.' });
});

// --- DRIVE & WORKSPACE INITIALIZATION ---
app.get('/api/drive/status', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const driveService = new DriveStorageService(auth.token, auth.isSandbox);
    const { manifest } = await driveService.loadManifest();
    res.json({
      connected: true,
      initialized: Boolean(manifest),
      manifest: manifest || null,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({
      connected: false,
      error: err.message,
    });
  }
});

app.post('/api/drive/initialize', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const driveService = new DriveStorageService(auth.token, auth.isSandbox);
    const sheetsRepo = new SheetsRepository(auth.token, auth.isSandbox);

    const manifest = await driveService.initializeWorkspaceFolders(
      auth.userId,
      async (dbFldId, existingSpreadsheetId) => {
        return sheetsRepo.ensureDatabaseSpreadsheet(dbFldId, existingSpreadsheetId);
      }
    );

    await sheetsRepo.appendAuditLog(manifest.spreadsheet_id, {
      action: 'INITIALIZE_WORKSPACE',
      entity_type: 'WORKSPACE',
      entity_id: manifest.root_folder_id,
      status: 'SUCCESS',
      details: 'Folder SPAK-TIK dan database Google Sheets berhasil diinisialisasi secara idempoten.',
    });

    res.json({
      success: true,
      message: 'Inisialisasi workspace Google Drive & Google Sheets berhasil.',
      manifest,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 8.2 Reconcile Workspace Consistency Check
app.post('/api/drive/reconcile', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const docs = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    const issues: string[] = [];
    let fixedCount = 0;

    for (const doc of docs) {
      try {
        await driveService.getFileMetadata(doc.file_id);
      } catch {
        issues.push(`Dokumen "${doc.title}" (ID: ${doc.id}) memiliki file Drive yang tidak dapat diakses.`);
      }
      if (doc.extracted_file_id) {
        try {
          await driveService.getFileMetadata(doc.extracted_file_id);
        } catch {
          issues.push(`Hasil ekstraksi untuk "${doc.title}" tidak ditemukan di folder indeks.`);
        }
      }
    }

    res.json({
      success: true,
      totalDocumentsChecked: docs.length,
      issuesCount: issues.length,
      issues,
      recommendations:
        issues.length === 0
          ? 'Workspace sinkron sempurna. Tidak ada inkonsistensi metadata dan file Drive.'
          : 'Beberapa file terhapus di Drive luar aplikasi. Gunakan opsi Sinkronisasi Ulang untuk memperbarui indeks.',
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- DOCUMENTS (PUSAT PENGETAHUAN) ---
app.get('/api/documents', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const documents = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    res.json({ documents });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/documents', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File tidak ditemukan dalam request multipart.' });
    }

    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const title = (req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '')).trim();
    const sourceAgency = (req.body.source_agency || 'Kemenko Polkam').trim();
    const documentDate = (req.body.document_date || new Date().toISOString().slice(0, 10)).trim();
    const categoryIds = req.body.category_ids ? String(req.body.category_ids) : '[]';
    const description = (req.body.description || '').trim();

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Upload to 01_Pusat_Pengetahuan
    const uploaded = await driveService.uploadFile({
      name: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      content: req.file.buffer,
      parentId: manifest.folder_ids['01_Pusat_Pengetahuan'],
    });

    // 2. Parse content for 5 formats
    const parseResult = await parseDocumentBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      {
        documentId,
        fileId: uploaded.id,
        title,
        documentDate,
        sourceAgency,
      }
    );

    // 3. Save extracted chunks JSON in 02_Indeks_Pengetahuan
    const extractedFile: ExtractedDocumentFile = {
      document_id: documentId,
      file_id: uploaded.id,
      title,
      document_date: documentDate,
      source_agency: sourceAgency,
      mime_type: req.file.mimetype,
      extracted_at: new Date().toISOString(),
      ocr_required: parseResult.ocrRequired,
      notes: parseResult.notes,
      chunks: parseResult.chunks,
    };

    const extractedSaved = await driveService.saveJsonFile(
      `extracted_${documentId}.json`,
      extractedFile,
      manifest.folder_ids['02_Indeks_Pengetahuan']
    );

    // 4. Create record in Google Sheets
    const record: DocumentRecord = {
      id: documentId,
      file_id: uploaded.id,
      title,
      file_name: req.file.originalname,
      mime_type: req.file.mimetype,
      category_ids: categoryIds,
      source_agency: sourceAgency,
      document_date: documentDate,
      description,
      extracted_file_id: extractedSaved.id,
      index_version: 'v3.0',
      processing_status: parseResult.ocrRequired ? 'Memerlukan OCR' : 'Ready',
      is_demo: false,
      owner_id: auth.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    await sheetsRepo.upsertEntity(manifest.spreadsheet_id, 'Documents', record, 'id');

    await sheetsRepo.appendAuditLog(manifest.spreadsheet_id, {
      action: 'UPLOAD_DOCUMENT',
      entity_type: 'DOCUMENT',
      entity_id: documentId,
      status: 'SUCCESS',
      details: `Dokumen "${title}" (${req.file.originalname}) berhasil diunggah dan diindeks (${parseResult.chunks.length} cuplikan).`,
    });

    res.json({
      success: true,
      document: record,
      chunksCount: parseResult.chunks.length,
      ocrRequired: parseResult.ocrRequired,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/documents/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const docs = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    const doc = docs.find((d) => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    }

    let extractedData: ExtractedDocumentFile | null = null;
    if (doc.extracted_file_id) {
      try {
        extractedData = await driveService.readJsonFile<ExtractedDocumentFile>(doc.extracted_file_id);
      } catch {
        // ignore
      }
    }

    res.json({ document: doc, extractedData });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/documents/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const updates = req.body;
    const updated = await sheetsRepo.upsertEntity<DocumentRecord>(
      manifest.spreadsheet_id,
      'Documents',
      { id: req.params.id, ...updates },
      'id',
      updates.expected_version
    );
    res.json({ success: true, document: updated });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const docs = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    const doc = docs.find((d) => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    }

    if (doc.file_id) {
      try {
        await driveService.deleteFile(doc.file_id);
      } catch {
        // ignore
      }
    }
    if (doc.extracted_file_id) {
      try {
        await driveService.deleteFile(doc.extracted_file_id);
      } catch {
        // ignore
      }
    }

    await sheetsRepo.deleteEntity(manifest.spreadsheet_id, 'Documents', req.params.id, 'id');
    await sheetsRepo.appendAuditLog(manifest.spreadsheet_id, {
      action: 'DELETE_DOCUMENT',
      entity_type: 'DOCUMENT',
      entity_id: req.params.id,
      status: 'SUCCESS',
      details: `Dokumen "${doc.title}" telah dihapus dari Google Drive dan database.`,
    });

    res.json({ success: true, message: 'Dokumen berhasil dihapus.' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/documents/:id/download', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const docs = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    const doc = docs.find((d) => d.id === req.params.id);
    if (!doc || !doc.file_id) {
      return res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    }

    const buffer = await driveService.downloadFile(doc.file_id);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name || 'dokumen')}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Helper: Collect all extracted chunks across documents for RAG retrieval
async function collectAllIndexedChunks(
  driveService: DriveStorageService,
  sheetsRepo: SheetsRepository,
  spreadsheetId: string
): Promise<DocumentChunk[]> {
  const docs = await sheetsRepo.listDocuments(spreadsheetId);
  const allChunks: DocumentChunk[] = [];

  for (const doc of docs) {
    if (doc.extracted_file_id) {
      try {
        const extracted = await driveService.readJsonFile<ExtractedDocumentFile>(doc.extracted_file_id);
        if (extracted.chunks && extracted.chunks.length > 0) {
          allChunks.push(...extracted.chunks);
        }
      } catch {
        // continue
      }
    }
  }
  return allChunks;
}

// --- AI KNOWLEDGE ASSISTANT ---
app.post('/api/knowledge/query', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { query, allowed_document_ids, conversation_id } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Pertanyaan (query) wajib diisi.' });
    }

    const { sanitized, flagged } = sanitizeAgainstPromptInjection(query);
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const allChunks = await collectAllIndexedChunks(driveService, sheetsRepo, manifest.spreadsheet_id);

    const result = await executeKnowledgeAssistantQuery(
      sanitized,
      allChunks,
      Array.isArray(allowed_document_ids) ? allowed_document_ids : undefined
    );

    res.json({
      answer: result.answer,
      references: result.references,
      qualityReview: result.qualityReview,
      promptInjectionFlagged: flagged,
      sourceChunksCount: result.sourceChunks.length,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- ANALYSES (ANALISIS KEBIJAKAN KOMPREHENSIF) ---
app.get('/api/analyses', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analyses = await sheetsRepo.listAnalyses(manifest.spreadsheet_id);
    res.json({ analyses });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/analyses', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const {
      title,
      topic,
      type = 'Kebijakan Komprehensif',
      depth = 'Standar',
      selected_document_ids = [],
    } = req.body;

    if (!title || !topic) {
      return res.status(400).json({ error: 'Judul dan topik analisis wajib diisi.' });
    }

    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analysisId = `ans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const record: AnalysisRecord = {
      id: analysisId,
      title,
      topic,
      type,
      depth,
      selected_document_ids: JSON.stringify(selected_document_ids),
      result_file_id: '',
      status: 'Draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    await sheetsRepo.upsertEntity(manifest.spreadsheet_id, 'Analyses', record, 'id');
    res.json({ success: true, analysis: record });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/analyses/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analyses = await sheetsRepo.listAnalyses(manifest.spreadsheet_id);
    const analysis = analyses.find((a) => a.id === req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: 'Kajian analisis tidak ditemukan.' });
    }

    let payload: AnalysisResultPayload | null = null;
    if (analysis.result_file_id) {
      try {
        payload = await driveService.readJsonFile<AnalysisResultPayload>(analysis.result_file_id);
      } catch {
        // ignore
      }
    }

    const sources = await sheetsRepo.listAnalysisSources(manifest.spreadsheet_id, analysis.id);

    res.json({ analysis, payload, sources });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Run AI Policy Analysis (Three Agents pipeline)
app.post('/api/analyses/:id/run', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analyses = await sheetsRepo.listAnalyses(manifest.spreadsheet_id);
    const analysis = analyses.find((a) => a.id === req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: 'Kajian analisis tidak ditemukan.' });
    }

    // Update status to Running
    await sheetsRepo.upsertEntity(manifest.spreadsheet_id, 'Analyses', {
      ...analysis,
      status: 'Running',
    });

    const allChunks = await collectAllIndexedChunks(driveService, sheetsRepo, manifest.spreadsheet_id);

    const inputMeta = {
      latar_belakang_input: req.body.latar_belakang,
      permasalahan_input: req.body.permasalahan,
      tujuan: req.body.tujuan,
      pertanyaan_analisis: req.body.pertanyaan_analisis,
      ruang_lingkup: req.body.ruang_lingkup,
      periode: req.body.periode,
      focus: req.body.focus,
    };

    // Execute Three Agents
    const resultPayload = await executeComprehensivePolicyAnalysis(analysis, inputMeta, allChunks);

    // Save result JSON in 03_Hasil_Analisis folder
    const savedFile = await driveService.saveJsonFile(
      `analisis_${analysis.id}.json`,
      resultPayload,
      manifest.folder_ids['03_Hasil_Analisis'],
      analysis.result_file_id || undefined
    );

    // Save claim-source relationships in AnalysisSources sheet
    for (const src of resultPayload.sources) {
      await sheetsRepo.upsertEntity(manifest.spreadsheet_id, 'AnalysisSources', src, 'id');
    }

    // Update analysis record in Sheets to Completed
    const updatedRecord: AnalysisRecord = {
      ...analysis,
      result_file_id: savedFile.id,
      status: 'Completed',
      updated_at: new Date().toISOString(),
      version: analysis.version + 1,
    };

    await sheetsRepo.upsertEntity(manifest.spreadsheet_id, 'Analyses', updatedRecord, 'id');

    await sheetsRepo.appendAuditLog(manifest.spreadsheet_id, {
      action: 'RUN_POLICY_ANALYSIS',
      entity_type: 'ANALYSIS',
      entity_id: analysis.id,
      status: 'SUCCESS',
      details: `Analisis kebijakan "${analysis.title}" selesai dikompilasi dengan 9 bab komprehensif.`,
    });

    res.json({
      success: true,
      analysis: updatedRecord,
      payload: resultPayload,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Update / Save edited analysis content to Drive & Sheets
app.patch('/api/analyses/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analyses = await sheetsRepo.listAnalyses(manifest.spreadsheet_id);
    const analysis = analyses.find((a) => a.id === req.params.id);
    if (!analysis) {
      return res.status(404).json({ error: 'Kajian analisis tidak ditemukan.' });
    }

    const { sections, title, topic } = req.body;
    let payload: AnalysisResultPayload | null = null;

    if (analysis.result_file_id) {
      try {
        payload = await driveService.readJsonFile<AnalysisResultPayload>(analysis.result_file_id);
      } catch {
        // ignore
      }
    }

    if (payload && sections) {
      payload.sections = {
        ...payload.sections,
        ...sections,
      };
      payload.version = (payload.version || 1) + 1;
      payload.updated_at = new Date().toISOString();

      await driveService.saveJsonFile(
        `analisis_${analysis.id}.json`,
        payload,
        manifest.folder_ids['03_Hasil_Analisis'],
        analysis.result_file_id
      );
    }

    const updated = await sheetsRepo.upsertEntity<AnalysisRecord>(
      manifest.spreadsheet_id,
      'Analyses',
      {
        ...analysis,
        title: title || analysis.title,
        topic: topic || analysis.topic,
        updated_at: new Date().toISOString(),
      },
      'id',
      req.body.expected_version
    );

    res.json({ success: true, analysis: updated, payload });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Export Analysis to DOCX or PDF
app.post('/api/analyses/:id/export', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { format = 'DOCX' } = req.body;
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const analyses = await sheetsRepo.listAnalyses(manifest.spreadsheet_id);
    const analysis = analyses.find((a) => a.id === req.params.id);
    if (!analysis || !analysis.result_file_id) {
      return res.status(404).json({ error: 'Hasil kajian belum tersedia untuk diekspor.' });
    }

    const payload = await driveService.readJsonFile<AnalysisResultPayload>(analysis.result_file_id);

    if (format.toUpperCase() === 'PDF') {
      const pdfBuffer = await exportAnalysisToPdf(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(analysis.title.replace(/[^a-zA-Z0-9_-]/g, '_'))}.pdf"`
      );
      return res.send(pdfBuffer);
    } else {
      const docxBuffer = await exportAnalysisToDocx(payload);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(analysis.title.replace(/[^a-zA-Z0-9_-]/g, '_'))}.docx"`
      );
      return res.send(docxBuffer);
    }
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- CATEGORIES ---
app.get('/api/categories', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const categories = await sheetsRepo.listCategories(manifest.spreadsheet_id);
    res.json({ categories });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { name, description = '', parent_id = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });

    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const id = `cat_${Date.now()}`;
    const newCat = await sheetsRepo.upsertEntity(
      manifest.spreadsheet_id,
      'Categories',
      {
        id,
        name,
        description,
        parent_id,
        active: true,
        sort_order: 10,
        updated_at: new Date().toISOString(),
        version: 1,
      },
      'id'
    );
    res.json({ success: true, category: newCat });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/categories/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const updated = await sheetsRepo.upsertEntity(
      manifest.spreadsheet_id,
      'Categories',
      { id: req.params.id, ...req.body },
      'id',
      req.body.expected_version
    );
    res.json({ success: true, category: updated });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    // Check if category is used by any document
    const docs = await sheetsRepo.listDocuments(manifest.spreadsheet_id);
    const isUsed = docs.some((d) => d.category_ids && d.category_ids.includes(req.params.id));
    if (isUsed) {
      return res.status(400).json({
        error: 'Kategori sedang digunakan oleh dokumen. Silakan pindahkan dokumen atau nonaktifkan kategori terlebih dahulu.',
      });
    }

    await sheetsRepo.deleteEntity(manifest.spreadsheet_id, 'Categories', req.params.id, 'id');
    res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- TEMPLATES ---
app.get('/api/templates', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const templates = await sheetsRepo.listTemplates(manifest.spreadsheet_id);
    res.json({ templates });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/templates', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const name = (req.body.name || req.file?.originalname || 'Template Dokumen').trim();
    let fileId = 'custom_template_default';

    if (req.file) {
      const uploaded = await driveService.uploadFile({
        name: req.file.originalname,
        mimeType: req.file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: req.file.buffer,
        parentId: manifest.folder_ids['04_Template_Dokumen'],
      });
      fileId = uploaded.id;
    }

    const tpl = await sheetsRepo.upsertEntity(
      manifest.spreadsheet_id,
      'Templates',
      {
        id: `tpl_${Date.now()}`,
        name,
        type: 'DOCX',
        file_id: fileId,
        active: true,
        is_default: false,
        version: 1,
        updated_at: new Date().toISOString(),
      },
      'id'
    );

    res.json({ success: true, template: tpl });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- DEMO DATA (22. 20 SIMULATED FILES SEED & RESET) ---
app.post('/api/demo/seed', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const result = await seedDemoDataIdempotent(
      driveService,
      sheetsRepo,
      manifest.folder_ids['06_Data_Demo'],
      manifest.folder_ids['02_Indeks_Pengetahuan'],
      manifest.spreadsheet_id,
      auth.userId
    );
    res.json({
      success: true,
      message: `Data demo selesai diproses: ${result.createdCount} file baru dibuat, ${result.reusedCount} file sudah tersedia.`,
      ...result,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/demo/reset', requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as AuthContext;
  try {
    const { driveService, sheetsRepo, manifest } = await getActiveWorkspace(auth);
    const result = await resetDemoData(driveService, sheetsRepo, manifest.spreadsheet_id);
    res.json({
      success: true,
      message: `Berhasil mereset data demo (${result.deletedCount} dokumen simulasi dihapus). Dokumen pengguna tetap aman.`,
      ...result,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ==========================================
// VITE MIDDLEWARE (DEV) & STATIC SERVE (PROD)
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : Number(PORT);
  app.listen(portNumber, '0.0.0.0', () => {
    console.log(`[SPAK-TIK v3.0] Server running on port ${portNumber}`);
  });
}

startServer().catch((err) => {
  console.error('[SPAK-TIK] Failed to start server:', err);
  process.exit(1);
});
