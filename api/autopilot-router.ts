import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiConnectors, aiProposals, notes } from "../db/schema";
import type { AiProposalKind, ReorgMove } from "../db/schema";
import { runAutopilotJobs } from "./autopilot-jobs";
import { SYSTEM_FOLDER } from "./daily-note";

const kindInput = z.enum(["reorg", "todo", "email", "digest"]);

const TODO_NOTE_TITLE = "✅ À faire";

/** Connector-token auth (agc_...) — same pattern as ollama.cliAsk. */
async function validateConnectorToken(token: string) {
  const db = getDb();
  const [conn] = await db
    .select()
    .from(aiConnectors)
    .where(and(eq(aiConnectors.token, token), eq(aiConnectors.status, "active")));
  if (!conn) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or revoked connector token" });
  await db.update(aiConnectors).set({ lastSeenAt: new Date() }).where(eq(aiConnectors.id, conn.id));
  return conn;
}

/** Applies a reorg payload: updates folders of notes that belong to the user. */
async function applyReorgMoves(userId: number, moves: ReorgMove[]): Promise<number> {
  const db = getDb();
  let applied = 0;
  for (const m of moves.slice(0, 50)) {
    if (typeof m?.noteId !== "number" || typeof m?.toFolder !== "string") continue;
    const res = await db
      .update(notes)
      .set({ folder: m.toFolder.slice(0, 100) })
      .where(and(eq(notes.id, m.noteId), eq(notes.userId, userId)));
    if ((res[0] as { affectedRows?: number }).affectedRows) applied += 1;
  }
  return applied;
}

/** Appends approved content to the user's "✅ À faire" note. */
async function appendToTodoNote(userId: number, markdown: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.title, TODO_NOTE_TITLE)))
    .limit(1);
  if (existing) {
    await db
      .update(notes)
      .set({ content: `${existing.content.trimEnd()}\n\n${markdown.trim()}\n` })
      .where(eq(notes.id, existing.id));
  } else {
    await db.insert(notes).values({
      userId,
      title: TODO_NOTE_TITLE,
      content: `# ${TODO_NOTE_TITLE}\n\n${markdown.trim()}\n`,
      folder: SYSTEM_FOLDER,
      tags: ["système", "autopilote", "todo"],
    });
  }
}

export const autopilotRouter = createRouter({
  /** Proposals of the current user — pending first, newest first, limit 50. */
  listProposals: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.userId, ctx.user.id))
      .orderBy(desc(aiProposals.createdAt))
      .limit(50);
    return rows.sort((a, b) =>
      a.status === "pending" && b.status !== "pending" ? -1 : b.status === "pending" && a.status !== "pending" ? 1 : 0
    );
  }),

  /**
   * Approve or reject a proposal. Approve + reorg applies the note moves;
   * approve + todo/email appends the content to the "✅ À faire" note.
   */
  resolveProposal: authedQuery
    .input(z.object({ id: z.string().min(1).max(36), action: z.enum(["approve", "reject"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(aiProposals)
        .where(and(eq(aiProposals.id, input.id), eq(aiProposals.userId, ctx.user.id)))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      if (p.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Proposal already resolved" });

      const now = new Date();
      if (input.action === "reject") {
        await db
          .update(aiProposals)
          .set({ status: "rejected", resolvedAt: now })
          .where(eq(aiProposals.id, p.id));
        return { status: "rejected" as const, applied: 0 };
      }

      let applied = 0;
      if (p.kind === "reorg") {
        const moves = (p.payload as { moves?: ReorgMove[] } | null)?.moves ?? [];
        applied = await applyReorgMoves(ctx.user.id, moves);
      } else if (p.kind === "todo" || p.kind === "email") {
        if (p.detail) await appendToTodoNote(ctx.user.id, p.detail);
        applied = 1;
      }
      await db
        .update(aiProposals)
        .set({ status: "done", resolvedAt: now })
        .where(eq(aiProposals.id, p.id));
      return { status: "done" as const, applied };
    }),

  /** Runs an autopilot job (or all of them) right now for the current user. */
  runNow: authedQuery
    .input(z.object({ kind: kindInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const r = await runAutopilotJobs(ctx.user.id, input.kind as AiProposalKind | undefined);
      return { ok: true, proposalsCreated: r.proposalsCreated, modelUsed: r.modelUsed };
    }),

  /**
   * PUBLIC, token-only entrypoint for the Kimi Claw daemon (connector token
   * agc_... — same pattern as ollama.cliAsk). Runs the requested job(s);
   * defaults to the daily digest.
   */
  clawRun: publicQuery
    .input(z.object({ token: z.string().min(10), kind: kindInput.optional() }))
    .mutation(async ({ input }) => {
      const conn = await validateConnectorToken(input.token);
      const r = await runAutopilotJobs(conn.userId, (input.kind ?? "digest") as AiProposalKind);
      return { ok: true, proposalsCreated: r.proposalsCreated, modelUsed: r.modelUsed };
    }),
});