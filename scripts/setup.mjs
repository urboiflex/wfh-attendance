import { randomBytes } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const secrets = [
  'MYSQL_ROOT_PASSWORD',
  'MYSQL_MIGRATE_PASSWORD',
  'MYSQL_API_PASSWORD',
  'MYSQL_ATTENDANCE_PASSWORD',
  'SESSION_SECRET',
  'INTERNAL_SECRET',
  'DEMO_HR_PASSWORD',
  'DEMO_EMPLOYEE_PASSWORD',
  'DEMO_HR_INVITE',
  'DEMO_EMPLOYEE_INVITE',
];

try {
  await writeFile('.env', [
    'MYSQL_PORT=3307',
    'PUBLIC_ORIGIN=http://localhost:5173',
    ...secrets.map((key) => `${key}=${randomBytes(24).toString('hex')}`),
    '',
  ].join('\n'), { flag: 'wx' });
  console.log('Created .env with local development secrets.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const existing = await readFile('.env', 'utf8');
  const missing = secrets.filter((key) => !new RegExp(`^${key}=`, 'm').test(existing));
  if (missing.length) {
    await appendFile('.env', '\n' + missing.map((key) => `${key}=${randomBytes(24).toString('hex')}`).join('\n') + '\n');
  }
  console.log('Using the existing .env file.');
}
