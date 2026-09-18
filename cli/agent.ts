#!/usr/bin/env tsx
/**
 * Note Agent CLI — invoke the note agent from anywhere with just a
 * connector token. The server runs the full fallback chain
 * (NVIDIA K3 → your local Ollama → Kimi).
 *
 *   npx tsx cli/agent.ts "organize my notes"
 *
 * Config: cli/config.json → { "apiUrl": "https://…", "token": "agc_…" }
 * Token comes from the app's Connections page.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type Config = { apiUrl: string; token: string };

const here = dirname(fileURLToPath(import.meta.url));

function loadConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(join(here, "config.json"), "utf8")) as Partial<Config>;
    if (!raw.apiUrl || !raw.token) throw new Error("missing fields");
    return { apiUrl: raw.apiUrl.replace(/\/$/, ""), token: raw.token };
  } catch {
    console.error("✖ Missing or invalid cli/config.json — expected:");
    console.error('  { "apiUrl": "https://your-app", "token": "agc_…" }');
    process.exit(1);
  }
}

async function trpcCall(apiUrl: string, proc: string, payload: unknown): Promise<any> {
  const res = await fetch(`${apiUrl}/api/trpc/${proc}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: payload }),
  });
  const body = (await res.json().catch(() => null)) as any;
  const err = body?.error?.json?.message ?? body?.error?.message;
  if (!res.ok || err) throw new Error(err ?? `HTTP ${res.status} from ${proc}`);
  return body?.result?.data?.json ?? body?.result?.data;
}

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    console.error('Usage: npx tsx cli/agent.ts "your task here"');
    process.exit(1);
  }

  const { apiUrl, token } = loadConfig();
  const { answer, modelUsed } = await trpcCall(apiUrl, "ollama.cliAsk", { token, task });
  const icon = modelUsed.startsWith("ollama/") ? "🦙" : "⚡";
  console.log(`\n${icon} ${modelUsed}\n\n${answer}\n`);
}

main().catch((e) => {
  console.error(`✖ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
