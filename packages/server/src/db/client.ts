import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config/index';
import * as schema from './schema/index';

// Single connection pool for the app. Connects via DATABASE_URL from the validated config.
export const pool = new Pool({ connectionString: config.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Database = typeof db;
