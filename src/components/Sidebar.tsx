import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Bot,
  FileSpreadsheet,
  FileText,
  Settings,
  HardDrive,
  LogOut,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { WorkspaceManifest } from '../types/spak';

export type NavTab =
  | 'dashboard'
  | 'knowledge'
  | 'assistant'
  | 'analysis'
  | 'my-documents'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  manifest: WorkspaceManifest | null;
  userEmail: string;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  manifest,
  userEmail,
  onLogout,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'knowledge', label: 'Pusat Pengetahuan', icon: <BookOpen size={18} /> },
    { id: 'assistant', label: 'AI Knowledge Assistant', icon: <Bot size={18} /> },
    { id: 'analysis', label: 'Analisis Kebijakan', icon: <Sparkles size={18} /> },
    { id: 'my-documents', label: 'Dokumen Saya', icon: <FileText size={18} /> },
    { id: 'settings', label: 'Pengaturan & Template', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0 border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            ST
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white truncate">
              SPAK-TIK
            </h1>
            <p className="text-xs text-slate-400 truncate">
              Kemenko Polkam RI
            </p>
          </div>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Drive Status & Profile Footer */}
      <div className="p-3 border-t border-slate-800 space-y-3 bg-slate-950/40">
        <div className="p-2.5 bg-slate-800/80 rounded-lg text-xs space-y-1">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5 font-medium text-emerald-400">
              <HardDrive size={13} />
              <span>Google Drive</span>
            </span>
            <span className="text-[11px] text-slate-400">Terhubung</span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {manifest ? 'Folder: SPAK-TIK Aktif' : 'Memeriksa folder...'}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs text-slate-400 px-1">
          <span className="truncate max-w-[140px] text-slate-300" title={userEmail}>
            {userEmail || 'Analis Kebijakan'}
          </span>
          <button
            onClick={onLogout}
            title="Keluar / Disconnect"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};
