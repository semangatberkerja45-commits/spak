import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { KnowledgeCenter } from './components/KnowledgeCenter';
import { KnowledgeAssistant } from './components/KnowledgeAssistant';
import { PolicyAnalysisWorkflow } from './components/PolicyAnalysisWorkflow';
import { MyDocumentsView } from './components/MyDocumentsView';
import { SettingsView } from './components/SettingsView';
import {
  initAuth,
  googleSignIn,
  connectSandboxSession,
  logout,
  getAccessToken,
} from './utils/auth';
import { api } from './utils/apiClient';
import {
  DocumentRecord,
  CategoryRecord,
  AnalysisRecord,
  TemplateRecord,
  WorkspaceManifest,
} from './types/spak';
import { HardDrive, Sparkles, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [manifest, setManifest] = useState<WorkspaceManifest | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState<boolean>(false);

  // Load app data
  const loadWorkspaceData = async () => {
    setIsLoadingData(true);
    try {
      const statusRes = await api.getDriveStatus();
      if (statusRes.manifest) {
        setManifest(statusRes.manifest);
      }

      const [docsRes, catsRes, ansRes, tplsRes] = await Promise.all([
        api.listDocuments(),
        api.listCategories(),
        api.listAnalyses(),
        api.listTemplates(),
      ]);

      if (docsRes.documents) setDocuments(docsRes.documents);
      if (catsRes.categories) setCategories(catsRes.categories);
      if (ansRes.analyses) setAnalyses(ansRes.analyses);
      if (tplsRes.templates) setTemplates(tplsRes.templates);
    } catch (err: any) {
      console.error('Failed to load workspace data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setIsAuthenticated(true);
        setUserEmail(user.email || 'Analis Kebijakan');
        setIsAuthChecking(false);
        loadWorkspaceData();
      },
      () => {
        // Check if query parameter has autostart or session in storage
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1') {
          const session = connectSandboxSession();
          setIsAuthenticated(true);
          setUserEmail(session.user.email || 'analis.demo@polkam.go.id');
          setIsAuthChecking(false);
          loadWorkspaceData();
        } else {
          setIsAuthenticated(false);
          setIsAuthChecking(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setIsAuthenticated(true);
        setUserEmail(result.user.email || 'Analis Kebijakan');
        await loadWorkspaceData();
      }
    } catch (err: any) {
      alert(`Gagal menghubungkan Google Drive: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSandboxConnect = () => {
    const session = connectSandboxSession();
    setIsAuthenticated(true);
    setUserEmail(session.user.email || 'analis.demo@polkam.go.id');
    loadWorkspaceData();
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setManifest(null);
    setDocuments([]);
  };

  const handleSeedDemo = async () => {
    setIsSeedingDemo(true);
    try {
      const res = await api.seedDemo();
      alert(res.message || 'Data demo 20 file simulasi berhasil diproses.');
      await loadWorkspaceData();
    } catch (err: any) {
      alert(`Gagal memuat data demo: ${err.message}`);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const handleResetDemo = async () => {
    const confirmed = window.confirm(
      'Reset data demo? Semua dokumen simulasi akan dihapus dari Google Drive, namun dokumen resmi pengguna akan tetap utuh.'
    );
    if (!confirmed) return;

    try {
      const res = await api.resetDemo();
      alert(res.message || 'Data demo berhasil direset.');
      await loadWorkspaceData();
    } catch (err: any) {
      alert(`Gagal mereset data demo: ${err.message}`);
    }
  };

  const handleReconcile = async () => {
    try {
      const res = await api.reconcileWorkspace();
      alert(
        `Hasil Pemeriksaan Konsistensi Workspace:\n- Total Dokumen Diperiksa: ${res.totalDocumentsChecked}\n- Masalah Ditemukan: ${res.issuesCount}\n\n${res.recommendations}`
      );
      await loadWorkspaceData();
    } catch (err: any) {
      alert(`Gagal menjalankan reconcile: ${err.message}`);
    }
  };

  // Loading Splash
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg mx-auto shadow-sm">
            ST
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Memuat SPAK-TIK Kemenko Polkam...
          </p>
        </div>
      </div>
    );
  }

  // 4. GOOGLE OAUTH CONNECT SCREEN (LANDING)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-between p-6">
        <div className="max-w-4xl mx-auto w-full pt-12 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200/80 rounded-full text-blue-700 text-xs font-semibold">
            <ShieldCheck size={14} />
            <span>Kementerian Koordinator Bidang Politik dan Keamanan RI</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#17365D] tracking-tight">
            Selamat Datang di SPAK-TIK
          </h1>

          <p className="text-sm sm:text-base font-semibold text-[#2563EB] max-w-xl mx-auto">
            Sistem Pengetahuan dan Analisis Kebijakan Telekomunikasi dan Informatika
          </p>

          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Hubungkan Google Drive Anda untuk mengelola dokumen pengetahuan dan hasil analisis kebijakan secara mandiri dan aman.
          </p>

          {/* Official Google Connect Button */}
          <div className="pt-6 flex flex-col items-center gap-3">
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoggingIn}
              className="gsi-material-button shadow-sm hover:shadow-md"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isLoggingIn ? 'Menghubungkan...' : 'Hubungkan Google Drive'}
                </span>
              </div>
            </button>

            <button
              onClick={handleSandboxConnect}
              className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-4 mt-2"
            >
              Atau masuk ke Mode Pratinjau Cepat (Evaluasi Sandbox)
            </button>
          </div>

          {/* Architecture Features */}
          <div className="pt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 font-bold">
                <HardDrive size={16} />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Google Drive Native</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Seluruh file dokumen dan hasil analisis tersimpan utuh di Drive pengguna dalam 7 subfolder terstruktur.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 font-bold">
                <CheckCircle2 size={16} />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Google Sheets Database</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Metadata 8 entitas (dokumen, kategori, telaahan, audit log) tersimpan tanpa database eksternal pihak ketiga.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-2 font-bold">
                <Sparkles size={16} />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tiga AI Agent & RAG</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Sintesis kebijakan 9 bab komprehensif dengan penegakan aturan referensi hanya di bagian akhir.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 py-4">
          SPAK-TIK v3.0 · Asisten Deputi Koordinasi Telekomunikasi dan Informatika · Kemenko Polkam RI
        </div>
      </div>
    );
  }

  // MAIN AUTHENTICATED WORKSPACE
  return (
    <div className="flex h-screen bg-[#F7F9FC] overflow-hidden">
      {/* 10. Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        manifest={manifest}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-800">SPAK-TIK</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 capitalize">
              {currentTab.replace('-', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {isLoadingData && (
              <span className="text-blue-600 flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" />
                <span>Sinkronisasi...</span>
              </span>
            )}
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Google Drive Terhubung</span>
            </div>
          </div>
        </header>

        {/* Dynamic Workspace Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && (
              <DashboardView
                documents={documents}
                categories={categories}
                analyses={analyses}
                manifest={manifest}
                onNavigate={setCurrentTab}
                onSeedDemo={handleSeedDemo}
                isSeeding={isSeedingDemo}
                onReconcile={handleReconcile}
              />
            )}

            {currentTab === 'knowledge' && (
              <KnowledgeCenter
                documents={documents}
                categories={categories}
                onRefresh={loadWorkspaceData}
              />
            )}

            {currentTab === 'assistant' && (
              <KnowledgeAssistant documents={documents} />
            )}

            {currentTab === 'analysis' && (
              <PolicyAnalysisWorkflow
                documents={documents}
                onAnalysisSaved={loadWorkspaceData}
              />
            )}

            {currentTab === 'my-documents' && (
              <MyDocumentsView
                analyses={analyses}
                onRefresh={loadWorkspaceData}
                onOpenAnalysisWorkflow={() => setCurrentTab('analysis')}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                categories={categories}
                templates={templates}
                manifest={manifest}
                onRefresh={loadWorkspaceData}
                onSeedDemo={handleSeedDemo}
                onResetDemo={handleResetDemo}
                isSeeding={isSeedingDemo}
                onReconcile={handleReconcile}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
