import { useEffect, useState } from 'react';
import { trpc } from '../providers/trpc';

export type AgentBackendChoice = 'kimi' | 'nvidia' | 'ollama';

export interface BackendSelection {
  backend: AgentBackendChoice;
  model?: string;
}

interface AgentBackendPickerProps {
  value: BackendSelection;
  onChange: (next: BackendSelection) => void;
}

/**
 * Backend selector for the Note Agent:
 *  🌙 Kimi direct (default — paid Kimi plan, falls back to orchestration on error)
 *  ⚡ Orchestration (heavy multi-model chain: NVIDIA → Ollama → Kimi)
 *  🦙 Ollama direct (force the user's local models only)
 * Shows an online/offline chip and a model picker when Ollama is selected.
 */
export default function AgentBackendPicker({ value, onChange }: AgentBackendPickerProps) {
  const [models, setModels] = useState<string[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  const statusQuery = trpc.ollama.status.useQuery(undefined, {
    enabled: value.backend === 'ollama',
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (value.backend !== 'ollama' || !statusQuery.data) return;
    setOnline(statusQuery.data.online);
    setModels(statusQuery.data.models);
    if (statusQuery.data.online && statusQuery.data.models.length > 0 && !value.model) {
      onChange({ ...value, model: statusQuery.data.models[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data, value.backend]);

  const select = (backend: AgentBackendChoice) => {
    onChange({ backend, model: backend === 'ollama' ? value.model : undefined });
  };

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-white/[0.04] p-0.5">
        <button
          onClick={() => select('kimi')}
          className={`px-2 py-1.5 text-[11px] rounded-md transition-colors ${
            value.backend === 'kimi' ? 'bg-accent/25 text-accent font-medium' : 'text-[#888] hover:text-[#bbb]'
          }`}
        >
          🌙 Kimi
        </button>
        <button
          onClick={() => select('nvidia')}
          className={`px-2 py-1.5 text-[11px] rounded-md transition-colors ${
            value.backend === 'nvidia' ? 'bg-accent/25 text-accent font-medium' : 'text-[#888] hover:text-[#bbb]'
          }`}
        >
          ⚡ Orchestration
        </button>
        <button
          onClick={() => select('ollama')}
          className={`px-2 py-1.5 text-[11px] rounded-md transition-colors ${
            value.backend === 'ollama' ? 'bg-accent/25 text-accent font-medium' : 'text-[#888] hover:text-[#bbb]'
          }`}
        >
          🦙 Ollama
        </button>
      </div>

      {value.backend === 'kimi' && (
        <p className="text-[10px] text-[#666]">
          Default — Kimi direct on your paid plan. Falls back to the orchestration chain if Kimi is unreachable.
        </p>
      )}

      {value.backend === 'nvidia' && (
        <p className="text-[10px] text-[#666]">
          Heavy multi-model orchestration chain: NVIDIA models → your local Ollama (if reachable) → Kimi.
        </p>
      )}

      {value.backend === 'ollama' && (
        <>
          {statusQuery.isLoading || online === null ? (
            <div className="text-[10px] text-[#777]">🦙 checking Ollama…</div>
          ) : online ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                🦙 online — {models.length} model{models.length === 1 ? '' : 's'}
              </span>
              {models.length > 0 && (
                <select
                  value={value.model ?? models[0]}
                  onChange={(e) => onChange({ ...value, model: e.target.value })}
                  className="flex-1 min-w-0 rounded-md bg-white/[0.06] border border-white/[0.08] text-[#ccc] text-[10px] px-1.5 py-1 outline-none"
                >
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-[#141414]">
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center rounded-md border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] text-red-300">
              🦙 Ollama offline — run `ollama serve`
            </span>
          )}
          <p className="text-[10px] text-[#666]">
            Direct mode — bypasses the fallback chain, uses only your local model.
          </p>
        </>
      )}
    </div>
  );
}
