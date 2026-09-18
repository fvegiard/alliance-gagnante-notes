import { useMemo, useState } from 'react';
import type { Note } from '../types';
import { scanNotes, buildKeysNote, buildDigestNote, AGENT_NOTE_TITLES } from '../utils/agent';
import { trpc } from '../providers/trpc';
import AgentBackendPicker, { type BackendSelection } from './AgentBackendPicker';

interface AgentPanelProps {
  notes: Note[];
  onUpsertNote: (title: string, content: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}

const AI_NOTE_TITLES = {
  keys: '🔑 API Keys (AI)',
  digest: '🧭 AI Digest',
};

const MODEL_STATUS_TITLE = '⚠️ AI Models Status';

type ReplacedModel = { model: string; reason: string };

const AI_TASKS: { id: string; label: string; task: string; target: keyof typeof AI_NOTE_TITLES }[] = [
  {
    id: 'keys',
    label: 'Find every API key & secret',
    target: 'keys',
    task: 'Scan all notes and extract every API key, token, password, or secret. Quote each exactly as written, cite the source note title for each, group by service if identifiable, and end with a short security warning.',
  },
  {
    id: 'digest',
    label: 'Compile the important stuff',
    target: 'digest',
    task: 'Read all notes and produce a digest of what actually matters: open tasks, deadlines and dates, important links, decisions, and anything the user has clearly forgotten about. Cite source note titles. Be ruthless about excluding noise.',
  },
];

export default function AgentPanel({ notes, onUpsertNote, onClose }: AgentPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [replacedModels, setReplacedModels] = useState<ReplacedModel[]>([]);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const report = useMemo(() => scanNotes(notes), [notes]);
  const askMutation = trpc.agent.ask.useMutation();
  const ollamaAskMutation = trpc.ollama.ask.useMutation();
  const [backend, setBackend] = useState<BackendSelection>({ backend: 'nvidia' });

  const counts = {
    keys: report.keys.length,
    emails: report.emails.length,
    links: report.links.length,
    tasks: report.tasks.length,
    dates: report.dates.length,
  };

  const runLocal = async (kind: 'keys' | 'digest') => {
    setBusy(`local-${kind}`);
    setDone(null);
    setError(null);
    try {
      if (kind === 'keys') {
        await onUpsertNote(AGENT_NOTE_TITLES.keys, buildKeysNote(report), ['agent', 'keys']);
      } else {
        await onUpsertNote(AGENT_NOTE_TITLES.digest, buildDigestNote(report), ['agent', 'digest']);
      }
      setDone(`local-${kind}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setBusy(null);
    }
  };

  const persistModelStatus = async (replaced: ReplacedModel[], used: string) => {
    if (replaced.length === 0) return;
    const ts = new Date().toISOString();
    const newRows = replaced.map(
      (r) => `| \`${r.model}\` | ${r.reason.replace(/\|/g, '/')} | \`${used}\` | ${ts} |`
    );
    const existing = notes.find((n) => n.title === MODEL_STATUS_TITLE);
    const priorRows = existing?.content.match(/^\| `.+` \|.*\|.*\|.*\|$/gm) ?? [];
    const header =
      '# ⚠️ AI Models Status\n\nSome models in the AI fallback chain no longer exist and were automatically replaced. This note is maintained by the Note Agent.';
    const table = [
      '## Replaced models',
      '',
      '| Model | Reason | Replaced by | Timestamp |',
      '|---|---|---|---|',
      ...priorRows,
      ...newRows,
    ].join('\n');
    await onUpsertNote(MODEL_STATUS_TITLE, `${header}\n\n${table}\n`, ['agent', 'ai', 'models']);
  };

  const runAI = async (t: (typeof AI_TASKS)[number]) => {
    setBusy(`ai-${t.id}`);
    setDone(null);
    setError(null);
    setPreview(null);
    setModelUsed(null);
    setReplacedModels([]);
    setToolsUsed([]);
    try {
      const payload = {
        task: t.task,
        notes: notes.map((n) => ({ title: n.title, content: n.content.slice(0, 8000) })),
      };
      let used: string;
      let replaced: ReplacedModel[];
      let answer: string;
      let toolCalls: { name: string }[] = [];
      if (backend.backend === 'ollama') {
        const res = await ollamaAskMutation.mutateAsync({ ...payload, model: backend.model });
        ({ answer, modelUsed: used } = res);
        replaced = [];
      } else {
        const res = await askMutation.mutateAsync(payload);
        ({ answer, modelUsed: used, replacedModels: replaced, toolCalls } = res);
      }
      await onUpsertNote(AI_NOTE_TITLES[t.target], answer, ['agent', 'ai', t.id]);
      await persistModelStatus(replaced, used);
      setModelUsed(used);
      setReplacedModels(replaced);
      setToolsUsed([...new Set(toolCalls.map((tc) => tc.name))]);
      setPreview(answer);
      setDone(`ai-${t.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="liquid-glass-strong fixed right-4 top-10 z-50 w-[360px] max-h-[80vh] overflow-y-auto rounded-xl p-4 flex flex-col gap-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#e0e0e0]">Note Agent</span>
          <button onClick={onClose} className="text-[#555] hover:text-[#999] text-xs">✕</button>
        </div>

        <AgentBackendPicker value={backend} onChange={setBackend} />

        <div className="rounded-lg bg-accent/10 border border-accent/20 p-2.5">
          <div className="text-[11px] font-medium text-accent mb-1.5">
            {backend.backend === 'ollama' ? '🦙 AI Agent (Ollama — local)' : '✦ AI Agent (NVIDIA)'}
          </div>
          <div className="flex flex-col gap-1.5">
            {AI_TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => runAI(t)}
                disabled={busy !== null || notes.length === 0}
                className="w-full px-3 py-2 text-xs rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 text-left"
              >
                {busy === `ai-${t.id}` ? 'The agent is reading your notes…' : done === `ai-${t.id}` ? `✓ Saved to ${AI_NOTE_TITLES[t.target]}` : t.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#666] mt-1.5">The agent reads all your notes and writes the result as a new note.</p>
          {modelUsed && (
            <div className="mt-1.5 text-[10px] font-medium text-accent">⚡ model: {modelUsed}</div>
          )}
          {toolsUsed.length > 0 && (
            <div className="text-[10px] text-[#777]">🛠 tools used: {toolsUsed.join(', ')}</div>
          )}
          {replacedModels.map((r) => (
            <div
              key={r.model}
              className="mt-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-300"
              title={r.reason}
            >
              ⚠ {r.model} no longer exists — replaced by {modelUsed}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1 text-center">
          {(['keys', 'emails', 'links', 'tasks', 'dates'] as const).map((k) => (
            <div key={k} className="rounded-md bg-white/[0.04] py-1.5">
              <div className={`text-sm font-medium ${counts[k] > 0 ? 'text-accent' : 'text-[#555]'}`}>{counts[k]}</div>
              <div className="text-[9px] text-[#666] capitalize">{k}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => runLocal('keys')}
            disabled={busy !== null}
            className="w-full px-3 py-2 text-xs rounded-lg bg-white/[0.06] text-[#bbb] hover:bg-white/[0.1] transition-colors disabled:opacity-40 text-left"
          >
            {busy === 'local-keys' ? 'Working…' : done === 'local-keys' ? `✓ Saved` : `Quick scan: keys & emails → ${AGENT_NOTE_TITLES.keys}`}
          </button>
          <button
            onClick={() => runLocal('digest')}
            disabled={busy !== null}
            className="w-full px-3 py-2 text-xs rounded-lg bg-white/[0.06] text-[#bbb] hover:bg-white/[0.1] transition-colors disabled:opacity-40 text-left"
          >
            {busy === 'local-digest' ? 'Working…' : done === 'local-digest' ? `✓ Saved` : `Quick scan: tasks, links & dates → ${AGENT_NOTE_TITLES.digest}`}
          </button>
        </div>

        {error && <p className="text-[11px] text-red-400/90 leading-relaxed">{error}</p>}

        {preview && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 max-h-48 overflow-y-auto">
            <div className="text-[10px] text-[#666] mb-1">Agent's answer (saved as a note):</div>
            <pre className="text-[11px] text-[#999] whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
          </div>
        )}
      </div>
    </>
  );
}
