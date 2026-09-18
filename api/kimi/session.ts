import { SignJWT, jwtVerify } from "jose";
import { env } from "../lib/env";
import type { SessionPayload } from "./types";

const secret = () => new TextEncoder().encode(env.appSecret);

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionPayload;
}
