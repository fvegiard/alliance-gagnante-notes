import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "../lib/env";
import { signSessionToken, verifySessionToken } from "./session";
import { users } from "./platform";
import type { SessionPayload, TokenResponse } from "./types";
import { getDb } from "../queries/connection";
import { users as usersTable } from "../../db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "ag_session";

async function exchangeAuthCode(code: string, redirectUri: string): Promise<TokenResponse | null> {
  const resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.appId,
      client_secret: env.appSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!resp.ok) return null;
  return resp.json() as Promise<TokenResponse>;
}

async function verifyAccessToken(token: string) {
  return users.getProfile(token);
}

export async function authenticateRequest(headers: Headers): Promise<SessionPayload | null> {
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return await verifySessionToken(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function createOAuthCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code) return c.text("Missing code", 400);
    const redirectUri = state ? Buffer.from(state, "base64").toString() : `${new URL(c.req.url).origin}/api/oauth/callback`;
    const token = await exchangeAuthCode(code, redirectUri);
    if (!token) return c.text("OAuth exchange failed", 502);
    const profile = await verifyAccessToken(token.access_token);
    if (!profile) return c.text("Failed to fetch profile", 502);

    const db = getDb();
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.unionId, profile.unionId));
    let user = existing;
    if (!user) {
      const [r] = await db.insert(usersTable).values({
        unionId: profile.unionId,
        name: profile.nickname ?? null,
        email: profile.email ?? null,
        avatar: profile.avatar ?? null,
        role: profile.unionId === env.ownerUnionId ? "admin" : "user",
        lastSignInAt: new Date(),
      });
      const [created] = await db.select().from(usersTable).where(eq(usersTable.id, Number(r.insertId)));
      user = created;
    } else {
      await db.update(usersTable).set({ lastSignInAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const session: SessionPayload = {
      id: user.id, unionId: user.unionId, name: user.name, email: user.email,
      avatar: user.avatar, role: user.role,
    };
    const jwt = await signSessionToken(session);
    setCookie(c, SESSION_COOKIE, jwt, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return c.redirect("/");
  };
}

export { exchangeAuthCode, verifyAccessToken };
