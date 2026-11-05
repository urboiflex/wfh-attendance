import { createPool } from 'mysql2/promise';

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run npm run setup first.`);
  return value;
}

export function database(user: 'migrate' | 'api' | 'attendance') {
  return createPool({
    host: '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3307),
    user: `wfh_${user}`,
    password: env(`MYSQL_${user.toUpperCase()}_PASSWORD`),
    database: 'wfh',
    timezone: 'Z',
    connectionLimit: 8,
    dateStrings: ['DATE'],
  });
}

export const maxPhoto = 2 * 1024 * 1024;
export const attendanceOrigin = 'http://127.0.0.1:3001';
export type Role = 'HR_ADMIN' | 'EMPLOYEE';
export type Actor = { id: number; role: Role };

export function jakartaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find(({ type }) => type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}
