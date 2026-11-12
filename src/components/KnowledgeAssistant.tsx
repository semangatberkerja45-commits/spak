import React, { useState } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Copy,
  Check,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DocumentRecord } from '../types/spak';
import { api } from '../utils/apiClient';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: string[];
  qualityReview?: string;
  timestamp: string;
}

interface KnowledgeAssistantProps {
  documents: DocumentRecord[];
}

export const KnowledgeAssistant: React.FC<KnowledgeAssistantProps> = ({ documents }) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'init-msg',
      role: 'assistant',
      content:
        'Selamat datang di AI Knowledge Assistant SPAK-TIK. Saya siap menjawab pertanyaan terkait isu strategis infrastruktur telekomunikasi, pusat data pemerintah, regulasi frekuensi, dan kabel laut berdasarkan dokumen resmi yang tersimpan di Google Drive.',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const samplePrompts = [
    'Apa kendala utama operasional BTS 4G di wilayah 3T Papua dan Maluku?',
    'Bandingkan kapasitas dan kesiapan PDN 1 Cikarang dengan DRC Batam.',
    'Apa ancaman dan kerentanan keamanan utama pada koridor kabel laut (SKKL)?',
    'Bagaimana ketentuan SOP komunikasi darurat bagi pimpinan negara saat krisis?',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMsg: AssistantMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await api.askKnowledge(
        textToSend,
        selectedDocIds.length > 0 ? selectedDocIds : undefined
      );

      const defaultHelpMsg =
        'Informasi spesifik untuk pertanyaan tersebut belum tercantum dalam ringkasan dokumen Pusat Pengetahuan. Silakan gunakan pertanyaan terkait isu BTS 4G wilayah 3T, Pusat Data Nasional (PDN Cikarang & DRC Batam/IKN), pengamanan kabel laut (SKKL), atau SOP komunikasi darurat sandi negara.';

      const aiMsg: AssistantMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: res.answer && res.answer.trim().length > 0 ? res.answer : defaultHelpMsg,
        references: res.references || [],
        qualityReview: res.qualityReview,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: AssistantMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Terjadi kendala saat memproses telaahan pengetahuan: ${err.message || 'Layanan sedang memuat ulang'}. Pastikan dokumen rujukan aktif di Pusat Pengetahuan atau coba ajukan kembali pertanyaan Anda.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Assistant Header & Document Scope Filter */}
      <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              AI Knowledge Assistant
            </h3>
            <p className="text-[11px] text-slate-500">
              Menjawab berbasis fakta dokumen · Referensi hanya di akhir jawaban
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              selectedDocIds.length > 0
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Filter size={13} />
            <span>
              {selectedDocIds.length > 0
                ? `${selectedDocIds.length} Dokumen Dipilih`
                : 'Semua Dokumen'}
            </span>
          </button>
        </div>
      </div>

      {/* Scope Drawer */}
      {isFilterOpen && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-700">
              Pilih Dokumen Batasan Bukti:
            </span>
            <button
              onClick={() => setSelectedDocIds([])}
              className="text-blue-600 hover:text-blue-700 text-[11px]"
            >
              Pilih Semua ({documents.length})
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {documents.map((doc) => {
              const isChecked = selectedDocIds.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-blue-50/70 border-blue-300 text-blue-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDocSelection(doc.id)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="truncate">{doc.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isUser ? 'bg-slate-800 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {isUser ? <User size={15} /> : <Bot size={15} />}
              </div>

              <div
                className={`p-4 rounded-xl text-xs leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-800 border border-slate-200/80 shadow-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Section 17 Sources: Strictly at the end */}
                {!isUser && msg.references && msg.references.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200/70">
                    <div className="font-bold text-[11px] text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <BookOpen size={12} className="text-blue-600" />
                      <span>Sumber dan Referensi</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600">
                      {msg.references.map((ref, idx) => (
                        <li key={idx} className="italic">
                          {ref.replace(/^\d+\.\s*/, '')}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {!isUser && (
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>{msg.timestamp}</span>
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="p-1 hover:text-slate-700 rounded transition-colors inline-flex items-center gap-1"
                      title="Salin Teks"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-emerald-600">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 max-w-xl">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Bot size={15} />
            </div>
            <div className="p-4 bg-slate-50 text-slate-700 rounded-xl border border-slate-200/80 text-xs flex items-center gap-2">
              <Sparkles size={14} className="text-blue-600 animate-spin" />
              <span>Menelaah indeks dokumen dan menyusun jawaban berbasis bukti...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Questions */}
      {messages.length === 1 && (
        <div className="px-5 py-2.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
          <span className="text-slate-400 font-medium text-[11px] self-center">
            Contoh Pertanyaan:
          </span>
          {samplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSend(p)}
              className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:border-blue-200 border border-slate-200 rounded-md text-slate-600 text-[11px] transition-colors text-left"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-3 border-t border-slate-200/80 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Tanyakan analisis kebijakan telekomunikasi atau cari fakta dokumen..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputQuery.trim()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-xs flex items-center gap-1.5 shadow-xs"
          >
            <Send size={13} />
            <span>Kirim</span>
          </button>
        </form>
      </div>
    </div>
  );
};
