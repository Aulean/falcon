import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import * as schema from './schema';

// Parse DATABASE_URL and handle SSL configuration for Bun SQL
const databaseUrl = process.env.DATABASE_URL!;
const cleanUrl = databaseUrl.replace(/[?&]sslmode=[^&]*/g, '');

// Parse TLS configuration - secure by default
function parseBooleanEnv(envVar: string | undefined): boolean {
  if (!envVar) return false;
  return envVar.toLowerCase() === 'true' || envVar === '1';
}

const tlsInsecure = parseBooleanEnv(process.env.DB_TLS_INSECURE);
const rejectUnauthorized = !tlsInsecure;

// Warn if TLS verification is intentionally disabled
if (tlsInsecure) {
  console.warn('⚠️  WARNING: TLS certificate verification is DISABLED (DB_TLS_INSECURE=true)');
  console.warn('⚠️  This should ONLY be used in development/testing environments!');
  console.warn('⚠️  Production environments should use valid TLS certificates.');
}

const client = new SQL({
  url: cleanUrl,
  // Bun SQL uses 'tls' instead of 'sslmode'
  tls: {
    rejectUnauthorized // Secure by default, only disabled with explicit env var
  }
});

// Initialize Drizzle with Bun SQL - proper syntax from docs
export const db = drizzle({ client, schema });

// Test database connection on startup
export async function testDatabaseConnection() {
  try {
    await db.execute('SELECT 1 as test');
    console.log('✅ Database connected successfully');
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
  }
}

