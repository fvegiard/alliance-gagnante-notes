import { Routes, Route } from 'react-router';
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import type { Note, ViewMode } from './types';
import { buildGraphData } from './utils/linkParser';
import {
  appConfig,
  backgroundConfig,
  headerConfig,
  siteConfig,
} from './config';
import Sidebar from './components/Sidebar';
import NoteEditor from './components/NoteEditor';
import GraphView from './components/GraphView';
import AgentPanel from './components/AgentPanel';
import AutopilotPanel from './components/AutopilotPanel';
import ConnectionsPage from './components/ConnectionsPage';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import { useNotes } from './hooks/useNotes';
import { useAuth } from './hooks/useAuth';

const SilkCascade = lazy(() => import('./components/FlowField'));
const MoonlitRipple = lazy(() => import('./components/MoonlitRipple'));
const RainOnGlass = lazy(() => import('./components/RainOnGlass'));

type BgMode = 'solid' | 'silk' | 'moonlit' | 'rain';
const BG_KEY = 'template-03-bg';
const BG_COLOR_KEY = 'template-03-bg-color';

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

function LoginPrompt() {
  return (
    <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <Suspense fallback={null}>
        <MoonlitRipple />
      </Suspense>
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-[#e0e0e0] mb-2">{siteConfig.title}</h1>
          <p className="text-sm text-[#666]">{siteConfig.description}</p>
        </div>
        <div className="liquid-glass-strong rounded-xl px-8 py-6 flex flex-col items-center gap-4">
          <span className="relative z-10 text-xs text-[#888]">Sign in to start using your notes</span>
          <button
            onClick={() => { window.location.href = getOAuthUrl(); }}
            className="relative z-10 px-6 py-2.5 text-sm rounded-xl bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Sign in with Kimi
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteApp() {
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const { notes, isLoading: notesLoading, createNote, updateNote, deleteNote, deleteManyNotes } = useNotes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [search, setSearch] = useState('');
  const [bg, setBg] = useState<BgMode>(() => {
    const saved = localStorage.getItem(BG_KEY);
    if (saved === 'black') return 'solid';
    return (saved as BgMode) || backgroundConfig.defaultMode;
  });
  const [bgColor, setBgColor] = useState(() => localStorage.getItem(BG_COLOR_KEY) || backgroundConfig.defaultSolidColor);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showAutopilot, setShowAutopilot] = useState(false);

  const handleAgentUpsert = useCallback(async (title: string, content: string, tags: string[]) => {
    const existing = notes.find((n) => n.title === title);
    if (existing) {
      await updateNote(existing.id, { content, tags });
      setSelectedId(existing.id);
    } else {
      const n = await createNote(title, content);
      await updateNote(n.id, { tags });
      setSelectedId(n.id);
    }
    setViewMode('editor');
  }, [notes, createNote, updateNote]);

  useEffect(() => { localStorage.setItem(BG_KEY, bg); }, [bg]);
  useEffect(() => { localStorage.setItem(BG_COLOR_KEY, bgColor); }, [bgColor]);
  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

  useEffect(() => {
    document.title = siteConfig.title || 'My Notes';
    if (siteConfig.language) {
      document.documentElement.lang = siteConfig.language;
    }
    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = siteConfig.description || 'A calm personal notepad';
  }, []);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);
  const graphData = useMemo(() => buildGraphData(notes), [notes]);

  const handleNew = useCallback(async () => {
    try {
      const n = await createNote('Untitled', '');
      setSelectedId(n.id);
      setViewMode('editor');
    } catch {
      // createNote promise won't reject since we don't throw on error
    }
  }, [createNote]);

  const handleUpdate = useCallback((id: string, updates: Partial<Note>) => {
    updateNote(id, updates);
  }, [updateNote]);

  const handleDelete = useCallback((id: string) => {
    deleteNote(id);
    setSelectedId(null);
  }, [deleteNote]);

  const handleDeleteMany = useCallback((ids: string[]) => {
    deleteManyNotes(ids);
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
  }, [deleteManyNotes, selectedId]);

  const handleNavigate = useCallback(async (title: string) => {
    const found = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (found) {
      setSelectedId(found.id);
      setViewMode('editor');
    } else {
      try {
        const n = await createNote(title, '');
        setSelectedId(n.id);
        setViewMode('editor');
      } catch {
        // Silently fail if not authenticated
      }
    }
  }, [notes, createNote]);

  // Show login prompt if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <LoginPrompt />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={bg === 'solid' ? { backgroundColor: bgColor } : undefined}>
      <Suspense fallback={null}>
        {bg === 'silk' && <SilkCascade />}
        {bg === 'moonlit' && <MoonlitRipple />}
        {bg === 'rain' && <RainOnGlass />}
      </Suspense>

      <div className="relative z-10 h-full flex flex-col">
        <header className="liquid-glass h-11 shrink-0 flex items-center justify-between px-4">
          <div className="relative z-10 flex items-center gap-3">
            <span className="text-sm font-medium text-[#888]">&#9671;</span>
            {headerConfig.brandMark && <span className="text-xs text-[#888]">{headerConfig.brandMark}</span>}
            <span className="text-xs text-[#444]">{notes.length} {headerConfig.noteCountSuffix}</span>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            {(['editor', 'graph', 'connections'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === m ? 'text-[#e0e0e0] bg-white/[0.06]' : 'text-[#555] hover:text-[#999]'
                }`}
              >
                {m === 'editor' ? headerConfig.editorViewLabel : m === 'graph' ? headerConfig.graphViewLabel : '🔌 AI'}
              </button>
            ))}

            <button
              onClick={() => setShowAgent(!showAgent)}
              className="ml-1 px-2 py-1 text-xs text-[#444] hover:text-accent transition-colors"
              title="Note Agent — find keys, tasks & links"
            >
              &#10022;
            </button>

            <button
              onClick={() => setShowAutopilot(!showAutopilot)}
              className="ml-1 px-2 py-1 text-xs text-[#444] hover:text-accent transition-colors"
              title="🧠 Autopilote — propositions de l'IA"
            >
              🧠
            </button>

            <button
              onClick={() => setShowBgMenu(!showBgMenu)}
              className="ml-1 px-2 py-1 text-xs text-[#444] hover:text-[#888] transition-colors"
              title={headerConfig.backgroundButtonTitle}
            >
              &#9680;
            </button>

            {isAuthenticated && user && (
              <div className="ml-2 flex items-center gap-2">
                <span className="text-[10px] text-[#666]">{user.name || 'User'}</span>
                <button
                  onClick={logout}
                  className="text-[10px] text-[#555] hover:text-[#999] transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden gap-px">
          <Sidebar
            notes={notes}
            selectedId={selectedId}
            search={search}
            onSearch={setSearch}
            onSelect={(id) => { setSelectedId(id); setViewMode('editor'); }}
            onNew={handleNew}
            onDeleteMany={handleDeleteMany}
            onUpdate={handleUpdate}
          />

          <main className="flex-1 overflow-hidden">
            {authLoading || notesLoading ? (
              <div className="h-full flex items-center justify-center text-[#555] text-sm">Loading...</div>
            ) : viewMode === 'editor' && selectedNote ? (
              <NoteEditor
                key={selectedNote.id}
                note={selectedNote}
                allNotes={notes}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onNavigate={handleNavigate}
              />
            ) : viewMode === 'graph' ? (
              <GraphView
                data={graphData}
                onNodeClick={(id) => { setSelectedId(id); setViewMode('editor'); }}
                selectedNodeId={selectedId}
              />
            ) : viewMode === 'connections' ? (
              <ConnectionsPage />
            ) : (
              <div className="h-full flex items-center justify-center text-[#333] text-sm">{appConfig.emptyStateLabel}</div>
            )}
          </main>
        </div>
      </div>

      {showAgent && (
        <AgentPanel
          notes={notes}
          onUpsertNote={handleAgentUpsert}
          onClose={() => setShowAgent(false)}
        />
      )}

      {showAutopilot && (
        <AutopilotPanel onClose={() => setShowAutopilot(false)} />
      )}

      {showBgMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setShowBgMenu(false)} />
          <div className="fixed right-4 top-10 z-50 bg-[#111] border border-white/[0.06] rounded-lg py-1 min-w-[120px] shadow-2xl">
            {backgroundConfig.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { setBg(opt.id); if (opt.id !== 'solid') setShowBgMenu(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  bg === opt.id ? 'text-[#e0e0e0]' : 'text-[#666] hover:text-[#bbb]'
                }`}
              >
                {bg === opt.id && <span className="mr-1.5 text-accent">&#183;</span>}
                {opt.label}
              </button>
            ))}

            {bg === 'solid' && (
              <div className="px-3 py-2 border-t border-white/[0.06] mt-1 flex gap-2">
                {backgroundConfig.solidColors.map((c) => (
                  <button
                    key={c.color}
                    onClick={() => { setBgColor(c.color); setShowBgMenu(false); }}
                    title={c.label}
                    className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c.color,
                      boxShadow: bgColor === c.color ? '0 0 0 1.5px #888' : 'inset 0 0 0 1px rgba(255,255,255,0.15)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<NoteApp />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}