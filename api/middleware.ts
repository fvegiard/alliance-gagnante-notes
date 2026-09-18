import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { authenticateRequest } from "./kimi/auth";

type Context = { headers: Headers };

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const createRouter = t.router;
export const publicQuery = t.procedure;

const authed = t.middleware(async ({ ctx, next }) => {
  const session = await authenticateRequest(ctx.headers);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  return next({ ctx: { ...ctx, user: session } });
});

export const authedQuery = t.procedure.use(authed);

export { z };
