import { and, eq, like, or } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { notes } from "../db/schema";
import { env } from "./lib/env";
import { AGENT_MODELS } from "@contracts/ai";
import type { AgentBackend, ReplacedModel } from "@contracts/ai";

/* ------------------------------------------------------------------ */
/* Shared LLM caller with NVIDIA model fallback chain → Kimi fallback  */
/* ------------------------------------------------------------------ */

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: RawToolCall[];
};

type RawToolCall = {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

type ChatResponseMessage = { content?: string | null; tool_calls?: RawToolCall[] };
type ChatResponse = { choices?: { message?: ChatResponseMessage }[] };

export type LLMResult = {
  content: string;
  toolCalls: ToolCall[];
  modelUsed: string;
  replacedModels: ReplacedModel[];
};

export type CallOpts = {
  maxTokens: number;
  temperature: number;
  /** OpenAI-style tool definitions; sent with tool_choice "auto". */
  tools?: unknown[];
  /**
   * "kimi" (default-friendly direct mode): call the Kimi coding endpoint
   * directly, skipping the NVIDIA orchestration chain; on failure (network
   * error / 5xx / 429) automatically falls back to the full NVIDIA chain and
   * records the reason in `replacedModels` as "kimi-fallback: <error>".
   * "nvidia" or undefined: full orchestration chain (NVIDIA → Ollama → Kimi).
   */
  backend?: AgentBackend;
};

/** Body text patterns that mean "this model no longer exists on the endpoint". */
const MODEL_GONE_RE =
  /(does not exist|not found|no longer|decommissioned|deprecated|unknown model|invalid model|model)/i;

function modelGoneReason(status: number, body: string): string | null {
  if (status === 404) return `HTTP 404 — model not found on endpoint`;
  if ((status === 400 || status === 422) && MODEL_GONE_RE.test(body)) {
    return `HTTP ${status} — ${body.slice(0, 160)}`;
  }
  return null;
}

/**
 * Tries every model in AGENT_MODELS (NVIDIA OpenAI-compatible endpoint) in
 * order. Models that are gone (404, or 400/422 mentioning the model being
 * missing/decommissioned/deprecated) are recorded in `replacedModels` and
 * skipped. Transient errors (5xx, network) also fall through to the next
 * model. A 401/403 on the FIRST model means a bad key → hard config error.
 * If the whole NVIDIA chain fails and KIMI_API_KEY is set, falls back to the
 * Kimi endpoint as a last resort.
 */
export async function callAgentLLM(messages: ChatMessage[], opts: CallOpts): Promise<LLMResult> {
  const replacedModels: ReplacedModel[] = [];
  const transientErrors: string[] = [];

  const bodyFor = (model: string) =>
    JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
    });

  const parseMessage = (data: ChatResponse): { content: string; toolCalls: ToolCall[] } => {
    const msg = data.choices?.[0]?.message;
    const content = msg?.content?.trim() ?? "";
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
      .filter((tc) => tc?.function?.name)
      .map((tc, i) => {
        let args: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(tc.function!.arguments ?? "{}") as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          // malformed tool args — treat as no args
        }
        return { id: tc.id ?? `call_${i}`, name: tc.function!.name!, args };
      });
    return { content, toolCalls };
  };

  /** Direct call to the Kimi coding endpoint (throws on HTTP/network error). */
  const callKimi = async (): Promise<{ content: string; toolCalls: ToolCall[] }> => {
    const resp = await fetch(`${env.kimiApiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.kimiApiKey}`,
      },
      body: bodyFor(env.kimiModel),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Kimi API error (${resp.status}): ${text.slice(0, 300)}`);
    }
    const { content, toolCalls } = parseMessage((await resp.json()) as ChatResponse);
    if (!content && toolCalls.length === 0) throw new Error("Kimi returned an empty response");
    return { content, toolCalls };
  };

  // Kimi direct mode: skip the NVIDIA orchestration chain entirely. If the
  // direct call fails (network error, 5xx, 429, …), fall back to the full
  // orchestration chain as a safety net and record why.
  if (opts.backend === "kimi") {
    if (env.kimiApiKey) {
      try {
        const { content, toolCalls } = await callKimi();
        return { content, toolCalls, modelUsed: env.kimiModel, replacedModels };
      } catch (e) {
        replacedModels.push({
          model: env.kimiModel,
          reason: `kimi-fallback: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
        });
      }
    } else {
      replacedModels.push({ model: env.kimiModel, reason: "kimi-fallback: KIMI_API_KEY is not set" });
    }
  }

  if (env.nvidiaApiKey) {
    for (const [index, model] of AGENT_MODELS.entries()) {
      let resp: Response;
      try {
        resp = await fetch(`${env.nvidiaApiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.nvidiaApiKey}`,
          },
          body: bodyFor(model),
        });
      } catch (e) {
        // Network-level failure — try the next model.
        transientErrors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        if ((resp.status === 401 || resp.status === 403) && index === 0 && replacedModels.length === 0) {
          throw new Error(
            `AI agent misconfigured: NVIDIA API key rejected (HTTP ${resp.status}): ${body.slice(0, 200)}`
          );
        }
        const gone = modelGoneReason(resp.status, body);
        if (gone) {
          replacedModels.push({ model, reason: gone });
        } else {
          transientErrors.push(`${model}: HTTP ${resp.status} ${body.slice(0, 160)}`);
        }
        continue;
      }

      const { content, toolCalls } = parseMessage((await resp.json()) as ChatResponse);
      if (!content && toolCalls.length === 0) {
        transientErrors.push(`${model}: empty response`);
        continue;
      }
      return { content, toolCalls, modelUsed: model, replacedModels };
    }
  }

  // Middle fallback: the user's local Ollama instance (no tool calling —
  // a free-text reply ends the chain). Offline/error → continue to Kimi.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let resp: Response;
    try {
      resp = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: env.ollamaModel,
          messages: messages.map((m) => ({ role: m.role, content: m.content ?? "" })),
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (resp.ok) {
      const data = (await resp.json()) as { message?: { content?: string } };
      const content = data.message?.content?.trim() ?? "";
      if (content) {
        return { content, toolCalls: [], modelUsed: `ollama/${env.ollamaModel}`, replacedModels };
      }
      transientErrors.push(`ollama/${env.ollamaModel}: empty response`);
    } else {
      transientErrors.push(`ollama/${env.ollamaModel}: HTTP ${resp.status}`);
    }
  } catch (e) {
    // Ollama offline or unreachable — fall through to Kimi.
    transientErrors.push(`ollama/${env.ollamaModel}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Last-resort fallback: the Kimi coding endpoint.
  if (env.kimiApiKey) {
    const { content, toolCalls } = await callKimi();
    return { content, toolCalls, modelUsed: env.kimiModel, replacedModels };
  }

  if (!env.nvidiaApiKey) {
    throw new Error("AI agent is not configured (missing NVIDIA_API_KEY and KIMI_API_KEY)");
  }
  throw new Error(
    `All AI models failed. ${transientErrors.slice(0, 3).join("; ") || "no transient errors recorded"}`
  );
}

/* ------------------------------------------------------------------ */
/* LangChain-style agent chain in pure TS (tool-calling loop)          */
/* ------------------------------------------------------------------ */

const CHAIN_SYSTEM_PROMPT = `You are the built-in Note Agent of a personal notes app. You help the user understand, organize, and clean up their notes. You are given the user's notes (titles + content) as JSON context, plus optional conversation history, then the user's task.

You also have tools: search_notes (full-text search across the user's notes), create_note (save a new note), list_folders (list existing folders). Use them when they help; you may call several in sequence before answering.

Rules:
- Be concise and concrete. Reference notes by their exact titles.
- When the task is "organize" or "find important things", produce Markdown with clear sections.
- API keys, tokens, and secrets: quote them exactly as found, always citing the source note title, and add a short warning that live secrets should be moved to a password manager.
- Never invent content that is not in the notes.
- Use wiki-link syntax [[Exact Note Title]] when referencing notes.`;

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Full-text search across the user's notes (title and content). Returns matching note titles with snippets.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search text" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a new note in the user's notebook.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_folders",
      description: "List the folder names currently used by the user's notes.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeTool(userId: number, call: ToolCall): Promise<string> {
  const db = getDb();
  try {
    switch (call.name) {
      case "search_notes": {
        const query = String(call.args.query ?? "").slice(0, 200);
        if (!query) return "Empty query.";
        const pattern = `%${query}%`;
        const hits = await db
          .select({ title: notes.title, content: notes.content, folder: notes.folder })
          .from(notes)
          .where(and(eq(notes.userId, userId), or(like(notes.title, pattern), like(notes.content, pattern))))
          .limit(10);
        if (hits.length === 0) return `No notes match "${query}".`;
        return hits
          .map((h) => `- ${h.title}${h.folder ? ` [${h.folder}]` : ""}: ${h.content.slice(0, 200)}`)
          .join("\n");
      }
      case "create_note": {
        const title = String(call.args.title ?? "").trim().slice(0, 500);
        const content = String(call.args.content ?? "").slice(0, 20000);
        if (!title || !content) return "create_note requires non-empty title and content.";
        const tags = Array.isArray(call.args.tags) ? call.args.tags.map(String).slice(0, 6) : [];
        await db.insert(notes).values({ userId, title, content, tags });
        return `Note "${title}" created.`;
      }
      case "list_folders": {
        const rows = await db
          .select({ folder: notes.folder })
          .from(notes)
          .where(eq(notes.userId, userId));
        const folders = [...new Set(rows.map((r) => r.folder).filter((f): f is string => !!f))].sort();
        return folders.length ? folders.join(", ") : "No folders yet — all notes are in the inbox.";
      }
      default:
        return `Unknown tool "${call.name}".`;
    }
  } catch (e) {
    return `Tool "${call.name}" failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export type AgentChainInput = {
  userId: number;
  task: string;
  notes: { title: string; content: string }[];
  history?: { role: "user" | "assistant"; content: string }[];
  /** "kimi" = Kimi direct (fallback to orchestration chain); "nvidia"/undefined = full chain. */
  backend?: AgentBackend;
};

export type AgentChainResult = {
  answer: string;
  modelUsed: string;
  replacedModels: ReplacedModel[];
  toolCalls: { name: string; args: Record<string, unknown> }[];
};

const MAX_TOOL_ITERATIONS = 5;

/**
 * Runs the note-agent chain: builds messages (system + notes JSON context +
 * optional conversation history), then loops up to 5 times — if the model
 * requests tool calls (OpenAI function calling), executes them server-side,
 * appends the results, and calls the model again; a free-text reply ends the
 * chain. Model fallback (NVIDIA chain → Kimi) is handled by callAgentLLM.
 */
export async function runAgentChain(input: AgentChainInput): Promise<AgentChainResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: CHAIN_SYSTEM_PROMPT },
    {
      role: "user",
      content: `NOTES CONTEXT (JSON):\n${JSON.stringify(input.notes)}\n\nTASK:\n${input.task}`,
    },
  ];
  for (const h of input.history ?? []) {
    messages.push({ role: h.role, content: h.content.slice(0, 4000) });
  }

  const executedToolCalls: { name: string; args: Record<string, unknown> }[] = [];
  const replacedModels: ReplacedModel[] = [];
  let modelUsed = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await callAgentLLM(messages, {
      maxTokens: 4096,
      temperature: 0.3,
      tools: AGENT_TOOLS,
      backend: input.backend,
    });
    modelUsed = result.modelUsed;
    for (const r of result.replacedModels) {
      if (!replacedModels.some((x) => x.model === r.model)) replacedModels.push(r);
    }

    if (result.toolCalls.length === 0) {
      if (!result.content) throw new Error("AI agent returned an empty response");
      return { answer: result.content, modelUsed, replacedModels, toolCalls: executedToolCalls };
    }

    // Record the assistant turn (with tool calls) then run each tool.
    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });
    for (const tc of result.toolCalls) {
      executedToolCalls.push({ name: tc.name, args: tc.args });
      const output = await executeTool(input.userId, tc);
      messages.push({ role: "tool", tool_call_id: tc.id, content: output.slice(0, 4000) });
    }
  }

  throw new Error(`AI agent exceeded ${MAX_TOOL_ITERATIONS} tool iterations without a final answer`);
}
