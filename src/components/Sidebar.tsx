import { useMemo, useState } from 'react';
import type { Note } from '../types';
import { sidebarConfig } from '../config';
import MoonPhase from './MoonPhase';
import { trpc } from '../providers/trpc';
import { toast } from 'sonner';

interface Props {
  notes: Note[];
  selectedId: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleteMany: (ids: string[]) => void;
  onUpdate: (id: string, updates: Partial<Note>) => void;
}

const FOLDER_COLORS = ['#ff2d78', '#ffe600', '#a3ff12', '#00e5ff', '#c792ea', '#ff9e64', '#7dac5a', '#e0e0e0'];

export default function Sidebar({ notes, selectedId, search, onSearch, onSelect, onNew, onDeleteMany, onUpdate }: Props) {
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [organizing, setOrganizing] = useState(false);
  const [organizeMsg, setOrganizeMsg] = useState<string | null>(null);
  const [organizeWarnings, setOrganizeWarnings] = useState<{ model: string; reason: string }[]>([]);
  const organizeMutation = trpc.agent.organize.useMutation();

  const filtered = search
    ? notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase()))
    : notes;
  const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

  // Group by folder (null folder → "Inbox" pseudo-group at top)
  const groups = useMemo(() => {
    const map = new Map<string, Note[]>();
    const inbox: Note[] = [];
    for (const n of sorted) {
      if (n.folder) {
        if (!map.has(n.folder)) map.set(n.folder, []);
        map.get(n.folder)!.push(n);
      } else {
        inbox.push(n);
      }
    }
    const folderNames = [...map.keys()].sort();
    return { inbox, folderNames, map };
  }, [sorted]);

  const folderColor = (name: string) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return FOLDER_COLORS[h % FOLDER_COLORS.length];
  };

  const toggleFolder = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const newFolder = () => {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    // Create the folder by moving the currently selected note into it,
    // or just remember it — folders materialize when a note has the folder field.
    if (selectedId) {
      onUpdate(selectedId, { folder: name.trim() });
    } else {
      alert('Select a note first — it will be moved into the new folder.');
    }
  };

  const organizeWithAI = async () => {
    setOrganizing(true);
    setOrganizeMsg(null);
    setOrganizeWarnings([]);
    try {
      const res = await organizeMutation.mutateAsync({
        notes: notes.map((n) => ({ id: Number(n.id), title: n.title, content: n.content.slice(0, 2000) })),
      });
      setOrganizeMsg(`✓ ${res.updated} notes organized · ⚡ model: ${res.modelUsed}`);
      if (res.replacedModels.length > 0) {
        setOrganizeWarnings(res.replacedModels);
        toast.warning(
          `${res.replacedModels.length} AI model(s) no longer exist — replaced by ${res.modelUsed}`,
          { description: res.replacedModels.map((r) => `⚠ ${r.model}`).join(', ') }
        );
      }
    } catch (e) {
      setOrganizeMsg(e instanceof Error ? e.message.slice(0, 120) : 'Organize failed');
    } finally {
      setOrganizing(false);
    }
  };

  // Drag note → folder
  const onDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('text/note-id', noteId);
  };
  const onDropToFolder = (e: React.DragEvent, folder: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/note-id');
    if (id) onUpdate(id, { folder });
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((n) => n.id)));
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    onDeleteMany([...selected]);
    setSelected(new Set());
    setManaging(false);
  };

  const exitManage = () => {
    setManaging(false);
    setSelected(new Set());
  };

  const renderNote = (note: Note) => (
    <button
      key={note.id}
      draggable={!managing}
      onDragStart={(e) => onDragStart(e, note.id)}
      onClick={() => (managing ? toggle(note.id) : onSelect(note.id))}
      className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-all flex items-center gap-2 ${
        managing
          ? selected.has(note.id)
            ? 'bg-red-500/10 text-[#e0e0e0]'
            : 'text-[#888] hover:bg-white/[0.03]'
          : note.id === selectedId
            ? 'bg-white/[0.06] text-[#e0e0e0]'
            : 'text-[#888] hover:bg-white/[0.03] hover:text-[#bbb]'
      }`}
    >
      {managing && (
        <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
          selected.has(note.id) ? 'bg-red-500/60 border-red-500/80 text-white' : 'border-[#555]'
        }`}>
          {selected.has(note.id) && '✓'}
        </span>
      )}
      <div className="text-sm truncate flex-1">{note.title}</div>
      {note.tags.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {note.tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[9px] px-1 rounded bg-white/[0.05] text-[#666]">{t}</span>
          ))}
        </div>
      )}
    </button>
  );

  return (
    <aside className="liquid-glass w-60 shrink-0 h-full">
      <div className="h-full flex flex-col relative z-10">
        <MoonPhase />

        <div className="px-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={sidebarConfig.searchPlaceholder}
            className="w-full px-3 py-2 text-sm bg-white/[0.03] rounded-lg text-[#e0e0e0] placeholder:text-[#444] focus:outline-none focus:bg-white/[0.05] transition-colors"
          />
        </div>

        <div className="px-3 pb-2 flex gap-1.5">
          <button
            onClick={newFolder}
            className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-white/[0.03] text-[#888] hover:text-[#ccc] transition-colors"
            title="Create a folder (moves the selected note into it)"
          >
            + Folder
          </button>
          <button
            onClick={organizeWithAI}
            disabled={organizing || notes.length === 0}
            className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
            title="AI sorts every note into folders with tags"
          >
            {organizing ? '✦ Sorting…' : '✦ AI Organize'}
          </button>
        </div>
        {organizeMsg && <div className="px-3 pb-1 text-[10px] text-[#666]">{organizeMsg}</div>}
        {organizeWarnings.map((w) => (
          <div
            key={w.model}
            className="mx-3 mb-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-300"
            title={w.reason}
          >
            ⚠ {w.model} no longer exists — replaced
          </div>
        ))}

        {managing && (
          <div className="px-3 pb-2 flex items-center justify-between">
            <button onClick={selectAll} className="text-xs text-[#888] hover:text-[#ccc] transition-colors">
              {selected.size === sorted.length ? sidebarConfig.clearSelectionLabel : sidebarConfig.selectAllLabel}
            </button>
            <span className="text-xs text-[#555]">{selected.size} {sidebarConfig.selectedCountSuffix}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2">
          {sorted.length === 0 && (
            <p className="text-center text-xs text-[#444] mt-8">{search ? sidebarConfig.noResultsLabel : sidebarConfig.emptyNotesLabel}</p>
          )}

          {/* Unfiled notes */}
          {groups.inbox.length > 0 && (
            <div
              className="mb-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropToFolder(e, null)}
            >
              {groups.folderNames.length > 0 && (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[#555]">Unfiled</div>
              )}
              {groups.inbox.map(renderNote)}
            </div>
          )}

          {/* Folders */}
          {groups.folderNames.map((name) => (
            <div
              key={name}
              className="mb-1 rounded-lg"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropToFolder(e, name)}
            >
              <button
                onClick={() => toggleFolder(name)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#aaa] hover:text-[#ddd] transition-colors"
              >
                <span style={{ color: folderColor(name) }}>{collapsed.has(name) ? '▸' : '▾'}</span>
                <span className="font-medium">📁 {name}</span>
                <span className="text-[#555] ml-auto">{groups.map.get(name)!.length}</span>
              </button>
              {!collapsed.has(name) && <div className="pl-2">{groups.map.get(name)!.map(renderNote)}</div>}
            </div>
          ))}
        </div>

        <div className="p-3 flex flex-col gap-1.5">
          {managing ? (
            <div className="flex gap-1.5">
              <button
                onClick={handleDelete}
                disabled={selected.size === 0}
                className={`flex-1 px-3 py-2 text-xs rounded-xl transition-colors ${
                  selected.size > 0
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/[0.03] text-[#444] cursor-not-allowed'
                }`}
              >
                {sidebarConfig.deleteSelectedLabel} {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
              <button
                onClick={exitManage}
                className="flex-1 px-3 py-2 text-xs rounded-xl text-[#888] bg-white/[0.03] hover:text-[#ccc] transition-colors"
              >
                {sidebarConfig.cancelLabel}
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={onNew}
                className="liquid-glass-strong flex-1 px-3 py-2 text-xs rounded-xl text-accent hover:brightness-125 transition-colors"
              >
                <span className="relative z-10">+ {sidebarConfig.newNoteLabel}</span>
              </button>
              <button
                onClick={() => setManaging(true)}
                className="px-3 py-2 text-xs rounded-xl text-[#555] hover:text-[#999] bg-white/[0.03] transition-colors"
              >
                {sidebarConfig.manageLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
