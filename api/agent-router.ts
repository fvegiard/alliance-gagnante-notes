import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { notes } from "../db/schema";
import { callAgentLLM, runAgentChain } from "./agent-chain";
import { AGENT_BACKENDS, DEFAULT_BACKEND } from "@contracts/ai";

const noteInput = z.object({
  title: z.string(),
  content: z.string().max(8000),
});

/** Backend selection: "kimi" = Kimi direct (default), "nvidia" = orchestration chain. */
const backendInput = z.enum(AGENT_BACKENDS).optional().default(DEFAULT_BACKEND);

export const agentRouter = createRouter({
  ask: authedQuery
    .input(
      z.object({
        task: z.string().min(1).max(2000),
        notes: z.array(noteInput).max(100),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(20)
          .optional(),
        backend: backendInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only this user's notes may be sent — re-fetch from DB to be safe
      const db = getDb();
      const userNotes = await db
        .select({ title: notes.title, content: notes.content })
        .from(notes)
        .where(eq(notes.userId, ctx.user.id));
      const allowed = new Map(userNotes.map((n) => [n.title, n.content]));
      const context = input.notes
        .filter((n) => allowed.has(n.title))
        .map((n) => ({ title: n.title, content: allowed.get(n.title)! }));

      const { answer, modelUsed, replacedModels, toolCalls } = await runAgentChain({
        userId: ctx.user.id,
        task: input.task,
        notes: context,
        history: input.history,
        backend: input.backend === "ollama" ? "nvidia" : input.backend,
      });
      return { answer, modelUsed, replacedModels, toolCalls };
    }),

  /** AI organizer: assigns every note a folder + tags. */
  organize: authedQuery
    .input(
      z.object({
        notes: z.array(z.object({ id: z.number(), title: z.string(), content: z.string().max(2000) })).max(200),
        backend: backendInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userNotes = await db
        .select({ id: notes.id, title: notes.title, content: notes.content })
        .from(notes)
        .where(eq(notes.userId, ctx.user.id));
      const allowed = new Map(userNotes.map((n) => [n.id, n]));
      const context = input.notes.filter((n) => allowed.has(n.id));

      const { content: raw, modelUsed, replacedModels } = await callAgentLLM(
        [
          {
            role: "system",
            content:
              "You organize notes into folders. Reply with ONLY a JSON array, no prose, no code fence: " +
              '[{"id": number, "folder": string, "tags": string[]}]. ' +
              "Folders: short names like AI, Dev, Keys, Personal, Projects, Ideas, Reference, Archive. Max 8 folders. " +
              "2-4 short tags per note. Every input note id must appear exactly once.",
          },
          { role: "user", content: JSON.stringify(context.map((n) => ({ id: n.id, title: n.title, preview: n.content.slice(0, 600) }))) },
        ],
        { maxTokens: 3000, temperature: 0.2, backend: input.backend === "ollama" ? "nvidia" : input.backend }
      );
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("AI did not return a JSON plan");
      const plan = JSON.parse(jsonMatch[0]) as { id: number; folder?: string; tags?: string[] }[];

      // Apply — only to notes owned by this user
      let updated = 0;
      for (const p of plan) {
        if (!allowed.has(p.id)) continue;
        await db
          .update(notes)
          .set({
            folder: typeof p.folder === "string" && p.folder.trim() ? p.folder.trim().slice(0, 100) : null,
            tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 6) : [],
          })
          .where(eq(notes.id, p.id));
        updated++;
      }
      return { updated, total: context.length, modelUsed, replacedModels };
    }),
});
