import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "./router";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { serveStatic } from "./lib/static";

const app = new Hono();

app.use("/api/*", cors({ credentials: true, origin: (o) => o || "*" }));

app.get("/api/oauth/callback", createOAuthCallbackHandler());

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => ({ headers: c.req.raw.headers }),
  })
);

serveStatic(app);

const port = 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
