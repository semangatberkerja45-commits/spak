import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Download,
  Save,
  BookOpen,
  RefreshCw,
  Layers,
  Edit3,
  AlertCircle,
} from 'lucide-react';
import {
  DocumentRecord,
  AnalysisRecord,
  AnalysisResultPayload,
  AnalysisType,
  AnalysisDepth,
  AnalysisFocus,
} from '../types/spak';
import { api } from '../utils/apiClient';

interface PolicyAnalysisWorkflowProps {
  documents: DocumentRecord[];
  onAnalysisSaved: () => void;
}

export const PolicyAnalysisWorkflow: React.FC<PolicyAnalysisWorkflowProps> = ({
  documents,
  onAnalysisSaved,
}) => {
  const [step, setStep] = useState<number>(1);

  // Form State (Halaman 1)
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('Infrastruktur Telekomunikasi');
  const [background, setBackground] = useState('');
  const [problem, setProblem] = useState('');
  const [objective, setObjective] = useState('');
  const [questions, setQuestions] = useState('');
  const [scope, setScope] = useState('');
  const [period, setPeriod] = useState('Tahun 2026-2027');

  // Source Selection (Halaman 2)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Configuration (Halaman 3)
  const [analysisType, setAnalysisType] = useState<AnalysisType>('Kebijakan Komprehensif');
  const [depth, setDepth] = useState<AnalysisDepth>('Mendalam');
  const [focus, setFocus] = useState<AnalysisFocus>('Komprehensif');

  // Processing & Execution (Halaman 4)
  const [isRunning, setIsRunning] = useState(false);
  const [processStage, setProcessStage] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  // Result & Editor (Halaman 5)
  const [resultPayload, setResultPayload] = useState<AnalysisResultPayload | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSections, setEditedSections] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const analysisTypes: AnalysisType[] = [
    'Kebijakan Komprehensif',
    'Isu Strategis',
    'Permasalahan',
    'Akar Penyebab',
    'Kesenjangan',
    'Risiko',
    'Alternatif Kebijakan',
    'Perkembangan Isu',
  ];

  const topics = [
    'Infrastruktur Telekomunikasi',
    'Pusat Data Pemerintah',
    'Infrastruktur Digital Kawasan Pemerintahan',
    'Sistem Komunikasi Kabel Laut',
    'Keamanan Siber dan Sandi Strategis',
  ];

  const handleStartAnalysis = async () => {
    setErrorMessage(null);
    if (!title || !title.trim()) {
      setErrorMessage('Judul kajian kebijakan wajib diisi.');
      setStep(1);
      return;
    }
    if (!topic || !topic.trim()) {
      setErrorMessage('Topik kajian kebijakan wajib dipilih.');
      setStep(1);
      return;
    }

    setStep(4);
    setIsRunning(true);
    setProcessStage('Membuat catatan kajian di Google Sheets database...');

    try {
      // 1. Create Analysis record
      const docsToAnalyze = selectedDocIds.length > 0 ? selectedDocIds : documents.map((d) => d.id);
      const created = await api.createAnalysis({
        title: title.trim(),
        topic: topic.trim(),
        type: analysisType,
        depth,
        selected_document_ids: docsToAnalyze,
      });

      if (!created.analysis?.id) {
        throw new Error('Gagal menginisialisasi kajian analisis.');
      }

      setAnalysisId(created.analysis.id);
      setProcessStage('Menjalankan Tiga AI Agent: Ekstraksi bukti, sintesis 9 bab, dan review sumber...');

      // 2. Run analysis
      const res = await api.runAnalysis(created.analysis.id, {
        latar_belakang: background,
        permasalahan: problem,
        tujuan: objective,
        pertanyaan_analisis: questions,
        ruang_lingkup: scope,
        periode: period,
        focus,
      });

      if (res.error) throw new Error(res.error);

      setResultPayload(res.payload);
      setEditedSections(res.payload.sections);
      setProcessStage('Selesai.');
      setStep(5);
      onAnalysisSaved();
    } catch (err: any) {
      setErrorMessage(`Kendala menjalankan analisis kebijakan: ${err.message || 'Terjadi kesalahan sistem'}.`);
      setStep(3);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!analysisId || !editedSections) return;
    setIsSaving(true);
    setSaveNotice(null);
    setErrorMessage(null);
    try {
      await api.updateAnalysis(analysisId, {
        sections: editedSections,
      });
      setSaveNotice('Perubahan hasil analisis berhasil disimpan ke Google Drive dan Google Sheets.');
      setTimeout(() => setSaveNotice(null), 3500);
      setIsEditing(false);
      onAnalysisSaved();
    } catch (err: any) {
      setErrorMessage(`Gagal menyimpan perubahan: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const [exportingFormat, setExportingFormat] = useState<'DOCX' | 'PDF' | null>(null);

  const handleExport = async (format: 'DOCX' | 'PDF') => {
    if (!analysisId) return;
    setErrorMessage(null);
    setExportingFormat(format);
    try {
      await api.exportAnalysis(analysisId, format);
      setSaveNotice(`Dokumen ${format} berhasil diunduh ke perangkat Anda.`);
      setTimeout(() => setSaveNotice(null), 3500);
    } catch (err: any) {
      setErrorMessage(`Gagal mengekspor dokumen ${format}: ${err.message}`);
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator Header */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Alur Kajian Analisis Kebijakan Komprehensif
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tiga AI Agent Terkoordinasi · Standar Kemenko Polkam
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : step > s
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 text-sm font-bold px-1"
          >
            &times;
          </button>
        </div>
      )}

      {saveNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span className="font-medium">{saveNotice}</span>
        </div>
      )}

      {/* HALAMAN 1: BUAT ANALISIS */}
      {step === 1 && (
        <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Halaman 1 — Parameter dan Latar Belakang Kajian
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tentukan ruang lingkup dan pokok telaahan kebijakan
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Judul Kajian Kebijakan *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Kajian Strategis Ketahanan Infrastruktur BTS 4G dan SKKL"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Topik Kebijakan *
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Identifikasi Permasalahan Utama
              </label>
              <textarea
                rows={3}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="Kendala pasokan energi, kerentanan fisik, tumpang tindih regulasi, atau ancaman siber..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Latar Belakang / Urgensi Kebijakan
              </label>
              <textarea
                rows={3}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Perkembangan geopolitik, insiden putusnya kabel laut, arahan pimpinan, dsb..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tujuan Telaahan Staf
              </label>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Memberikan opsi rekomendasi kebijakan bagi pimpinan Kemenko Polkam"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ruang Lingkup & Periode
              </label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="Periode 2026-2027 / Nasional"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={() => {
                if (!title || !title.trim()) {
                  setErrorMessage('Mohon isi Judul Kajian terlebih dahulu.');
                  return;
                }
                setErrorMessage(null);
                setStep(2);
              }}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <span>Lanjut: Pilih Sumber Bukti</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* HALAMAN 2: PILIH SUMBER */}
      {step === 2 && (
        <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Halaman 2 — Pilih Sumber Dokumen Pengetahuan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih dokumen rujukan dari Google Drive yang akan dianalisis oleh AI
              </p>
            </div>
            <button
              onClick={() => {
                if (selectedDocIds.length === documents.length) {
                  setSelectedDocIds([]);
                } else {
                  setSelectedDocIds(documents.map((d) => d.id));
                }
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {selectedDocIds.length === documents.length
                ? 'Batalkan Pilihan'
                : `Pilih Semua (${documents.length})`}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
            {documents.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    setSelectedDocIds((prev) =>
                      prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                    );
                  }}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors flex items-start gap-3 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/40 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 truncate">
                      {doc.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{doc.source_agency}</span>
                      <span>·</span>
                      <span className="font-mono uppercase">{doc.file_name.split('.').pop()}</span>
                      <span>·</span>
                      <span>{doc.document_date}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Kembali</span>
            </button>
            <button
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <span>Lanjut: Konfigurasi Analisis ({selectedDocIds.length || 'Semua'} Sumber)</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* HALAMAN 3: KONFIGURASI */}
      {step === 3 && (
        <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Halaman 3 — Konfigurasi Kedalaman dan Fokus Analisis
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur karakteristik sintesis tiga AI Agent
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Jenis Analisis
              </label>
              <select
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 text-xs"
              >
                {analysisTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Kedalaman Analisis
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['Ringkas', 'Standar', 'Mendalam'] as AnalysisDepth[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDepth(d)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      depth === d
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Fokus Kajian
              </label>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as AnalysisFocus)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 text-xs"
              >
                <option value="Komprehensif">Komprehensif (Semua Aspek)</option>
                <option value="Teknis">Teknis & Infrastruktur Fisik</option>
                <option value="Kebijakan">Kebijakan & Regulasi</option>
                <option value="Kelembagaan">Kelembagaan & Hankam</option>
                <option value="Strategis">Strategis & Geopolitik</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900">
              Keluaran Standar Dokumen:
            </div>
            <p>
              Sistem akan menyusun struktur 9 Bab resmi (I. Ringkasan Eksekutif, II. Latar Belakang, III. Kondisi Faktual, IV. Identifikasi Permasalahan, V. Analisis dan Pembahasan Komprehensif, VI. Alternatif Kebijakan, VII. Rekomendasi, VIII. Kesimpulan, IX. Sumber dan Referensi).
            </p>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Kembali</span>
            </button>
            <button
              onClick={handleStartAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <Sparkles size={14} />
              <span>Mulai Eksekusi AI Agent</span>
            </button>
          </div>
        </div>
      )}

      {/* HALAMAN 4: PROSES EKSEKUSI */}
      {step === 4 && (
        <div className="bg-white rounded-xl p-10 border border-slate-200/80 shadow-xs text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <RefreshCw size={24} className="animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Menjalankan Tiga AI Agent Terkoordinasi
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {processStage}
            </p>
          </div>
          <div className="max-w-md mx-auto bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-600 h-full animate-pulse w-3/4 rounded-full" />
          </div>
        </div>
      )}

      {/* HALAMAN 5: HASIL, EDITOR, DAN EKSPOR */}
      {step === 5 && resultPayload && (
        <div className="space-y-6">
          {/* Top Actions Bar */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {resultPayload.title}
              </h3>
              <p className="text-xs text-slate-500">
                Tersimpan di Google Drive (Folder: 03_Hasil_Analisis) · Status: Selesai
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isEditing
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 size={13} />
                <span>{isEditing ? 'Mode Baca' : 'Edit Bab'}</span>
              </button>

              {isEditing && (
                <button
                  onClick={handleSaveEdits}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
                >
                  <Save size={13} />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan ke Drive'}</span>
                </button>
              )}

              <button
                onClick={() => handleExport('DOCX')}
                disabled={Boolean(exportingFormat)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                {exportingFormat === 'DOCX' ? (
                  <RefreshCw size={13} className="animate-spin text-blue-600" />
                ) : (
                  <Download size={13} />
                )}
                <span>{exportingFormat === 'DOCX' ? 'Mengunduh DOCX...' : 'Ekspor DOCX'}</span>
              </button>

              <button
                onClick={() => handleExport('PDF')}
                disabled={Boolean(exportingFormat)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                {exportingFormat === 'PDF' ? (
                  <RefreshCw size={13} className="animate-spin text-rose-600" />
                ) : (
                  <Download size={13} />
                )}
                <span>{exportingFormat === 'PDF' ? 'Mengunduh PDF...' : 'Ekspor PDF'}</span>
              </button>
            </div>
          </div>

          {saveNotice && (
            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{saveNotice}</span>
            </div>
          )}

          {/* Full-Width Document Reader / Editor */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-8 max-w-4xl mx-auto space-y-6 text-slate-800">
            {/* Header Document */}
            <div className="text-center border-b border-slate-200 pb-5">
              <div className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                Kementerian Koordinator Bidang Politik dan Keamanan RI
              </div>
              <div className="text-xs font-semibold text-blue-600 uppercase mt-0.5">
                Asisten Deputi Koordinasi Telekomunikasi dan Informatika
              </div>
              <h1 className="text-lg font-bold text-slate-900 uppercase mt-3">
                {resultPayload.title}
              </h1>
              <div className="text-xs text-slate-500 mt-1">
                Topik: {resultPayload.topic} · Kedalaman: {resultPayload.depth} · Fokus: {resultPayload.focus}
              </div>
            </div>

            {/* Chapters I - VIII */}
            {[
              ['I. Ringkasan Eksekutif', 'ringkasan_eksekutif'],
              ['II. Latar Belakang', 'latar_belakang'],
              ['III. Kondisi Faktual', 'kondisi_faktual'],
              ['IV. Identifikasi Permasalahan', 'identifikasi_permasalahan'],
              ['V. Analisis dan Pembahasan Komprehensif', 'analisis_pembahasan_komprehensif'],
              ['VI. Alternatif Kebijakan', 'alternatif_kebijakan'],
              ['VII. Rekomendasi', 'rekomendasi'],
              ['VIII. Kesimpulan', 'kesimpulan'],
            ].map(([titleText, key]) => (
              <section key={key} className="space-y-2">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  {titleText}
                </h2>
                {isEditing ? (
                  <textarea
                    rows={key === 'analisis_pembahasan_komprehensif' ? 7 : 4}
                    value={editedSections?.[key] || ''}
                    onChange={(e) =>
                      setEditedSections({
                        ...editedSections,
                        [key]: e.target.value,
                      })
                    }
                    className="w-full p-3 text-xs border border-slate-200 rounded-lg font-sans focus:ring-1 focus:ring-blue-500 leading-relaxed"
                  />
                ) : (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {resultPayload.sections[key as keyof typeof resultPayload.sections] as string}
                  </p>
                )}
              </section>
            ))}

            {/* Chapter IX: Sumber dan Referensi (STRICTLY AT THE END) */}
            <section className="pt-4 border-t border-slate-200 space-y-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <BookOpen size={14} className="text-blue-600" />
                <span>IX. Sumber dan Referensi</span>
              </h2>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600">
                {resultPayload.sections.sumber_dan_referensi?.map((ref, idx) => (
                  <li key={idx} className="italic">
                    {ref.replace(/^\d+\.\s*/, '')}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
