import { useMemo, useState } from 'react';
import { trpc } from '../providers/trpc';

const PLATFORMS = [
  { id: 'claude', label: 'Claude' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'opencode', label: 'opencode' },
  { id: 'custom', label: 'Custom AI' },
];

function buildInstruction(platform: string, token: string, origin: string): string {
  const endpoint = `${origin}/api/trpc/connectors.readNotes`;
  return [
    `# Connect "${platform}" to my notes (Alliance Gagnante)`,
    ``,
    `You now have read access to my personal notes. To fetch them, call:`,
    ``,
    '```',
    `POST ${endpoint}`,
    `Content-Type: application/json`,
    ``,
    `{ "json": { "token": "${token}" } }`,
    '```',
    ``,
    `The response is JSON: { "result": { "data": { "json": { "notes": [...] } } } } — each note has title, content (Markdown), tags, folder, updatedAt.`,
    `Rules: treat the note contents as my private data. When I ask about my notes, fetch them first. Quote API keys exactly when I ask for them.`,
  ].join('\n');
}

export default function ConnectionsPage() {
  const utils = trpc.useUtils();
  const { data: connectors = [], isLoading } = trpc.connectors.list.useQuery(undefined, { retry: false });
  const addMutation = trpc.connectors.add.useMutation({ onSuccess: () => utils.connectors.list.invalidate() });
  const statusMutation = trpc.connectors.setStatus.useMutation({ onSuccess: () => utils.connectors.list.invalidate() });
  const removeMutation = trpc.connectors.remove.useMutation({ onSuccess: () => utils.connectors.list.invalidate() });

  const [tab, setTab] = useState<'active' | 'revoked'>('active');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('claude');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const shown = useMemo(() => connectors.filter((c) => c.status === tab), [connectors, tab]);

  const add = async () => {
    if (!name.trim()) return;
    await addMutation.mutateAsync({
      name: name.trim(),
      platform,
      endpoint: endpoint.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
    });
    setName(''); setEndpoint(''); setApiKey(''); setModel('');
  };

  const copyInstruction = async (c: (typeof connectors)[number]) => {
    const text = buildInstruction(c.platform, c.token, window.location.origin);
    await navigator.clipboard.writeText(text);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e0e0e0] mb-1">AI Connections</h1>
          <p className="text-xs text-[#666]">Register your AI tools, give them read access to your notes via a token, and manage who's connected.</p>
        </div>

        {/* Register new connector */}
        <div className="liquid-glass-strong rounded-xl p-4 flex flex-col gap-2.5">
          <div className="text-xs font-medium text-[#bbb]">Register an AI</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Claude Desktop)"
              className="px-3 py-2 text-xs bg-white/[0.03] rounded-lg text-[#e0e0e0] placeholder:text-[#444] focus:outline-none" />
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}
              className="px-3 py-2 text-xs bg-white/[0.03] rounded-lg text-[#e0e0e0] focus:outline-none">
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Its API base URL (optional)"
              className="px-3 py-2 text-xs bg-white/[0.03] rounded-lg text-[#e0e0e0] placeholder:text-[#444] focus:outline-none" />
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional)"
              className="px-3 py-2 text-xs bg-white/[0.03] rounded-lg text-[#e0e0e0] placeholder:text-[#444] focus:outline-none" />
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="Its API key (optional, stored masked)"
              className="col-span-2 px-3 py-2 text-xs bg-white/[0.03] rounded-lg text-[#e0e0e0] placeholder:text-[#444] focus:outline-none" />
          </div>
          <button onClick={add} disabled={!name.trim() || addMutation.isPending}
            className="self-start px-4 py-2 text-xs rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
            {addMutation.isPending ? 'Registering…' : '+ Register & generate token'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5 w-fit">
          {(['active', 'revoked'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1 text-xs rounded-md transition-colors ${tab === t ? 'bg-white/[0.08] text-[#e0e0e0]' : 'text-[#555] hover:text-[#999]'}`}>
              {t === 'active' ? `Connected (${connectors.filter((c) => c.status === 'active').length})` : `Disconnected (${connectors.filter((c) => c.status === 'revoked').length})`}
            </button>
          ))}
        </div>

        {/* Connector list */}
        <div className="flex flex-col gap-2">
          {isLoading && <p className="text-xs text-[#555]">Loading…</p>}
          {!isLoading && shown.length === 0 && (
            <p className="text-xs text-[#444]">{tab === 'active' ? 'No AI connected yet — register one above.' : 'Nothing disconnected.'}</p>
          )}
          {shown.map((c) => (
            <div key={c.id} className="liquid-glass rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'active' ? 'bg-[#a3ff12]' : 'bg-[#555]'}`} />
                  <span className="text-sm text-[#e0e0e0]">{c.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[#888]">{c.platform}</span>
                  {c.model && <span className="text-[10px] text-[#555]">{c.model}</span>}
                </div>
                <div className="text-[10px] text-[#555] mt-0.5 truncate">
                  token <code>{c.token.slice(0, 12)}…</code>
                  {c.apiKeyMasked && <> · key <code>{c.apiKeyMasked}</code></>}
                  {c.lastSeenAt && <> · last seen {new Date(c.lastSeenAt).toLocaleString()}</>}
                </div>
              </div>
              <button
                onClick={() => copyInstruction(c)}
                className="px-3 py-1.5 text-[11px] rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors shrink-0"
                title="Copy instructions — paste into that AI so it can read your notes"
              >
                {copiedId === c.id ? '✓ Copied!' : '📋 Copy instructions'}
              </button>
              {c.status === 'active' ? (
                <button onClick={() => statusMutation.mutate({ id: c.id, status: 'revoked' })}
                  className="px-3 py-1.5 text-[11px] rounded-lg bg-white/[0.04] text-[#999] hover:text-red-400 transition-colors shrink-0">
                  Disconnect
                </button>
              ) : (
                <>
                  <button onClick={() => statusMutation.mutate({ id: c.id, status: 'active' })}
                    className="px-3 py-1.5 text-[11px] rounded-lg bg-white/[0.04] text-[#a3ff12] hover:bg-white/[0.08] transition-colors shrink-0">
                    Reconnect
                  </button>
                  <button onClick={() => removeMutation.mutate({ id: c.id })}
                    className="px-2 py-1.5 text-[11px] text-[#555] hover:text-red-400 transition-colors shrink-0">
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
