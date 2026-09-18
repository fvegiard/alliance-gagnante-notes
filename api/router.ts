import { authRouter } from "./auth-router";
import { notesRouter } from "./notes-router";
import { agentRouter } from "./agent-router";
import { connectorsRouter } from "./connectors-router";
import { ollamaRouter } from "./ollama-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  notes: notesRouter,
  agent: agentRouter,
  connectors: connectorsRouter,
  ollama: ollamaRouter,
});

export type AppRouter = typeof appRouter;
