import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

// Shared Postgres client and Drizzle instance for the app
export const sql = postgres(databaseUrl, {
  max: 10,
  prepare: false,
  idle_timeout: 20,
});

export const db = drizzle(sql);

