import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { notes } from "../db/schema";
import { env } from "./lib/env";

const SYSTEM_PROMPT = `You are the built-in Note Agent of a personal notes app. You help the user understand, organize, and clean up their notes. You are given the user's notes (titles + content) as JSON context, then the user's task.

Rules:
- Be concise and concrete. Reference notes by their exact titles.
- When the task is "organize" or "find important things", produce Markdown with clear sections.
- API keys, tokens, and secrets: quote them exactly as found, always citing the source note title, and add a short warning that live secrets should be moved to a password manager.
- Never invent content that is not in the notes.
- Use wiki-link syntax [[Exact Note Title]] when referencing notes.`;

const noteInput = z.object({
  title: z.string(),
  content: z.string().max(8000),
});

export const agentRouter = createRouter({
  ask: authedQuery
    .input(
      z.object({
        task: z.string().min(1).max(2000),
        notes: z.array(noteInput).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!env.kimiApiKey) {
        throw new Error("AI agent is not configured (missing KIMI_API_KEY)");
      }

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

      const resp = await fetch(`${env.kimiApiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.kimiApiKey}`,
        },
        body: JSON.stringify({
          model: env.kimiModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `NOTES CONTEXT (JSON):\n${JSON.stringify(context)}\n\nTASK:\n${input.task}`,
            },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Kimi API error (${resp.status}): ${text.slice(0, 300)}`);
      }

      const data = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error("Kimi returned an empty response");
      return { answer };
    }),

  /** AI organizer: assigns every note a folder + tags. */
  organize: authedQuery
    .input(
      z.object({
        notes: z.array(z.object({ id: z.number(), title: z.string(), content: z.string().max(2000) })).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!env.kimiApiKey) {
        throw new Error("AI agent is not configured (missing KIMI_API_KEY)");
      }
      const db = getDb();
      const userNotes = await db
        .select({ id: notes.id, title: notes.title, content: notes.content })
        .from(notes)
        .where(eq(notes.userId, ctx.user.id));
      const allowed = new Map(userNotes.map((n) => [n.id, n]));
      const context = input.notes.filter((n) => allowed.has(n.id));

      const resp = await fetch(`${env.kimiApiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.kimiApiKey}`,
        },
        body: JSON.stringify({
          model: env.kimiModel,
          messages: [
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
          max_tokens: 3000,
          temperature: 0.2,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Kimi API error (${resp.status}): ${text.slice(0, 300)}`);
      }
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
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
      return { updated, total: context.length };
    }),
});
