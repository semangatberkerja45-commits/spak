import React from 'react';
import {
  FileText,
  Folders,
  Sparkles,
  CheckCircle2,
  HardDrive,
  Upload,
  Search,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { DocumentRecord, CategoryRecord, AnalysisRecord, WorkspaceManifest } from '../types/spak';

interface DashboardViewProps {
  documents: DocumentRecord[];
  categories: CategoryRecord[];
  analyses: AnalysisRecord[];
  manifest: WorkspaceManifest | null;
  onNavigate: (tab: any) => void;
  onSeedDemo: () => void;
  isSeeding: boolean;
  onReconcile: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  categories,
  analyses,
  manifest,
  onNavigate,
  onSeedDemo,
  isSeeding,
  onReconcile,
}) => {
  const completedAnalyses = analyses.filter((a) => a.status === 'Completed').length;
  const readyDocuments = documents.filter((d) => d.processing_status === 'Ready').length;
  const demoCount = documents.filter((d) => d.is_demo).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Dashboard SPAK-TIK
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Asisten Deputi Koordinasi Telekomunikasi dan Informatika — Kemenko Polkam RI
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('knowledge')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Upload size={14} />
            <span>Unggah Dokumen</span>
          </button>
          <button
            onClick={() => onNavigate('analysis')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
          >
            <PlusCircle size={14} />
            <span>Buat Analisis Kebijakan</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Dokumen Pengetahuan</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FileText size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {documents.length}
            </span>
            <span className="text-xs text-slate-500">
              ({readyDocuments} terindeks)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {demoCount} dokumen simulasi demo
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Kategori Kebijakan</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Folders size={16} />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {categories.length}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Terstruktur di Google Sheets
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Kajian Kebijakan</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Sparkles size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {analyses.length}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              ({completedAnalyses} selesai)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            9 Bab Telaahan Staf Komprehensif
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Penyimpanan Google Drive</span>
            <span className="p-2 bg-teal-50 text-teal-600 rounded-lg">
              <HardDrive size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-800">
              {manifest ? '7 Subfolder Siap' : 'Inisialisasi'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 truncate">
            DB: SPAK-TIK_Database
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Documents and Quick Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Recent Documents */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Dokumen Pengetahuan Terkini
              </h3>
              <p className="text-xs text-slate-500">
                Dokumen resmi dan simulasi tersimpan di Google Drive
              </p>
            </div>
            <button
              onClick={() => onNavigate('knowledge')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Lihat Semua
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
              <FileText className="mx-auto text-slate-300" size={32} />
              <p className="text-sm text-slate-600 mt-2 font-medium">
                Belum ada dokumen yang diunggah
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Unggah dokumen (PDF, DOCX, TXT, XLSX, PPTX) atau muat 20 file data simulasi demo.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={onSeedDemo}
                  disabled={isSeeding}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  {isSeeding ? 'Membuat 20 Dokumen...' : 'Muat 20 Data Demo'}
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase">
                    <th className="pb-2.5 font-semibold">Judul Dokumen</th>
                    <th className="pb-2.5 font-semibold">Instansi</th>
                    <th className="pb-2.5 font-semibold">Format</th>
                    <th className="pb-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {documents.slice(0, 6).map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 pr-3 font-medium text-slate-900 max-w-[240px] truncate">
                        {doc.title}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                        {doc.source_agency || '-'}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500 uppercase">
                        {doc.file_name.split('.').pop() || 'FILE'}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center text-[11px] font-medium ${
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Quick Actions & Sync */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2">
              Aksi Cepat Analis
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('assistant')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">Tanya AI Pengetahuan</div>
                  <div className="text-slate-500 text-[11px]">Q&A berbasis bukti dokumen</div>
                </div>
                <Search size={16} className="text-blue-600" />
              </button>

              <button
                onClick={() => onNavigate('analysis')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">Kajian Kebijakan 9 Bab</div>
                  <div className="text-slate-500 text-[11px]">Sintesis tiga AI agent berbobot</div>
                </div>
                <Sparkles size={16} className="text-blue-600" />
              </button>

              <button
                onClick={onReconcile}
                className="w-full text-left p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">Konsistensi & Reconcile</div>
                  <div className="text-slate-500 text-[11px]">Verifikasi Drive & Sheets</div>
                </div>
                <RefreshCw size={15} className="text-slate-500" />
              </button>
            </div>
          </div>

          {/* Demo Data Panel */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Data Simulasi Resmi
              </span>
              <span className="text-[11px] text-slate-400">4 Tema · 20 File</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tersedia 20 file simulasi nyata (4 PDF, 4 DOCX, 4 TXT, 4 XLSX, 4 PPTX) berlabel resmi untuk uji coba RAG dan analisis kebijakan.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onSeedDemo}
                disabled={isSeeding}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                {isSeeding ? 'Memproses 20 File...' : 'Muat 20 Dokumen Demo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
