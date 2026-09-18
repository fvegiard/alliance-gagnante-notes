import type { Hono } from "hono";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/** Serve the built frontend from dist/ in production. */
export function serveStatic(app: Hono) {
  app.get("*", async (c) => {
    const distIndex = path.join(process.cwd(), "dist", "index.html");
    if (!existsSync(distIndex)) {
      return c.text("Frontend not built. Run: npm run build", 503);
    }
    const html = await readFile(distIndex, "utf-8");
    return c.html(html);
  });
}
