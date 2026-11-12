import { google, drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  APP_FOLDER_NAME,
  SUBFOLDER_NAMES,
  MANIFEST_FILE_NAME,
  WorkspaceManifest,
} from '../src/types/spak';

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  trashed?: boolean;
}

export class DriveStorageError extends Error {
  public code:
    | 'UNAUTHORIZED'
    | 'TOKEN_EXPIRED'
    | 'PERMISSION_DENIED'
    | 'FILE_NOT_FOUND'
    | 'QUOTA_EXCEEDED'
    | 'NETWORK_ERROR'
    | 'CONCURRENT_MODIFICATION'
    | 'UNKNOWN';
  public status: number;

  constructor(
    message: string,
    code: DriveStorageError['code'] = 'UNKNOWN',
    status: number = 500
  ) {
    super(message);
    this.name = 'DriveStorageError';
    this.code = code;
    this.status = status;
  }
}

function classifyGoogleError(err: any): DriveStorageError {
  if (err instanceof DriveStorageError) return err;
  const status = err?.code || err?.status || err?.response?.status || 500;
  const msg =
    err?.errors?.[0]?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    'Kesalahan layanan Google Drive';

  if (status === 401) {
    if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid Credentials')) {
      return new DriveStorageError('Token akses Google Drive telah kedaluwarsa. Silakan hubungkan ulang.', 'TOKEN_EXPIRED', 401);
    }
    return new DriveStorageError('Tidak terotorisasi untuk mengakses Google Drive.', 'UNAUTHORIZED', 401);
  }
  if (status === 403) {
    if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit')) {
      return new DriveStorageError('Kuota API Google Drive terlampaui. Coba beberapa saat lagi.', 'QUOTA_EXCEEDED', 429);
    }
    return new DriveStorageError(`Izin akses Google Drive ditolak: ${msg}`, 'PERMISSION_DENIED', 403);
  }
  if (status === 404) {
    return new DriveStorageError('File atau folder tidak ditemukan di Google Drive.', 'FILE_NOT_FOUND', 404);
  }
  if (status === 409 || status === 412) {
    return new DriveStorageError('Terjadi konflik perubahan data bersamaan (concurrent modification).', 'CONCURRENT_MODIFICATION', 409);
  }
  if (status === 429) {
    return new DriveStorageError('Batas permintaan Google Drive tercapai (Quota Exceeded).', 'QUOTA_EXCEEDED', 429);
  }
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
    return new DriveStorageError('Gangguan jaringan saat menghubungi Google Drive.', 'NETWORK_ERROR', 503);
  }
  return new DriveStorageError(msg, 'UNKNOWN', typeof status === 'number' ? status : 500);
}

async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  idempotent: boolean = true,
  maxRetries: number = 3
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (rawErr: any) {
      const classified = classifyGoogleError(rawErr);
      attempt++;
      const isTransient =
        classified.code === 'QUOTA_EXCEEDED' ||
        classified.code === 'NETWORK_ERROR' ||
        classified.status >= 500;

      if (!idempotent || !isTransient || attempt > maxRetries) {
        throw classified;
      }
      const delayMs = Math.min(4000, 300 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Temporary OS directory storage used ONLY during automated headless test verification (?autostart=1)
 * or temporary file processing. Cleaned or isolated per workspace.
 */
const SANDBOX_ROOT = path.join(os.tmpdir(), 'spak-tik-ephemeral-workspace');

interface SandboxFileEntry {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  trashed: boolean;
  diskPath?: string;
}

class EphemeralSandboxDrive {
  private indexFile: string;
  private filesDir: string;

  constructor() {
    this.filesDir = path.join(SANDBOX_ROOT, 'blobs');
    this.indexFile = path.join(SANDBOX_ROOT, 'drive_index.json');
    fs.mkdirSync(this.filesDir, { recursive: true });
  }

  private loadEntries(): Record<string, SandboxFileEntry> {
    if (!fs.existsSync(this.indexFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveEntries(entries: Record<string, SandboxFileEntry>) {
    fs.writeFileSync(this.indexFile, JSON.stringify(entries, null, 2), 'utf-8');
  }

  createFolder(name: string, parentId?: string): DriveFileMeta {
    const entries = this.loadEntries();
    const existing = Object.values(entries).find(
      (e) =>
        !e.trashed &&
        e.name === name &&
        e.mimeType === 'application/vnd.google-apps.folder' &&
        (!parentId || e.parents.includes(parentId))
    );
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        mimeType: existing.mimeType,
        parents: existing.parents,
        modifiedTime: existing.modifiedTime,
      };
    }
    const id = `drv_fld_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const entry: SandboxFileEntry = {
      id,
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : ['root'],
      modifiedTime: now,
      trashed: false,
    };
    entries[id] = entry;
    this.saveEntries(entries);
    return { id, name, mimeType: entry.mimeType, parents: entry.parents, modifiedTime: now };
  }

  findFolder(name: string, parentId?: string): DriveFileMeta | null {
    const entries = this.loadEntries();
    const found = Object.values(entries).find(
      (e) =>
        !e.trashed &&
        e.name === name &&
        e.mimeType === 'application/vnd.google-apps.folder' &&
        (!parentId || e.parents.includes(parentId))
    );
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      mimeType: found.mimeType,
      parents: found.parents,
      modifiedTime: found.modifiedTime,
    };
  }

  uploadFile(params: {
    name: string;
    mimeType: string;
    content: Buffer | string;
    parentId?: string;
    existingFileId?: string;
  }): DriveFileMeta {
    const entries = this.loadEntries();
    const id = params.existingFileId || `drv_file_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const diskPath = path.join(this.filesDir, id);
    const buf = Buffer.isBuffer(params.content)
      ? params.content
      : Buffer.from(params.content, 'utf-8');
    fs.writeFileSync(diskPath, buf);

    const prev = entries[id];
    const entry: SandboxFileEntry = {
      id,
      name: params.name || prev?.name || 'unnamed',
      mimeType: params.mimeType || prev?.mimeType || 'application/octet-stream',
      parents: params.parentId ? [params.parentId] : prev?.parents || ['root'],
      modifiedTime: now,
      trashed: false,
      diskPath,
    };
    entries[id] = entry;
    this.saveEntries(entries);
    return {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      parents: entry.parents,
      modifiedTime: entry.modifiedTime,
      size: String(buf.length),
    };
  }

  downloadFile(fileId: string): Buffer {
    const entries = this.loadEntries();
    const entry = entries[fileId];
    if (!entry || entry.trashed || !entry.diskPath || !fs.existsSync(entry.diskPath)) {
      throw new DriveStorageError(`File ${fileId} tidak ditemukan.`, 'FILE_NOT_FOUND', 404);
    }
    return fs.readFileSync(entry.diskPath);
  }

  getFileMetadata(fileId: string): DriveFileMeta {
    const entries = this.loadEntries();
    const entry = entries[fileId];
    if (!entry || entry.trashed) {
      throw new DriveStorageError(`File ${fileId} tidak ditemukan.`, 'FILE_NOT_FOUND', 404);
    }
    return {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      parents: entry.parents,
      modifiedTime: entry.modifiedTime,
      trashed: entry.trashed,
    };
  }

  updateFileMetadata(fileId: string, updates: { name?: string; trashed?: boolean; parentId?: string }): DriveFileMeta {
    const entries = this.loadEntries();
    const entry = entries[fileId];
    if (!entry) {
      throw new DriveStorageError(`File ${fileId} tidak ditemukan.`, 'FILE_NOT_FOUND', 404);
    }
    if (updates.name !== undefined) entry.name = updates.name;
    if (updates.trashed !== undefined) entry.trashed = updates.trashed;
    if (updates.parentId !== undefined) entry.parents = [updates.parentId];
    entry.modifiedTime = new Date().toISOString();
    entries[fileId] = entry;
    this.saveEntries(entries);
    return {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      parents: entry.parents,
      modifiedTime: entry.modifiedTime,
      trashed: entry.trashed,
    };
  }

  deleteFile(fileId: string): void {
    const entries = this.loadEntries();
    const entry = entries[fileId];
    if (!entry) return;
    if (entry.diskPath && fs.existsSync(entry.diskPath)) {
      try {
        fs.unlinkSync(entry.diskPath);
      } catch {
        // ignore
      }
    }
    delete entries[fileId];
    this.saveEntries(entries);
  }

  listFiles(parentId?: string, mimeType?: string): DriveFileMeta[] {
    const entries = this.loadEntries();
    return Object.values(entries)
      .filter((e) => {
        if (e.trashed) return false;
        if (parentId && !e.parents.includes(parentId)) return false;
        if (mimeType && e.mimeType !== mimeType) return false;
        return true;
      })
      .map((e) => ({
        id: e.id,
        name: e.name,
        mimeType: e.mimeType,
        parents: e.parents,
        modifiedTime: e.modifiedTime,
      }));
  }
}

const sandboxDrive = new EphemeralSandboxDrive();

export class DriveStorageService {
  private accessToken: string;
  private isSandbox: boolean;
  private driveClient: drive_v3.Drive | null = null;

  constructor(accessToken: string, isSandbox: boolean = false) {
    this.accessToken = accessToken;
    this.isSandbox = isSandbox;
    if (!isSandbox && accessToken) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      this.driveClient = google.drive({ version: 'v3', auth });
    }
  }

  private ensureDrive(): drive_v3.Drive {
    if (!this.driveClient) {
      throw new DriveStorageError(
        'Koneksi Google Drive belum terautentikasi.',
        'UNAUTHORIZED',
        401
      );
    }
    return this.driveClient;
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.createFolder(name, parentId);
    }
    // Idempotent check before creating folder to prevent duplicates
    const existing = await this.findAppFolder(name, parentId);
    if (existing) return existing;

    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : undefined,
        },
        fields: 'id, name, mimeType, parents, modifiedTime, webViewLink',
      });
      if (!res.data.id) {
        throw new DriveStorageError(`Gagal membuat folder ${name} di Google Drive.`);
      }
      return {
        id: res.data.id,
        name: res.data.name || name,
        mimeType: res.data.mimeType || 'application/vnd.google-apps.folder',
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
        webViewLink: res.data.webViewLink || undefined,
      };
    }, false);
  }

  async findAppFolder(name: string = APP_FOLDER_NAME, parentId?: string): Promise<DriveFileMeta | null> {
    if (this.isSandbox) {
      return sandboxDrive.findFolder(name, parentId);
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const escapedName = name.replace(/'/g, "\\'");
      let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;
      if (parentId) {
        q += ` and '${parentId}' in parents`;
      }
      const res = await drive.files.list({
        q,
        pageSize: 5,
        fields: 'files(id, name, mimeType, parents, modifiedTime, webViewLink)',
      });
      const folder = res.data.files?.[0];
      if (!folder || !folder.id) return null;
      return {
        id: folder.id,
        name: folder.name || name,
        mimeType: folder.mimeType || 'application/vnd.google-apps.folder',
        parents: folder.parents || undefined,
        modifiedTime: folder.modifiedTime || undefined,
        webViewLink: folder.webViewLink || undefined,
      };
    }, true);
  }

  async uploadFile(params: {
    name: string;
    mimeType: string;
    content: Buffer | string;
    parentId?: string;
  }): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.uploadFile(params);
    }
    const drive = this.ensureDrive();
    const buffer = Buffer.isBuffer(params.content)
      ? params.content
      : Buffer.from(params.content, 'utf-8');

    return withExponentialBackoff(async () => {
      const res = await drive.files.create({
        requestBody: {
          name: params.name,
          parents: params.parentId ? [params.parentId] : undefined,
        },
        media: {
          mimeType: params.mimeType,
          body: Readable.from(buffer),
        },
        fields: 'id, name, mimeType, parents, modifiedTime, size, webViewLink',
      });
      if (!res.data.id) {
        throw new DriveStorageError(`Gagal mengunggah file ${params.name} ke Google Drive.`);
      }
      return {
        id: res.data.id,
        name: res.data.name || params.name,
        mimeType: res.data.mimeType || params.mimeType,
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
        size: res.data.size || undefined,
        webViewLink: res.data.webViewLink || undefined,
      };
    }, false);
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (this.isSandbox) {
      return sandboxDrive.downloadFile(fileId);
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(res.data as ArrayBuffer);
    }, true);
  }

  async updateFileMetadata(
    fileId: string,
    metadata: { name?: string; description?: string }
  ): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.updateFileMetadata(fileId, { name: metadata.name });
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const res = await drive.files.update({
        fileId,
        requestBody: {
          name: metadata.name,
          description: metadata.description,
        },
        fields: 'id, name, mimeType, parents, modifiedTime, webViewLink',
      });
      return {
        id: res.data.id || fileId,
        name: res.data.name || metadata.name || '',
        mimeType: res.data.mimeType || 'application/octet-stream',
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
        webViewLink: res.data.webViewLink || undefined,
      };
    }, true);
  }

  async replaceFileContent(
    fileId: string,
    content: Buffer | string,
    mimeType: string = 'application/octet-stream',
    name?: string
  ): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      const existing = sandboxDrive.getFileMetadata(fileId);
      return sandboxDrive.uploadFile({
        name: name || existing.name,
        mimeType: mimeType || existing.mimeType,
        content,
        existingFileId: fileId,
      });
    }
    const drive = this.ensureDrive();
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    return withExponentialBackoff(async () => {
      const res = await drive.files.update({
        fileId,
        requestBody: name ? { name } : undefined,
        media: {
          mimeType,
          body: Readable.from(buffer),
        },
        fields: 'id, name, mimeType, parents, modifiedTime, size, webViewLink',
      });
      return {
        id: res.data.id || fileId,
        name: res.data.name || name || '',
        mimeType: res.data.mimeType || mimeType,
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
        size: res.data.size || undefined,
        webViewLink: res.data.webViewLink || undefined,
      };
    }, true);
  }

  async moveFile(fileId: string, newParentId: string): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.updateFileMetadata(fileId, { parentId: newParentId });
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const current = await drive.files.get({
        fileId,
        fields: 'parents',
      });
      const previousParents = (current.data.parents || []).join(',');
      const res = await drive.files.update({
        fileId,
        addParents: newParentId,
        removeParents: previousParents || undefined,
        fields: 'id, name, mimeType, parents, modifiedTime',
      });
      return {
        id: res.data.id || fileId,
        name: res.data.name || '',
        mimeType: res.data.mimeType || '',
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
      };
    }, true);
  }

  async archiveFile(fileId: string): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.updateFileMetadata(fileId, { trashed: true });
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const res = await drive.files.update({
        fileId,
        requestBody: { trashed: true },
        fields: 'id, name, mimeType, trashed',
      });
      return {
        id: res.data.id || fileId,
        name: res.data.name || '',
        mimeType: res.data.mimeType || '',
        trashed: Boolean(res.data.trashed),
      };
    }, true);
  }

  async deleteFile(fileId: string): Promise<void> {
    if (this.isSandbox) {
      sandboxDrive.deleteFile(fileId);
      return;
    }
    const drive = this.ensureDrive();
    await withExponentialBackoff(async () => {
      await drive.files.delete({ fileId });
    }, true);
  }

  async listFiles(parentId?: string, mimeType?: string): Promise<DriveFileMeta[]> {
    if (this.isSandbox) {
      return sandboxDrive.listFiles(parentId, mimeType);
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const clauses = ['trashed = false'];
      if (parentId) clauses.push(`'${parentId}' in parents`);
      if (mimeType) clauses.push(`mimeType = '${mimeType}'`);
      const res = await drive.files.list({
        q: clauses.join(' and '),
        pageSize: 200,
        fields: 'files(id, name, mimeType, parents, modifiedTime, size, webViewLink)',
      });
      return (res.data.files || []).map((f) => ({
        id: f.id || '',
        name: f.name || '',
        mimeType: f.mimeType || '',
        parents: f.parents || undefined,
        modifiedTime: f.modifiedTime || undefined,
        size: f.size || undefined,
        webViewLink: f.webViewLink || undefined,
      }));
    }, true);
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMeta> {
    if (this.isSandbox) {
      return sandboxDrive.getFileMetadata(fileId);
    }
    const drive = this.ensureDrive();
    return withExponentialBackoff(async () => {
      const res = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, parents, modifiedTime, size, webViewLink, trashed',
      });
      if (!res.data.id || res.data.trashed) {
        throw new DriveStorageError(`File ${fileId} tidak ditemukan atau telah dihapus.`, 'FILE_NOT_FOUND', 404);
      }
      return {
        id: res.data.id,
        name: res.data.name || '',
        mimeType: res.data.mimeType || '',
        parents: res.data.parents || undefined,
        modifiedTime: res.data.modifiedTime || undefined,
        size: res.data.size || undefined,
        webViewLink: res.data.webViewLink || undefined,
        trashed: Boolean(res.data.trashed),
      };
    }, true);
  }

  async saveJsonFile<T>(
    name: string,
    data: T,
    parentId?: string,
    existingFileId?: string
  ): Promise<DriveFileMeta> {
    const jsonString = JSON.stringify(data, null, 2);
    if (existingFileId) {
      try {
        return await this.replaceFileContent(
          existingFileId,
          jsonString,
          'application/json',
          name
        );
      } catch (err: any) {
        if (err?.code !== 'FILE_NOT_FOUND') throw err;
      }
    }
    // Check if a JSON file with this name already exists in parentId
    const existingList = await this.listFiles(parentId, 'application/json');
    const found = existingList.find((f) => f.name === name);
    if (found) {
      return this.replaceFileContent(found.id, jsonString, 'application/json', name);
    }
    return this.uploadFile({
      name,
      mimeType: 'application/json',
      content: jsonString,
      parentId,
    });
  }

  async readJsonFile<T>(fileId: string): Promise<T> {
    const buf = await this.downloadFile(fileId);
    try {
      return JSON.parse(buf.toString('utf-8')) as T;
    } catch {
      throw new DriveStorageError('Format file JSON di Google Drive tidak valid.', 'UNKNOWN', 500);
    }
  }

  /**
   * Reads or recovers the SPAK-TIK WorkspaceManifest from Google Drive.
   */
  async loadManifest(): Promise<{ manifest: WorkspaceManifest | null; manifestFileId?: string }> {
    const rootFolder = await this.findAppFolder(APP_FOLDER_NAME);
    if (!rootFolder) return { manifest: null };

    const files = await this.listFiles(rootFolder.id, 'application/json');
    const manifestFile = files.find((f) => f.name === MANIFEST_FILE_NAME);
    if (!manifestFile) return { manifest: null };

    try {
      const manifest = await this.readJsonFile<WorkspaceManifest>(manifestFile.id);
      return { manifest, manifestFileId: manifestFile.id };
    } catch {
      return { manifest: null };
    }
  }

  /**
   * Idempotent initialization of SPAK-TIK root folder, 7 subfolders, and manifest.
   */
  async initializeWorkspaceFolders(
    ownerUserId: string,
    ensureDatabaseSpreadsheet: (databaseFolderId: string, existingSpreadsheetId?: string) => Promise<string>
  ): Promise<WorkspaceManifest> {
    const existing = await this.loadManifest();
    let rootFolderId = existing.manifest?.root_folder_id;

    if (rootFolderId) {
      try {
        await this.getFileMetadata(rootFolderId);
      } catch {
        rootFolderId = undefined;
      }
    }

    if (!rootFolderId) {
      const rootFolder = await this.createFolder(APP_FOLDER_NAME);
      rootFolderId = rootFolder.id;
    }

    const folderIds: Record<string, string> = {
      ...(existing.manifest?.folder_ids || {}),
    };

    const requiredSubfolders = Object.values(SUBFOLDER_NAMES);
    for (const subName of requiredSubfolders) {
      let subId = folderIds[subName];
      if (subId) {
        try {
          await this.getFileMetadata(subId);
        } catch {
          subId = '';
        }
      }
      if (!subId) {
        const created = await this.createFolder(subName, rootFolderId);
        subId = created.id;
      }
      folderIds[subName] = subId;
    }

    const databaseFolderId = folderIds[SUBFOLDER_NAMES.DATABASE];
    const spreadsheetId = await ensureDatabaseSpreadsheet(
      databaseFolderId,
      existing.manifest?.spreadsheet_id
    );

    const now = new Date().toISOString();
    const manifest: WorkspaceManifest = {
      application_version: '3.0.0',
      owner_google_user_id: ownerUserId,
      root_folder_id: rootFolderId,
      folder_ids: {
        '01_Pusat_Pengetahuan': folderIds['01_Pusat_Pengetahuan'],
        '02_Indeks_Pengetahuan': folderIds['02_Indeks_Pengetahuan'],
        '03_Hasil_Analisis': folderIds['03_Hasil_Analisis'],
        '04_Template_Dokumen': folderIds['04_Template_Dokumen'],
        '05_Database': folderIds['05_Database'],
        '06_Data_Demo': folderIds['06_Data_Demo'],
        '07_Backup': folderIds['07_Backup'],
      },
      spreadsheet_id: spreadsheetId,
      schema_version: '3.0',
      initialized_at: existing.manifest?.initialized_at || now,
      updated_at: now,
    };

    await this.saveJsonFile(
      MANIFEST_FILE_NAME,
      manifest,
      rootFolderId,
      existing.manifestFileId
    );

    return manifest;
  }
}
