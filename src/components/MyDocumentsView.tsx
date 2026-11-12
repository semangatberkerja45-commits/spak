import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Download,
  Trash2,
  Sparkles,
  BookOpen,
  Calendar,
} from 'lucide-react';
import { AnalysisRecord, AnalysisResultPayload } from '../types/spak';
import { api } from '../utils/apiClient';

interface MyDocumentsViewProps {
  analyses: AnalysisRecord[];
  onRefresh: () => void;
  onOpenAnalysisWorkflow: () => void;
}

export const MyDocumentsView: React.FC<MyDocumentsViewProps> = ({
  analyses,
  onRefresh,
  onOpenAnalysisWorkflow,
}) => {
  const [selectedAnalysis, setSelectedAnalysis] = useState<{
    record: AnalysisRecord;
    payload: AnalysisResultPayload | null;
  } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleOpenDetail = async (record: AnalysisRecord) => {
    setIsLoadingDetail(true);
    setActionError(null);
    try {
      const res = await api.getAnalysis(record.id);
      setSelectedAnalysis({ record: res.analysis, payload: res.payload });
    } catch (err: any) {
      setActionError(`Gagal memuat kajian: ${err.message}`);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleExport = async (id: string, format: 'DOCX' | 'PDF') => {
    setActionError(null);
    setActionNotice(`Mempersiapkan ekspor ${format}...`);
    try {
      await api.exportAnalysis(id, format);
      setActionNotice(`Berhasil mengunduh dokumen ${format}.`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      setActionError(`Gagal mengekspor: ${err.message}`);
      setActionNotice(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Dokumen Saya (Hasil Kajian & Analisis)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar telaahan staf yang tersimpan di Google Drive (03_Hasil_Analisis)
          </p>
        </div>

        <button
          onClick={onOpenAnalysisWorkflow}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
        >
          <Sparkles size={14} />
          <span>Kajian Baru</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-500 font-bold ml-2">&times;</button>
        </div>
      )}

      {actionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-emerald-600 font-bold ml-2">&times;</button>
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-12 text-center">
          <FileText size={36} className="mx-auto text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800 mt-3">
            Belum ada hasil analisis kebijakan
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Jalankan Alur Analisis Kebijakan untuk menyusun kajian 9 bab terstruktur dengan Tiga AI Agent.
          </p>
          <div className="mt-4">
            <button
              onClick={onOpenAnalysisWorkflow}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Mulai Analisis Sekarang
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analyses.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                  <span className="font-medium text-blue-600">{item.topic}</span>
                  <span
                    className={`font-semibold ${
                      item.status === 'Completed' ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                  {item.title}
                </h3>

                <div className="text-[11px] text-slate-500 mt-2 space-y-0.5">
                  <div>Tipe: {item.type}</div>
                  <div>Kedalaman: {item.depth}</div>
                  <div className="flex items-center gap-1 text-slate-400 mt-1">
                    <Calendar size={12} />
                    <span>{new Date(item.created_at).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleOpenDetail(item)}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-semibold"
                >
                  <Eye size={14} />
                  <span>Buka Kajian</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleExport(item.id, 'DOCX')}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                    title="Unduh DOCX"
                  >
                    <Download size={14} />
                    <span className="text-[10px] font-bold ml-1">DOCX</span>
                  </button>
                  <button
                    onClick={() => handleExport(item.id, 'PDF')}
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors"
                    title="Unduh PDF"
                  >
                    <Download size={14} />
                    <span className="text-[10px] font-bold ml-1">PDF</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedAnalysis && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {selectedAnalysis.record.title}
                </h4>
                <p className="text-xs text-slate-500">
                  Topik: {selectedAnalysis.record.topic} · Status: {selectedAnalysis.record.status}
                </p>
              </div>
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {selectedAnalysis.payload?.sections ? (
                <>
                  <div>
                    <h5 className="font-bold text-slate-900 uppercase">I. Ringkasan Eksekutif</h5>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                      {selectedAnalysis.payload.sections.ringkasan_eksekutif}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-900 uppercase">V. Analisis & Pembahasan</h5>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                      {selectedAnalysis.payload.sections.analisis_pembahasan_komprehensif}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-900 uppercase">VII. Rekomendasi</h5>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                      {selectedAnalysis.payload.sections.rekomendasi}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <h5 className="font-bold text-slate-900 uppercase flex items-center gap-1.5">
                      <BookOpen size={13} className="text-blue-600" />
                      <span>IX. Sumber dan Referensi</span>
                    </h5>
                    <ol className="list-decimal list-inside space-y-1 mt-1 text-slate-600">
                      {selectedAnalysis.payload.sections.sumber_dan_referensi?.map((s, idx) => (
                        <li key={idx} className="italic">
                          {s.replace(/^\d+\.\s*/, '')}
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <p className="text-slate-400 italic">Konten detail telaahan belum tersimpan di Drive.</p>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport(selectedAnalysis.record.id, 'DOCX')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Ekspor DOCX
                </button>
                <button
                  onClick={() => handleExport(selectedAnalysis.record.id, 'PDF')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Ekspor PDF
                </button>
              </div>

              <button
                onClick={() => setSelectedAnalysis(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
