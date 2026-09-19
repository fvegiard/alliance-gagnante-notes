import { and, eq, like } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { notes } from "../db/schema";
import type { ReplacedModel } from "@contracts/ai";

const ALERT_TITLE = "🚩 Alertes IA";
const ALERT_FOLDER = "Système";
const MAX_ENTRIES = 100;

/** "kimi-fallback: ..." = temporary fallback (🟡); gone/decommissioned = 🔴. */
const isFallback = (reason: string) => /^kimi-fallback/i.test(reason);
const icon = (r: ReplacedModel) => (isFallback(r.reason) ? "🟡" : "🔴");
const status = (r: ReplacedModel) => (isFallback(r.reason) ? "🟡 fallback" : "🔴 délogué");

/**
 * Auto-flag: append a dated entry to the user's "🚩 Alertes IA" note whenever
 * a model is decommissioned or a fallback occurs. NEVER throws — failures are
 * logged only, so ask/organize/cliAsk requests are never broken by alerting.
 */
export async function recordModelAlerts(
  userId: number,
  replacedModels: ReplacedModel[],
  modelUsed: string
): Promise<void> {
  try {
    if (replacedModels.length === 0) return;
    const db = getDb();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const clean = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 200);

    const newLines = replacedModels.map(
      (r) =>
        `- **[${ts}]** ${icon(r)} \`${r.model}\` ${
          isFallback(r.reason) ? "fallback temporaire" : "délogué"
        } → remplacé par \`${modelUsed}\` (raison: ${clean(r.reason)})`
    );

    const [existing] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), like(notes.title, `%${ALERT_TITLE}%`)))
      .limit(1);

    // Prior journal entries + summary rows (if the note already exists)
    const priorJournal = existing?.content.match(/^- \*\*\[.+\]\*\*.*$/gm) ?? [];
    const summary = new Map<string, { status: string; ts: string }>();
    for (const row of existing?.content.match(/^\| `[^`]+` \| [^|]+ \| [^|]+ \|$/gm) ?? []) {
      const m = row.match(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/);
      if (m) summary.set(m[1], { status: m[2].trim(), ts: m[3].trim() });
    }
    for (const r of replacedModels) summary.set(r.model, { status: status(r), ts });

    const journal = [...priorJournal, ...newLines].slice(-MAX_ENTRIES);
    const tableRows = [...summary.entries()].map(
      ([model, s]) => `| \`${model}\` | ${s.status} | ${s.ts} |`
    );

    const content = [
      `# ${ALERT_TITLE}`,
      "",
      "Alertes automatiques du Note Agent : modèles délogués (🔴) ou fallbacks temporaires (🟡) dans la chaîne IA.",
      "",
      "## Récapitulatif",
      "",
      "| Modèle | Statut | Dernier événement |",
      "|---|---|---|",
      ...tableRows,
      "",
      "## Journal",
      "",
      ...journal,
      "",
    ].join("\n");

    if (existing) {
      await db.update(notes).set({ content, folder: ALERT_FOLDER }).where(eq(notes.id, existing.id));
    } else {
      await db.insert(notes).values({
        userId,
        title: ALERT_TITLE,
        content,
        folder: ALERT_FOLDER,
        tags: ["agent", "ai", "alertes"],
      });
    }
  } catch (e) {
    console.error("[agent-alerts] failed to record model alert:", e);
  }
}
