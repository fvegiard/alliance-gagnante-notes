/**
 * Note Agent LLM configuration — shared between api/ and src/.
 *
 * AGENT_MODELS is an ordered fallback chain of models served through the
 * NVIDIA developer OpenAI-compatible endpoint (https://integrate.api.nvidia.com/v1).
 * The agent tries each model in order; models that no longer exist (404, or
 * 400/422 mentioning the model is missing/decommissioned/deprecated) are
 * recorded in `replacedModels` and skipped automatically.
 */
export const AGENT_MODELS = [
  "moonshotai/kimi-k3",
  "z-ai/glm-5-3-flash",
  "z-ai/glm-5-3",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "meta/muse-glimmer-30b",
  "poolside/laguna-xs-2.1",
] as const;

export type AgentModel = (typeof AGENT_MODELS)[number];

export type ReplacedModel = { model: string; reason: string };

export type AgentResult = {
  answer: string;
  modelUsed: string;
  replacedModels: ReplacedModel[];
};

/**
 * Selectable agent backends: NVIDIA hosted chain, a local Ollama instance,
 * or the Kimi coding endpoint.
 */
export const AGENT_BACKENDS = ["kimi", "nvidia", "ollama"] as const;
export type AgentBackend = (typeof AGENT_BACKENDS)[number];

/**
 * Default agent backend: Kimi direct (paid plan). The "nvidia" backend is the
 * heavy multi-model orchestration chain with automatic fallbacks.
 */
export const DEFAULT_BACKEND: AgentBackend = "kimi";

export type OllamaConfig = { baseUrl: string; model: string };
