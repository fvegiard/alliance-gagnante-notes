import { and, eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { notes } from "../db/schema";

export const DAILY_NOTE_TITLE = "📅 Aujourd'hui";
export const SYSTEM_FOLDER = "Système";

/** Keep dated sections for the last N days (user retention rule). */
const RETENTION_DAYS = 14;

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/**
 * Upserts a dated section ("## YYYY-MM-DD — <section>") in the user's
 * "📅 Aujourd'hui" system note. Appending to today's section merges with any
 * existing content for that date. Sections older than RETENTION_DAYS days are
 * dropped. NEVER throws — system notes must never break a request.
 */
export async function upsertDailyNote(
  userId: number,
  section: string,
  markdown: string
): Promise<void> {
  try {
    const db = getDb();
    const date = todayKey();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [existing] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.title, DAILY_NOTE_TITLE)))
      .limit(1);

    // Split existing content into dated sections, keep only recent ones.
    const header = [
      `# ${DAILY_NOTE_TITLE}`,
      "",
      "Note système de l'autopilote : résumés quotidiens, tâches extraites et courriels à traiter.",
      "",
    ].join("\n");

    const sections = new Map<string, string>(); // "## YYYY-MM-DD — X" -> body
    const matches = existing?.content.match(/^## \d{4}-\d{2}-\d{2}[^\n]*\n[\s\S]*?(?=^## \d{4}-\d{2}-\d{2}|\s*$)/gm) ?? [];
    for (const block of matches) {
      const nl = block.indexOf("\n");
      const heading = block.slice(0, nl).trim();
      const dateStr = heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
      if (dateStr >= cutoff) sections.set(heading, block.slice(nl + 1).trim());
    }

    const todayHeading = `## ${date} — ${section}`;
    const body = markdown.trim();
    const merged = sections.has(todayHeading)
      ? `${sections.get(todayHeading)}\n\n${body}`
      : body;
    sections.set(todayHeading, merged);

    // Newest dates first.
    const ordered = [...sections.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const content = header + ordered.map(([h, b]) => `${h}\n\n${b}`).join("\n\n") + "\n";

    if (existing) {
      await db.update(notes).set({ content, folder: SYSTEM_FOLDER }).where(eq(notes.id, existing.id));
    } else {
      await db.insert(notes).values({
        userId,
        title: DAILY_NOTE_TITLE,
        content,
        folder: SYSTEM_FOLDER,
        tags: ["système", "autopilote"],
      });
    }
  } catch (e) {
    console.error("[daily-note] failed to upsert daily note:", e);
  }
}