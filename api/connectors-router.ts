import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiConnectors, notes } from "../db/schema";

const MASK = (v: string | null | undefined) =>
  v ? (v.length > 10 ? `${v.slice(0, 6)}…${v.slice(-4)}` : "•••") : null;

export const connectorsRouter = createRouter({
  /** List my connectors (api keys masked). */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(aiConnectors)
      .where(eq(aiConnectors.userId, ctx.user.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      endpoint: r.endpoint,
      apiKeyMasked: MASK(r.apiKey),
      model: r.model,
      token: r.token,
      status: r.status,
      lastSeenAt: r.lastSeenAt,
      createdAt: r.createdAt,
    }));
  }),

  /** Register a new AI connector. */
  add: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(100),
        platform: z.string().min(1).max(100),
        endpoint: z.string().max(500).optional(),
        apiKey: z.string().max(500).optional(),
        model: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `agc_${randomBytes(20).toString("hex")}`;
      const [r] = await db.insert(aiConnectors).values({
        userId: ctx.user.id,
        name: input.name,
        platform: input.platform,
        endpoint: input.endpoint ?? null,
        apiKey: input.apiKey ?? null,
        model: input.model ?? null,
        token,
      });
      return { id: Number(r.insertId), token };
    }),

  /** Disconnect / reconnect / delete. */
  setStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["active", "revoked"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(aiConnectors)
        .set({ status: input.status })
        .where(and(eq(aiConnectors.id, input.id), eq(aiConnectors.userId, ctx.user.id)));
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(aiConnectors)
        .where(and(eq(aiConnectors.id, input.id), eq(aiConnectors.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * PUBLIC endpoint — an external AI platform calls this with its bearer token
   * to read the note list it was granted access to. Marks lastSeenAt.
   * e.g. GET/POST with { token: "agc_..." } → returns notes (title + content).
   */
  readNotes: publicQuery
    .input(z.object({ token: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [conn] = await db
        .select()
        .from(aiConnectors)
        .where(and(eq(aiConnectors.token, input.token), eq(aiConnectors.status, "active")));
      if (!conn) throw new Error("Invalid or revoked connector token");

      await db
        .update(aiConnectors)
        .set({ lastSeenAt: new Date() })
        .where(eq(aiConnectors.id, conn.id));

      const userNotes = await db
        .select({ title: notes.title, content: notes.content, tags: notes.tags, folder: notes.folder, updatedAt: notes.updatedAt })
        .from(notes)
        .where(eq(notes.userId, conn.userId));
      return { notes: userNotes };
    }),
});
