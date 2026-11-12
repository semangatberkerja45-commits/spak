import { google, sheets_v4 } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  DATABASE_SPREADSHEET_NAME,
  WORKSHEET_NAMES,
  WorksheetName,
  DocumentRecord,
  CategoryRecord,
  AnalysisRecord,
  AnalysisSourceRecord,
  ConversationRecord,
  TemplateRecord,
  SettingRecord,
  AuditLogRecord,
} from '../src/types/spak';
import { DriveStorageService, DriveStorageError } from './driveStorageService';

export const WORKSHEET_HEADERS: Record<WorksheetName, string[]> = {
  Documents: [
    'id',
    'file_id',
    'title',
    'file_name',
    'mime_type',
    'category_ids',
    'source_agency',
    'document_date',
    'description',
    'extracted_file_id',
    'index_version',
    'processing_status',
    'is_demo',
    'owner_id',
    'created_at',
    'updated_at',
    'version',
  ],
  Categories: [
    'id',
    'name',
    'description',
    'parent_id',
    'active',
    'sort_order',
    'updated_at',
    'version',
  ],
  Analyses: [
    'id',
    'title',
    'topic',
    'type',
    'depth',
    'selected_document_ids',
    'result_file_id',
    'status',
    'created_at',
    'updated_at',
    'version',
  ],
  AnalysisSources: [
    'id',
    'analysis_id',
    'document_id',
    'source_location',
    'claim_id',
    'verification_status',
  ],
  Conversations: [
    'id',
    'title',
    'messages_file_id',
    'created_at',
    'updated_at',
  ],
  Templates: [
    'id',
    'name',
    'type',
    'file_id',
    'active',
    'is_default',
    'version',
    'updated_at',
  ],
  Settings: ['key', 'value', 'updated_at'],
  AuditLogs: [
    'id',
    'timestamp',
    'action',
    'entity_type',
    'entity_id',
    'status',
    'details',
  ],
};

const DEFAULT_CATEGORIES: CategoryRecord[] = [
  {
    id: 'cat-infra-telko',
    name: 'Infrastruktur Telekomunikasi',
    description: 'Kebijakan spektrum frekuensi, BTS 4G/5G, jaringan tulang punggung Palapa Ring, dan konektivitas wilayah 3T.',
    parent_id: '',
    active: true,
    sort_order: 1,
    updated_at: '2026-01-10T08:00:00.000Z',
    version: 1,
  },
  {
    id: 'cat-pdn',
    name: 'Pusat Data Pemerintah',
    description: 'Tata kelola Pusat Data Nasional (PDN), interoperabilitas SPBE, standar keamanan siber, dan redundansi komputasi.',
    parent_id: '',
    active: true,
    sort_order: 2,
    updated_at: '2026-01-10T08:00:00.000Z',
    version: 1,
  },
  {
    id: 'cat-kawasan-pemerintahan',
    name: 'Infrastruktur Digital Kawasan Pemerintahan',
    description: 'Jaringan intra pemerintah terpadu, smart command center, dan ketahanan komunikasi strategis pusat pemerintahan.',
    parent_id: '',
    active: true,
    sort_order: 3,
    updated_at: '2026-01-10T08:00:00.000Z',
    version: 1,
  },
  {
    id: 'cat-skkl',
    name: 'Sistem Komunikasi Kabel Laut',
    description: 'Koridor alur kabel bawah laut (SKKL), pelindungan infrastruktur vital nasional, dan perizinan lintas kementerian.',
    parent_id: '',
    active: true,
    sort_order: 4,
    updated_at: '2026-01-10T08:00:00.000Z',
    version: 1,
  },
];

const DEFAULT_TEMPLATES: TemplateRecord[] = [
  {
    id: 'tpl-telaahan-staf-polkam',
    name: 'Format Standar Telaahan Staf & Kajian Kebijakan Kemenko Polkam',
    type: 'DOCX',
    file_id: 'builtin_default_docx_template',
    active: true,
    is_default: true,
    version: 1,
    updated_at: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'tpl-policy-brief-eksekutif',
    name: 'Policy Brief Eksekutif Asdep Telekomunikasi dan Informatika',
    type: 'DOCX',
    file_id: 'builtin_policy_brief_template',
    active: true,
    is_default: false,
    version: 1,
    updated_at: '2026-01-10T08:00:00.000Z',
  },
];

const SANDBOX_SHEETS_FILE = path.join(
  os.tmpdir(),
  'spak-tik-ephemeral-workspace',
  'spak_tik_sheets_db.json'
);

interface SandboxSheetsStore {
  spreadsheetId: string;
  tables: Record<WorksheetName, Record<string, any>[]>;
}

function rowToObject<T>(headers: string[], row: any[]): T {
  const obj: any = {};
  headers.forEach((h, i) => {
    const raw = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
    if (h === 'is_demo' || h === 'active' || h === 'is_default') {
      obj[h] = raw === 'true' || raw === 'TRUE' || raw === '1';
    } else if (h === 'version' || h === 'sort_order') {
      obj[h] = Number(raw || 1);
    } else {
      obj[h] = raw;
    }
  });
  return obj as T;
}

function objectToRow(headers: string[], item: Record<string, any>): string[] {
  return headers.map((h) => {
    const val = item[h];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  });
}

// Short-lived in-memory cache per spreadsheetId to optimize batch reads
const sheetMemoryCache = new Map<
  string,
  { timestamp: number; tables: Record<WorksheetName, any[]> }
>();
const CACHE_TTL_MS = 12_000;

export class SheetsRepository {
  private accessToken: string;
  private isSandbox: boolean;
  private sheetsClient: sheets_v4.Sheets | null = null;
  private driveService: DriveStorageService;

  constructor(accessToken: string, isSandbox: boolean = false) {
    this.accessToken = accessToken;
    this.isSandbox = isSandbox;
    this.driveService = new DriveStorageService(accessToken, isSandbox);
    if (!isSandbox && accessToken) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      this.sheetsClient = google.sheets({ version: 'v4', auth });
    }
  }

  private ensureSheets(): sheets_v4.Sheets {
    if (!this.sheetsClient) {
      throw new DriveStorageError(
        'Koneksi Google Sheets belum terautentikasi.',
        'UNAUTHORIZED',
        401
      );
    }
    return this.sheetsClient;
  }

  private loadSandboxStore(): SandboxSheetsStore {
    fs.mkdirSync(path.dirname(SANDBOX_SHEETS_FILE), { recursive: true });
    if (fs.existsSync(SANDBOX_SHEETS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(SANDBOX_SHEETS_FILE, 'utf-8'));
      } catch {
        // recreate below
      }
    }
    const initial: SandboxSheetsStore = {
      spreadsheetId: 'sheet_spak_tik_database_v3',
      tables: {
        Documents: [],
        Categories: [...DEFAULT_CATEGORIES],
        Analyses: [],
        AnalysisSources: [],
        Conversations: [],
        Templates: [...DEFAULT_TEMPLATES],
        Settings: [
          {
            key: 'workspace_name',
            value: 'Asdep Koordinasi Telekomunikasi dan Informatika — Kemenko Polkam',
            updated_at: new Date().toISOString(),
          },
          {
            key: 'citation_mode',
            value: 'END_ONLY_STRICT',
            updated_at: new Date().toISOString(),
          },
        ],
        AuditLogs: [],
      },
    };
    fs.writeFileSync(SANDBOX_SHEETS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  private saveSandboxStore(store: SandboxSheetsStore) {
    fs.mkdirSync(path.dirname(SANDBOX_SHEETS_FILE), { recursive: true });
    fs.writeFileSync(SANDBOX_SHEETS_FILE, JSON.stringify(store, null, 2), 'utf-8');
  }

  /**
   * Ensures SPAK-TIK_Database exists in 05_Database with all 8 required worksheets and headers.
   */
  async ensureDatabaseSpreadsheet(
    databaseFolderId: string,
    existingSpreadsheetId?: string
  ): Promise<string> {
    if (this.isSandbox) {
      const store = this.loadSandboxStore();
      return store.spreadsheetId;
    }

    const sheets = this.ensureSheets();
    let spreadsheetId = existingSpreadsheetId;

    if (spreadsheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId });
      } catch {
        spreadsheetId = undefined;
      }
    }

    if (!spreadsheetId) {
      // Search inside 05_Database folder first
      const existingFiles = await this.driveService.listFiles(
        databaseFolderId,
        'application/vnd.google-apps.spreadsheet'
      );
      const found = existingFiles.find((f) => f.name === DATABASE_SPREADSHEET_NAME);
      if (found) {
        spreadsheetId = found.id;
      }
    }

    if (!spreadsheetId) {
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: DATABASE_SPREADSHEET_NAME,
          },
          sheets: WORKSHEET_NAMES.map((title) => ({
            properties: { title },
          })),
        },
      });
      spreadsheetId = created.data.spreadsheetId || '';
      if (!spreadsheetId) {
        throw new DriveStorageError('Gagal membuat spreadsheet SPAK-TIK_Database.');
      }
      // Move into 05_Database folder
      await this.driveService.moveFile(spreadsheetId, databaseFolderId);
    }

    // Verify all 8 worksheets exist
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheetTitles = new Set(
      (meta.data.sheets || []).map((s) => s.properties?.title || '')
    );

    const missingTabs = WORKSHEET_NAMES.filter((t) => !existingSheetTitles.has(t));
    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingTabs.map((title) => ({
            addSheet: { properties: { title } },
          })),
        },
      });
    }

    // Read row 1 of all worksheets to ensure headers and seed defaults if empty
    const ranges = WORKSHEET_NAMES.map((name) => `${name}!A1:Z5`);
    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const valueUpdates: sheets_v4.Schema$ValueRange[] = [];
    const valueRanges = batchRes.data.valueRanges || [];

    WORKSHEET_NAMES.forEach((wsName, idx) => {
      const rows = valueRanges[idx]?.values || [];
      const headers = WORKSHEET_HEADERS[wsName];
      if (rows.length === 0) {
        const initialRows: string[][] = [headers];
        if (wsName === 'Categories') {
          DEFAULT_CATEGORIES.forEach((cat) => {
            initialRows.push(objectToRow(headers, cat));
          });
        } else if (wsName === 'Templates') {
          DEFAULT_TEMPLATES.forEach((tpl) => {
            initialRows.push(objectToRow(headers, tpl));
          });
        } else if (wsName === 'Settings') {
          initialRows.push([
            'workspace_name',
            'Asdep Koordinasi Telekomunikasi dan Informatika — Kemenko Polkam',
            new Date().toISOString(),
          ]);
          initialRows.push(['citation_mode', 'END_ONLY_STRICT', new Date().toISOString()]);
        }
        valueUpdates.push({
          range: `${wsName}!A1`,
          values: initialRows,
        });
      }
    });

    if (valueUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: valueUpdates,
        },
      });
    }

    sheetMemoryCache.delete(spreadsheetId);
    return spreadsheetId;
  }

  /**
   * Batch reads all 8 worksheets at once and caches briefly in memory.
   */
  async getAllTables(
    spreadsheetId: string,
    forceRefresh: boolean = false
  ): Promise<Record<WorksheetName, any[]>> {
    if (this.isSandbox) {
      return this.loadSandboxStore().tables;
    }

    const cached = sheetMemoryCache.get(spreadsheetId);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tables;
    }

    const sheets = this.ensureSheets();
    const ranges = WORKSHEET_NAMES.map((name) => `${name}!A1:Z2000`);
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    const tables: Record<WorksheetName, any[]> = {
      Documents: [],
      Categories: [],
      Analyses: [],
      AnalysisSources: [],
      Conversations: [],
      Templates: [],
      Settings: [],
      AuditLogs: [],
    };

    const valueRanges = res.data.valueRanges || [];
    WORKSHEET_NAMES.forEach((wsName, idx) => {
      const rows = valueRanges[idx]?.values || [];
      if (rows.length <= 1) {
        tables[wsName] = [];
        return;
      }
      const headers = WORKSHEET_HEADERS[wsName];
      const items: any[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0 || !row[0]) continue;
        items.push(rowToObject(headers, row));
      }
      tables[wsName] = items;
    });

    sheetMemoryCache.set(spreadsheetId, {
      timestamp: Date.now(),
      tables,
    });
    return tables;
  }

  /**
   * Writes an entire worksheet table cleanly using clear + batchUpdate.
   */
  async writeWorksheet<T extends Record<string, any>>(
    spreadsheetId: string,
    worksheet: WorksheetName,
    items: T[]
  ): Promise<void> {
    if (this.isSandbox) {
      const store = this.loadSandboxStore();
      store.tables[worksheet] = items;
      this.saveSandboxStore(store);
      return;
    }

    const sheets = this.ensureSheets();
    const headers = WORKSHEET_HEADERS[worksheet];
    const rows: string[][] = [headers, ...items.map((item) => objectToRow(headers, item))];

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${worksheet}!A1:Z2000`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${worksheet}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    });

    sheetMemoryCache.delete(spreadsheetId);
  }

  async getTable<T>(spreadsheetId: string, worksheet: WorksheetName): Promise<T[]> {
    const all = await this.getAllTables(spreadsheetId);
    return (all[worksheet] || []) as T[];
  }

  async upsertEntity<T extends Record<string, any>>(
    spreadsheetId: string,
    worksheet: WorksheetName,
    entity: T,
    primaryKeyField: string = 'id',
    expectedVersion?: number
  ): Promise<T> {
    const items = await this.getTable<T>(spreadsheetId, worksheet);
    const pkValue = entity[primaryKeyField];
    const idx = items.findIndex((item) => item[primaryKeyField] === pkValue);

    if (idx >= 0) {
      const current = items[idx];
      if (
        expectedVersion !== undefined &&
        current.version !== undefined &&
        Number(current.version) !== Number(expectedVersion)
      ) {
        throw new DriveStorageError(
          `Konflik versi terdeteksi pada ${worksheet} (versi saat ini: ${current.version}, versi permintaan: ${expectedVersion}). Silakan muat ulang data sebelum menyimpan.`,
          'CONCURRENT_MODIFICATION',
          409
        );
      }
      const updated: T = {
        ...current,
        ...entity,
        version: current.version !== undefined ? Number(current.version) + 1 : 1,
        updated_at: new Date().toISOString(),
      };
      items[idx] = updated;
      await this.writeWorksheet(spreadsheetId, worksheet, items);
      return updated;
    } else {
      const created: T = {
        ...entity,
        ...(entity.version !== undefined ? { version: Number(entity.version) || 1 } : {}),
      };
      items.push(created);
      await this.writeWorksheet(spreadsheetId, worksheet, items);
      return created;
    }
  }

  async deleteEntity(
    spreadsheetId: string,
    worksheet: WorksheetName,
    pkValue: string,
    primaryKeyField: string = 'id'
  ): Promise<boolean> {
    const items = await this.getTable<Record<string, any>>(spreadsheetId, worksheet);
    const filtered = items.filter((item) => item[primaryKeyField] !== pkValue);
    if (filtered.length === items.length) return false;
    await this.writeWorksheet(spreadsheetId, worksheet, filtered);
    return true;
  }

  async appendAuditLog(
    spreadsheetId: string,
    entry: Omit<AuditLogRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    const log: AuditLogRecord = {
      id: `log_${crypto.randomUUID().slice(0, 12)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    try {
      if (this.isSandbox) {
        const store = this.loadSandboxStore();
        store.tables.AuditLogs.unshift(log);
        store.tables.AuditLogs = store.tables.AuditLogs.slice(0, 250);
        this.saveSandboxStore(store);
        return;
      }
      const sheets = this.ensureSheets();
      const headers = WORKSHEET_HEADERS.AuditLogs;
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'AuditLogs!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [objectToRow(headers, log)],
        },
      });
      sheetMemoryCache.delete(spreadsheetId);
    } catch {
      // Do not fail primary operation if audit log append encounters transient issue
    }
  }

  // Typed helper methods
  async listDocuments(spreadsheetId: string): Promise<DocumentRecord[]> {
    return this.getTable<DocumentRecord>(spreadsheetId, 'Documents');
  }

  async listCategories(spreadsheetId: string): Promise<CategoryRecord[]> {
    return this.getTable<CategoryRecord>(spreadsheetId, 'Categories');
  }

  async listAnalyses(spreadsheetId: string): Promise<AnalysisRecord[]> {
    return this.getTable<AnalysisRecord>(spreadsheetId, 'Analyses');
  }

  async listAnalysisSources(spreadsheetId: string, analysisId?: string): Promise<AnalysisSourceRecord[]> {
    const all = await this.getTable<AnalysisSourceRecord>(spreadsheetId, 'AnalysisSources');
    return analysisId ? all.filter((s) => s.analysis_id === analysisId) : all;
  }

  async listConversations(spreadsheetId: string): Promise<ConversationRecord[]> {
    return this.getTable<ConversationRecord>(spreadsheetId, 'Conversations');
  }

  async listTemplates(spreadsheetId: string): Promise<TemplateRecord[]> {
    return this.getTable<TemplateRecord>(spreadsheetId, 'Templates');
  }

  async listSettings(spreadsheetId: string): Promise<SettingRecord[]> {
    return this.getTable<SettingRecord>(spreadsheetId, 'Settings');
  }

  async listAuditLogs(spreadsheetId: string): Promise<AuditLogRecord[]> {
    return this.getTable<AuditLogRecord>(spreadsheetId, 'AuditLogs');
  }
}
