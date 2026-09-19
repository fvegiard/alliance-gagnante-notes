import { useState } from 'react';
import { trpc } from '../providers/trpc';
import { toast } from 'sonner';

interface AutopilotPanelProps {
  onClose: () => void;
}

type Kind = 'reorg' | 'todo' | 'email' | 'digest';

const KIND_META: Record<Kind, { icon: string; label: string }> = {
  reorg: { icon: '🗂', label: 'Réorganisation' },
  todo: { icon: '✅', label: 'Tâches' },
  email: { icon: '✉️', label: 'Courriels' },
  digest: { icon: '📅', label: 'Digest' },
};

const RUN_OPTIONS: { id: Kind | 'all'; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'reorg', label: 'Réorganisation' },
  { id: 'todo', label: 'Tâches' },
  { id: 'email', label: 'Courriels' },
];

function relDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR');
}

function ReorgMoves({ payload }: { payload: unknown }) {
  const moves = (payload as { moves?: { noteId: number; fromFolder: string | null; toFolder: string }[] } | null)?.moves ?? [];
  if (moves.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5">
      {moves.map((m, i) => (
        <li key={i} className="text-[10px] text-[#999]">
          📝 note #{m.noteId} → 📁 {m.toFolder}
          {m.fromFolder ? <span className="text-[#555]"> (depuis {m.fromFolder})</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default function AutopilotPanel({ onClose }: AutopilotPanelProps) {
  const [runKind, setRunKind] = useState<Kind | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const proposalsQuery = trpc.autopilot.listProposals.useQuery(undefined, { refetchInterval: 30000 });
  const runMutation = trpc.autopilot.runNow.useMutation();
  const resolveMutation = trpc.autopilot.resolveProposal.useMutation();

  const proposals = proposalsQuery.data ?? [];
  const pending = proposals.filter((p) => p.status === 'pending');
  const resolved = proposals.filter((p) => p.status !== 'pending');

  const run = async () => {
    try {
      const res = await runMutation.mutateAsync(runKind === 'all' ? {} : { kind: runKind });
      toast.success(`✨ ${res.proposalsCreated} proposition${res.proposalsCreated > 1 ? 's' : ''} créée${res.proposalsCreated > 1 ? 's' : ''} · ⚡ ${res.modelUsed}`);
      await proposalsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'autopilote");
    }
  };

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await resolveMutation.mutateAsync({ id, action });
      if (action === 'approve') {
        toast.success(res.status === 'done' ? `✅ Appliquée${res.applied ? ` (${res.applied} modification${res.applied > 1 ? 's' : ''})` : ''}` : '✅ Approuvée');
      } else {
        toast.success('❌ Proposition rejetée');
      }
      await proposalsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action impossible');
    }
  };

  const renderCard = (p: (typeof proposals)[number]) => {
    const meta = KIND_META[p.kind as Kind] ?? { icon: '🧠', label: p.kind };
    const isPending = p.status === 'pending';
    return (
      <div
        key={p.id}
        className={`rounded-lg border p-2.5 ${
          isPending ? 'bg-accent/10 border-accent/20' : 'bg-white/[0.03] border-white/[0.06] opacity-60'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{meta.icon}</span>
          <span className="text-[11px] font-medium text-[#ddd] flex-1 truncate">{p.title}</span>
          {!isPending && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.status === 'done' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              {p.status === 'done' ? 'Done' : 'Rejetée'}
            </span>
          )}
          <span className="text-[9px] text-[#555] shrink-0">{relDate(p.createdAt)}</span>
        </div>
        {p.detail && (
          <pre className="mt-1.5 text-[10px] text-[#999] whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">{p.detail}</pre>
        )}
        {p.kind === 'reorg' && <ReorgMoves payload={p.payload} />}
        {isPending && (
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => resolve(p.id, 'approve')}
              disabled={resolveMutation.isPending}
              className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
            >
              ✅ Appliquer
            </button>
            <button
              onClick={() => resolve(p.id, 'reject')}
              disabled={resolveMutation.isPending}
              className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-white/[0.06] text-[#bbb] hover:bg-white/[0.1] transition-colors disabled:opacity-40"
            >
              ❌ Rejeter
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="liquid-glass-strong fixed right-4 top-10 z-50 w-[360px] max-h-[80vh] overflow-y-auto rounded-xl p-4 flex flex-col gap-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#e0e0e0]">🧠 Autopilote</span>
          <button onClick={onClose} className="text-[#555] hover:text-[#999] text-xs">✕</button>
        </div>

        <div className="rounded-lg bg-accent/10 border border-accent/20 p-2.5">
          <div className="flex gap-1.5">
            <select
              value={runKind}
              onChange={(e) => setRunKind(e.target.value as Kind | 'all')}
              disabled={runMutation.isPending}
              className="px-2 py-2 text-[11px] rounded-lg bg-white/[0.06] text-[#bbb] focus:outline-none disabled:opacity-40"
            >
              {RUN_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} className="bg-[#111]">{o.label}</option>
              ))}
            </select>
            <button
              onClick={run}
              disabled={runMutation.isPending}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
            >
              {runMutation.isPending ? '⏳ L\'autopilote réfléchit…' : '▶ Lancer maintenant'}
            </button>
          </div>
          <p className="text-[10px] text-[#666] mt-1.5">L'IA lit tes notes et propose réorganisations, tâches et courriels à traiter.</p>
        </div>

        {proposalsQuery.isLoading ? (
          <div className="text-center text-xs text-[#555] py-4">Chargement…</div>
        ) : proposals.length === 0 ? (
          <div className="text-center text-xs text-[#555] py-6 leading-relaxed">
            Rien à proposer — lance l'autopilote ou attends le prochain passage du daemon 🦀
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-wider text-[#555]">En attente ({pending.length})</div>
                {pending.map(renderCard)}
              </div>
            )}

            {resolved.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-[10px] uppercase tracking-wider text-[#555] hover:text-[#999] transition-colors text-left"
                >
                  {showHistory ? '▾' : '▸'} Historique ({resolved.length})
                </button>
                {showHistory && resolved.map(renderCard)}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}