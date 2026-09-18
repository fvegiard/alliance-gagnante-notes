import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../../lib/env";
import * as schema from "../../../db/schema";

let pool: mysql.Pool | null = null;

export function getDb() {
  if (!pool) {
    pool = mysql.createPool(env.databaseUrl);
  }
  return drizzle(pool, { schema, mode: "default" });
}
