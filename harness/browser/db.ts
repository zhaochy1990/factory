// harness/browser/db.ts — direct-MySQL helper (mysql2 over TCP to the stack's
// real MySQL host port). This is the "断言直查库" half of the no-mock contract:
// what the browser did must be visible in the datastore, not just in the DOM.
import mysql from 'mysql2/promise';
import { config } from './config';

let pool: mysql.Pool | null = null;

export function db(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: 4,
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await db().query<mysql.RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
