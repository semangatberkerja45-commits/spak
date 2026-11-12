import React, { useState } from 'react';
import {
  Folders,
  FileSpreadsheet,
  Plus,
  Trash2,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { CategoryRecord, TemplateRecord, WorkspaceManifest } from '../types/spak';
import { api } from '../utils/apiClient';

interface SettingsViewProps {
  categories: CategoryRecord[];
  templates: TemplateRecord[];
  manifest: WorkspaceManifest | null;
  onRefresh: () => void;
  onSeedDemo: () => void;
  onResetDemo: () => void;
  isSeeding: boolean;
  onReconcile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  categories,
  templates,
  manifest,
  onRefresh,
  onSeedDemo,
  onResetDemo,
  isSeeding,
  onReconcile,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setIsAddingCat(true);
    try {
      await api.createCategory({
        name: newCatName.trim(),
        description: newCatDesc.trim(),
      });
      setNewCatName('');
      setNewCatDesc('');
      onRefresh();
    } catch (err: any) {
      alert(`Gagal menambah kategori: ${err.message}`);
    } finally {
      setIsAddingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: CategoryRecord) => {
    const confirmed = window.confirm(
      `Hapus kategori "${cat.name}"? Jika masih digunakan oleh dokumen, hapus atau ubah kategori dokumen terlebih dahulu.`
    );
    if (!confirmed) return;

    try {
      const res = await api.deleteCategory(cat.id);
      if (res.error) throw new Error(res.error);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus kategori.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Pengaturan, Template & Sinkronisasi
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Kelola kategori Google Sheets, template dokumen, dan integritas workspace Google Drive
        </p>
      </div>

      {/* Google Drive & Workspace Status */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <HardDrive size={15} className="text-blue-600" />
          <span>Status Workspace Google Drive</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg space-y-1">
            <span className="text-slate-400 font-medium">Folder Utama:</span>
            <div className="font-semibold text-slate-800 font-mono text-[11px]">
              {manifest?.root_folder_id ? `SPAK-TIK (${manifest.root_folder_id})` : 'Memeriksa...'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg space-y-1">
            <span className="text-slate-400 font-medium">Database Spreadsheet:</span>
            <div className="font-semibold text-slate-800 font-mono text-[11px]">
              {manifest?.spreadsheet_id ? `SPAK-TIK_Database (${manifest.spreadsheet_id})` : 'Tersambung'}
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={onReconcile}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            <span>Jalankan Pemeriksaan Konsistensi (Reconcile)</span>
          </button>
        </div>
      </div>

      {/* 21. Kategori Pengetahuan CRUD */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <Folders size={15} className="text-emerald-600" />
          <span>Kategori Pengetahuan Kebijakan (Google Sheets)</span>
        </h3>

        <form onSubmit={handleAddCategory} className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nama Kategori Baru *"
            required
            className="px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            placeholder="Deskripsi singkat kategori..."
            className="px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isAddingCat}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
          >
            <Plus size={14} />
            <span>{isAddingCat ? 'Menyimpan...' : 'Tambah Kategori'}</span>
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-3">Nama Kategori</th>
                <th className="py-2.5 px-3">Deskripsi</th>
                <th className="py-2.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-sm truncate">{c.description || '-'}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => handleDeleteCategory(c)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      title="Hapus Kategori"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 20. Template Dokumen */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <FileSpreadsheet size={15} className="text-purple-600" />
          <span>Template Dokumen Telaahan Staf</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span>{tpl.name}</span>
                  {tpl.is_default && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Format: {tpl.type} · Folder: 04_Template_Dokumen
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 22. Demo Data Controls */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-600" />
          <span>Manajemen Data Simulasi Demo</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Muat 20 file simulasi nyata (4 PDF, 4 DOCX, 4 TXT, 4 XLSX, 4 PPTX) atau reset hanya dokumen demo tanpa memengaruhi file dokumen asli Anda.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSeedDemo}
            disabled={isSeeding}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
          >
            {isSeeding ? 'Memproses 20 Dokumen...' : 'Muat / Sinkron 20 Dokumen Demo'}
          </button>

          <button
            onClick={onResetDemo}
            className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
          >
            Reset Dokumen Demo
          </button>
        </div>
      </div>
    </div>
  );
};
