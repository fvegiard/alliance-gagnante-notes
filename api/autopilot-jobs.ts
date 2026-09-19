import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { aiProposals, notes } from "../db/schema";
import type { AiProposalKind, ReorgMove } from "../db/schema";
import { callAgentLLM } from "./agent-chain";
import { recordModelAlerts } from "./agent-alerts";
import { upsertDailyNote } from "./daily-note";

export type JobKind = AiProposalKind;

export type JobResult = {
  kind: JobKind;
  proposalId: string | null;
  modelUsed: string;
};

export type AutopilotRunResult = {
  proposalsCreated: number;
  modelUsed: string;
  results: JobResult[];
};

const MAX_NOTES = 60;
const NOTE_SNIPPET = 200;

type NoteCtx = { id: number; title: string; folder: string | null; snippet: string };

async function notesContext(userId: number, recentDays?: number): Promise<NoteCtx[]> {
  const db = getDb();
  const where = recentDays
    ? // recent notes only (jobTodo)
      and(eq(notes.userId, userId), gte(notes.updatedAt, new Date(Date.now() - recentDays * 86_400_000)))
    : eq(notes.userId, userId);
  const rows = await db
    .select({ id: notes.id, title: notes.title, folder: notes.folder, content: notes.content })
    .from(notes)
    .where(where)
    .orderBy(desc(notes.updatedAt))
    .limit(MAX_NOTES);
  return rows.map((r) => ({ id: r.id, title: r.title, folder: r.folder, snippet: r.content.slice(0, NOTE_SNIPPET) }));
}

/** Extract the first JSON object/array from an LLM reply (tolerates code fences). */
function parseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "");
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function askKimi(system: string, task: string, context: NoteCtx[]) {
  return callAgentLLM(
    [
      { role: "system", content: system },
      { role: "user", content: `NOTES (JSON):\n${JSON.stringify(context)}\n\nTÂCHE:\n${task}` },
    ],
    { maxTokens: 4096, temperature: 0.2, backend: "kimi" }
  );
}

async function createProposal(
  userId: number,
  kind: JobKind,
  title: string,
  detail: string,
  payload: unknown
): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  await db.insert(aiProposals).values({ id, userId, kind, title, detail, payload });
  return id;
}

const SYSTEM_BASE =
  "Tu es l'autopilote d'un carnet de notes personnel. Tu réponds en français, " +
  "uniquement avec du JSON valide (aucun texte hors JSON, pas de balises markdown).";

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Proposes note regroupings/moves. NEVER applies them — a human approves via
 * autopilot.resolveProposal.
 */
export async function jobReorg(userId: number): Promise<JobResult> {
  try {
    const context = await notesContext(userId);
    const result = await askKimi(
      SYSTEM_BASE,
      'Propose des regroupements de notes par dossier. Réponds: {"moves":[{"noteId":number,"fromFolder":string|null,"toFolder":string}],"reason":string}. ' +
        "Déplace uniquement des notes clairement hors sujet dans leur dossier actuel. Maximum 10 déplacements. Zéro déplacement si tout est bien rangé.",
      context
    );
    await recordModelAlerts(userId, result.replacedModels, result.modelUsed);
    const parsed = parseJson<{ moves?: ReorgMove[]; reason?: string }>(result.content);
    const known = new Map(context.map((n) => [n.id, n]));
    const moves = (parsed?.moves ?? [])
      .filter(
        (m): m is ReorgMove =>
          typeof m?.noteId === "number" && known.has(m.noteId) && typeof m?.toFolder === "string"
      )
      .slice(0, 10)
      .map((m) => ({ noteId: m.noteId, fromFolder: known.get(m.noteId)!.folder, toFolder: m.toFolder }));
    if (moves.length === 0) return { kind: "reorg", proposalId: null, modelUsed: result.modelUsed };
    const detail =
      `Déplacements proposés (${parsed?.reason ?? "regroupement thématique"}):\n` +
      moves.map((m) => `- « ${known.get(m.noteId)!.title} » : ${m.fromFolder ?? "(inbox)"} → ${m.toFolder}`).join("\n");
    const proposalId = await createProposal(userId, "reorg", "Réorganisation proposée", detail, { moves });
    return { kind: "reorg", proposalId, modelUsed: result.modelUsed };
  } catch (e) {
    console.error("[autopilot] jobReorg failed:", e);
    return { kind: "reorg", proposalId: null, modelUsed: "" };
  }
}

/** Extracts pending tasks from the last 7 days of notes → "todo" proposal + daily note. */
export async function jobTodo(userId: number): Promise<JobResult> {
  try {
    const context = await notesContext(userId, 7);
    const result = await askKimi(
      SYSTEM_BASE,
      'Extrait les tâches en suspens (actions à faire, deadlines, rappels). Réponds: {"tasks":[{"task":string,"fromNote":string,"due":string|null}]}. Maximum 10 tâches.',
      context
    );
    await recordModelAlerts(userId, result.replacedModels, result.modelUsed);
    const parsed = parseJson<{ tasks?: { task: string; fromNote?: string; due?: string | null }[] }>(result.content);
    const tasks = (parsed?.tasks ?? []).filter((t) => typeof t?.task === "string").slice(0, 10);
    if (tasks.length === 0) return { kind: "todo", proposalId: null, modelUsed: result.modelUsed };
    const list = tasks
      .map((t) => `- [ ] ${t.task}${t.fromNote ? ` _(depuis « ${t.fromNote} »)_` : ""}${t.due ? ` — échéance: ${t.due}` : ""}`)
      .join("\n");
    await upsertDailyNote(userId, "Tâches", list);
    const proposalId = await createProposal(userId, "todo", "Tâches extraites des notes récentes", list, { tasks });
    return { kind: "todo", proposalId, modelUsed: result.modelUsed };
  } catch (e) {
    console.error("[autopilot] jobTodo failed:", e);
    return { kind: "todo", proposalId: null, modelUsed: "" };
  }
}

/** Detects unanswered emails mentioned in notes → "email" proposal with short French drafts. */
export async function jobEmail(userId: number): Promise<JobResult> {
  try {
    const context = await notesContext(userId);
    const candidates = context.filter((n) =>
      /courriel|email|e-mail|@/i.test(`${n.title} ${n.snippet}`)
    );
    if (candidates.length === 0) return { kind: "email", proposalId: null, modelUsed: "" };
    const result = await askKimi(
      SYSTEM_BASE,
      'Repère les courriels qui attendent une réponse et rédige un brouillon court en français pour chacun. Réponds: {"emails":[{"fromNote":string,"to":string|null,"subject":string,"draft":string}]}. Maximum 5 courriels.',
      candidates
    );
    await recordModelAlerts(userId, result.replacedModels, result.modelUsed);
    const parsed = parseJson<{ emails?: { fromNote?: string; to?: string | null; subject: string; draft: string }[] }>(
      result.content
    );
    const emails = (parsed?.emails ?? []).filter((m) => typeof m?.subject === "string" && typeof m?.draft === "string").slice(0, 5);
    if (emails.length === 0) return { kind: "email", proposalId: null, modelUsed: result.modelUsed };
    const detail = emails
      .map((m) => `### ${m.subject}${m.to ? ` (à: ${m.to})` : ""}\n${m.draft}`)
      .join("\n\n");
    const proposalId = await createProposal(userId, "email", "Courriels à répondre (brouillons)", detail, { emails });
    return { kind: "email", proposalId, modelUsed: result.modelUsed };
  } catch (e) {
    console.error("[autopilot] jobEmail failed:", e);
    return { kind: "email", proposalId: null, modelUsed: "" };
  }
}

/** Daily digest: runs reorg+todo+email summaries, appends to "📅 Aujourd'hui", creates a "digest" proposal. */
export async function jobDigest(userId: number): Promise<JobResult> {
  try {
    const reorg = await jobReorg(userId);
    const todo = await jobTodo(userId);
    const email = await jobEmail(userId);

    const db = getDb();
    const parts: string[] = [];
    const pullDetail = async (proposalId: string | null, label: string) => {
      if (!proposalId) return `- ${label}: rien à signaler.`;
      const [p] = await db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).limit(1);
      return `### ${label}\n${p?.detail ?? ""}`;
    };
    parts.push(await pullDetail(reorg.proposalId, "Réorganisation suggérée"));
    parts.push(await pullDetail(todo.proposalId, "Top tâches"));
    parts.push(await pullDetail(email.proposalId, "Courriels"));
    const markdown = parts.join("\n\n");
    await upsertDailyNote(userId, "Résumé quotidien", markdown);

    const modelUsed = [reorg, todo, email].map((r) => r.modelUsed).find(Boolean) ?? "";
    const proposalId = await createProposal(userId, "digest", "Résumé quotidien", markdown, {
      reorgProposalId: reorg.proposalId,
      todoProposalId: todo.proposalId,
      emailProposalId: email.proposalId,
    });
    return { kind: "digest", proposalId, modelUsed };
  } catch (e) {
    console.error("[autopilot] jobDigest failed:", e);
    return { kind: "digest", proposalId: null, modelUsed: "" };
  }
}

const JOBS: Record<JobKind, (userId: number) => Promise<JobResult>> = {
  reorg: jobReorg,
  todo: jobTodo,
  email: jobEmail,
  digest: jobDigest,
};

/** Runs one job (or all four) for a user. Total try/catch — never throws. */
export async function runAutopilotJobs(userId: number, kind?: JobKind): Promise<AutopilotRunResult> {
  const kinds: JobKind[] = kind ? [kind] : ["reorg", "todo", "email", "digest"];
  const results: JobResult[] = [];
  for (const k of kinds) {
    results.push(await JOBS[k](userId));
  }
  return {
    proposalsCreated: results.filter((r) => r.proposalId).length,
    modelUsed: results.map((r) => r.modelUsed).find(Boolean) ?? "",
    results,
  };
}