import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiConnectors, notes } from "../db/schema";
import { env } from "./lib/env";
import { runAgentChain } from "./agent-chain";
import { recordModelAlerts } from "./agent-alerts";

const NOTE_AGENT_SYSTEM =
  "You are the Note Agent, a ruthless personal-knowledge assistant. " +
  "You receive the user's notes as JSON and a task. Answer directly, cite note titles, " +
  "quote exact strings when asked for secrets or links, and keep it tight.";

const offlineMessage = (baseUrl: string) =>
  `Ollama is not reachable at ${baseUrl} — start it with \`ollama serve\``;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type OllamaChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Direct Ollama call — forces the local model only (no fallback chain). */
async function ollamaDirect(
  messages: OllamaChatMessage[],
  model?: string
): Promise<{ answer: string; modelUsed: string }> {
  const base = env.ollamaBaseUrl.replace(/\/$/, "");
  const used = model ?? env.ollamaModel;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${base}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: used, messages, stream: false }),
      },
      120_000
    );
  } catch {
    throw new Error(offlineMessage(env.ollamaBaseUrl));
  }
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const answer = data.message?.content?.trim();
  if (!answer) throw new Error("Ollama returned an empty answer");
  return { answer, modelUsed: `ollama/${used}` };
}

async function notesForUser(userId: number) {
  const db = getDb();
  return db
    .select({ title: notes.title, content: notes.content })
    .from(notes)
    .where(eq(notes.userId, userId));
}

function buildNoteMessages(task: string, context: { title: string; content: string }[]): OllamaChatMessage[] {
  return [
    { role: "system", content: NOTE_AGENT_SYSTEM },
    { role: "user", content: `NOTES:\n${JSON.stringify(context)}\n\nTASK:\n${task}` },
  ];
}

async function validateConnectorToken(token: string) {
  const db = getDb();
  const [conn] = await db
    .select()
    .from(aiConnectors)
    .where(and(eq(aiConnectors.token, token), eq(aiConnectors.status, "active")));
  if (!conn) throw new Error("Invalid or revoked connector token");
  await db.update(aiConnectors).set({ lastSeenAt: new Date() }).where(eq(aiConnectors.id, conn.id));
  return conn;
}

const noteInput = z.object({
  title: z.string(),
  content: z.string().max(8000),
});

export const ollamaRouter = createRouter({
  /** Health check — never throws. */
  status: authedQuery.query(async () => {
    const base = env.ollamaBaseUrl.replace(/\/$/, "");
    try {
      const res = await fetchWithTimeout(`${base}/api/tags`, {}, 5_000);
      if (!res.ok) return { online: false, models: [] as string[] };
      const data = (await res.json()) as { models?: { name?: string }[] };
      const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
      return { online: true, models };
    } catch {
      return { online: false, models: [] as string[] };
    }
  }),

  /**
   * Note agent, powered ONLY by the user's local Ollama (manual override —
   * bypasses the NVIDIA→Ollama→Kimi fallback chain).
   */
  ask: authedQuery
    .input(
      z.object({
        task: z.string().min(1).max(2000),
        model: z.string().max(200).optional(),
        notes: z.array(noteInput).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only this user's notes may be sent — re-fetch from DB to be safe
      const userNotes = await notesForUser(ctx.user.id);
      const allowed = new Map(userNotes.map((n) => [n.title, n.content]));
      const context = input.notes
        .filter((n) => allowed.has(n.title))
        .map((n) => ({ title: n.title, content: allowed.get(n.title)! }));
      return ollamaDirect(buildNoteMessages(input.task, context), input.model);
    }),

  /**
   * PUBLIC, token-only CLI entrypoint (connector token agc_...) — same pattern
   * as connectors.readNotes. Runs the note agent through the FULL fallback
   * chain (NVIDIA → Ollama → Kimi).
   */
  cliAsk: publicQuery
    .input(
      z.object({
        token: z.string().min(10),
        task: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await validateConnectorToken(input.token);
      const userNotes = await notesForUser(conn.userId);
      const context = userNotes.map((n) => ({ title: n.title, content: n.content.slice(0, 8000) }));
      const { answer, modelUsed, replacedModels } = await runAgentChain({
        userId: conn.userId,
        task: input.task,
        notes: context,
      });
      await recordModelAlerts(conn.userId, replacedModels, modelUsed);
      return { answer, modelUsed, replacedModels };
    }),
});
