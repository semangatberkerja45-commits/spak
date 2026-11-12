import React, { useState } from 'react';
import {
  Upload,
  Search,
  Filter,
  FileText,
  Trash2,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  X,
  RefreshCw,
} from 'lucide-react';
import { DocumentRecord, CategoryRecord } from '../types/spak';
import { api } from '../utils/apiClient';

interface KnowledgeCenterProps {
  documents: DocumentRecord[];
  categories: CategoryRecord[];
  onRefresh: () => void;
  onSelectDocumentForAnalysis?: (docId: string) => void;
}

export const KnowledgeCenter: React.FC<KnowledgeCenterProps> = ({
  documents,
  categories,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Upload Form State
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [sourceAgency, setSourceAgency] = useState('Kemenko Polkam');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [docDesc, setDocDesc] = useState('');

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.source_agency && doc.source_agency.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' ||
      (doc.category_ids && doc.category_ids.includes(selectedCategory));

    return matchesSearch && matchesCategory;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileToUpload(file);
      if (!docTitle) {
        setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('title', docTitle);
    formData.append('source_agency', sourceAgency);
    formData.append('document_date', docDate);
    formData.append('description', docDesc);
    formData.append('category_ids', JSON.stringify([selectedCategory !== 'ALL' ? selectedCategory : 'Umum']));

    try {
      const res = await api.uploadDocument(formData);
      if (res.error) throw new Error(res.error);
      setUploadSuccess(`Dokumen "${docTitle}" berhasil disimpan ke Google Drive dan diindeks (${res.chunksCount || 0} cuplikan).`);
      setFileToUpload(null);
      setDocTitle('');
      setDocDesc('');
      onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Confirmation Modal
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const confirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    setUploadError(null);
    try {
      await api.deleteDocument(docToDelete.id);
      setUploadSuccess(`Dokumen "${docToDelete.title}" berhasil dihapus dari Google Drive.`);
      setTimeout(() => setUploadSuccess(null), 3500);
      setDocToDelete(null);
      onRefresh();
    } catch (err: any) {
      setUploadError(`Gagal menghapus dokumen: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenPreview = async (doc: DocumentRecord) => {
    setPreviewLoading(true);
    try {
      const res = await api.getDocument(doc.id);
      setPreviewDoc(res);
    } catch (err: any) {
      setUploadError('Gagal memuat detail pratinjau dokumen.');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Pusat Pengetahuan (Knowledge Center)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen dokumen kebijakan 5 format: PDF, DOCX, TXT, XLSX, PPTX
          </p>
        </div>
      </div>

      {/* Upload Box */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
          <Upload size={14} className="text-blue-600" />
          <span>Unggah Dokumen Kebijakan Baru</span>
        </h3>

        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pilih File (PDF, DOCX, TXT, XLSX, PPTX) *
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.pptx"
                onChange={handleFileChange}
                required
                className="w-full text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg p-1"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Dokumen *
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Contoh: Laporan Evaluasi BTS 4G Wilayah 3T"
                required
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Instansi Sumber / Pemilik
              </label>
              <input
                type="text"
                value={sourceAgency}
                onChange={(e) => setSourceAgency(e.target.value)}
                placeholder="Contoh: Kemenkomdigi / BSSN / Kemenko Polkam"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tanggal Dokumen
              </label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Keterangan Singkat / Ringkasan
              </label>
              <input
                type="text"
                value={docDesc}
                onChange={(e) => setDocDesc(e.target.value)}
                placeholder="Ringkasan poin penting dokumen untuk rujukan analisis"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{uploadSuccess}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUploading || !fileToUpload}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs"
            >
              {isUploading ? 'Menyimpan & Mengindeks Dokumen...' : 'Simpan ke Google Drive'}
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan judul, nama file, atau instansi..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Filter Kategori:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Document Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Daftar Dokumen Pengetahuan ({filteredDocs.length} dari {documents.length})
          </span>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Tidak ada dokumen yang sesuai dengan pencarian atau filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Judul Dokumen</th>
                  <th className="py-3 px-3">Instansi</th>
                  <th className="py-3 px-3">Format</th>
                  <th className="py-3 px-3">Tanggal</th>
                  <th className="py-3 px-3">Status RAG</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900 max-w-[280px]">
                      <div className="truncate" title={doc.title}>
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {doc.file_name} {doc.is_demo ? '· (Simulasi Demo)' : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                      {doc.source_agency || '-'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] uppercase whitespace-nowrap">
                      {doc.file_name.split('.').pop() || 'FILE'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                      {doc.document_date || '-'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block text-[11px] font-medium ${
                          doc.processing_status === 'Ready'
                            ? 'text-emerald-700'
                            : doc.processing_status === 'Memerlukan OCR'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {doc.processing_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenPreview(doc)}
                          title="Lihat Detail & Cuplikan"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          title="Unduh File Asli"
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Download size={15} />
                        </a>
                        <button
                          onClick={() => setDocToDelete(doc)}
                          title="Hapus Dokumen"
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {previewDoc.document.title}
                </h4>
                <p className="text-xs text-slate-500">
                  {previewDoc.document.source_agency} · {previewDoc.document.document_date}
                </p>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-700">Keterangan:</span>
                <p className="text-slate-600 mt-0.5">
                  {previewDoc.document.description || 'Tidak ada deskripsi.'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-700">
                    Cuplikan Indeks RAG (
                    {previewDoc.extractedData?.chunks?.length || 0} cuplikan):
                  </span>
                  {previewDoc.extractedData?.ocr_required && (
                    <span className="text-amber-600 font-medium">Memerlukan OCR</span>
                  )}
                </div>

                {previewDoc.extractedData?.chunks?.length ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {previewDoc.extractedData.chunks.map((chk: any) => (
                      <div
                        key={chk.id}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200/60"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1">
                          <span>{chk.location}</span>
                          <span className="font-mono text-[10px]">{chk.id}</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {chk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">Belum ada cuplikan yang diekstrak.</p>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL KONFIRMASI HAPUS DOKUMEN */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
            {/* Header Modal */}
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Konfirmasi Hapus Dokumen
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pusat Pengetahuan SPAK-TIK
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setDocToDelete(null)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-white/60 transition-colors"
                title="Batal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Isi Dokumen yang Akan Dihapus */}
            <div className="p-5 space-y-3.5 text-xs text-slate-600">
              <p className="leading-relaxed">
                Apakah Anda yakin ingin menghapus dokumen berikut dari sistem?
              </p>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="font-semibold text-slate-900 line-clamp-2 text-xs">
                  {docToDelete.title}
                </div>
                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-700">{docToDelete.source_agency || '-'}</span>
                  <span>·</span>
                  <span className="font-mono uppercase font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                    {docToDelete.file_name.split('.').pop() || 'FILE'}
                  </span>
                  <span>·</span>
                  <span>{docToDelete.document_date || '-'}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  Nama File: {docToDelete.file_name}
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  File fisik di Google Drive, data ekstraksi indeks pengetahuan RAG, dan seluruh keterkaitan sitasi dokumen ini akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
                </span>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="p-4 px-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shadow-2xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 rounded-lg transition-colors shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Menghapus Dokumen...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Ya, Hapus Dokumen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
