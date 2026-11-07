import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
require('tsx/cjs');
const { jakartaDate } = require('../server/config.ts');

const origin = 'http://localhost:5173';
const endpoint = 'http://127.0.0.1:3000/api';

function testDatabase() {
  return mysql.createConnection({
    host: '127.0.0.1', port: Number(process.env.MYSQL_PORT ?? 3307), database: 'wfh',
    user: 'wfh_migrate', password: process.env.MYSQL_MIGRATE_PASSWORD,
  });
}

function request(path, { method = 'GET', cookie, json, body, requestOrigin = origin } = {}) {
  return fetch(endpoint + path, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(cookie && { Cookie: cookie }),
      ...(json && { 'Content-Type': 'application/json' }),
    },
    body: json ? JSON.stringify(json) : body,
  });
}

async function expectStatus(response, expected) {
  if (response.status !== expected) {
    assert.fail(`Expected ${expected}, received ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function login(email, password, role) {
  const response = await expectStatus(await request(`/auth/${role === 'HR_ADMIN' ? 'admin' : 'karyawan'}/login`, {
    method: 'POST', json: { email, password },
  }), 200);
  const session = response.headers.get('set-cookie');
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=Lax/i);
  return session.split(';')[0];
}

function photo(buffer) {
  const body = new FormData();
  body.set('photo', new Blob([buffer], { type: 'image/png' }), 'synthetic.png');
  return body;
}

test('HR provisions and edits employee accounts and can only view attendance', async (t) => {
  const hr = await login('hr@example.test', process.env.DEMO_HR_PASSWORD, 'HR_ADMIN');
  const other = await login('employee@example.test', process.env.DEMO_EMPLOYEE_PASSWORD, 'EMPLOYEE');
  const tag = randomUUID().slice(0, 8);
  const email = `test-${tag}@example.test`;
  const password = randomUUID();
  const employee = { email, employeeCode: `TEST-${tag}`, displayName: 'Karyawan Uji', password };
  await expectStatus(await request('/employees', { method: 'POST', cookie: other, json: employee }), 403);
  await expectStatus(await request('/auth/signup', { method: 'POST', json: employee }), 404);
  const created = await (await expectStatus(await request('/employees', { method: 'POST', cookie: hr, json: employee }), 201)).json();

  t.after(async () => {
    const db = await testDatabase();
    try {
      await db.execute('DELETE FROM attendance WHERE employee_id = ?', [created.id]);
      await db.execute('DELETE FROM users WHERE id = ? AND email = ?', [created.id, email]);
    } finally {
      await db.end();
    }
  });

  await expectStatus(await request('/employees', { cookie: other }), 403);
  await expectStatus(await request('/employees', { method: 'POST', cookie: hr, json: employee }), 409);
  await expectStatus(await request(`/employees/${created.id}`, {
    method: 'PATCH', cookie: hr, json: { email, displayName: 'Karyawan Terverifikasi' },
  }), 200);
  await expectStatus(await request('/auth/admin/login', { method: 'POST', json: { email, password } }), 401);
  await expectStatus(await request('/auth/karyawan/login', {
    method: 'POST', json: { email: 'hr@example.test', password: process.env.DEMO_HR_PASSWORD },
  }), 401);
  const worker = await login(email, password, 'EMPLOYEE');
  await expectStatus(await request('/attendance', { method: 'POST', cookie: worker, body: photo('invalid') }), 400);
  assert.equal((await (await request('/attendance/today', { cookie: worker })).json()).attendance, null);
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#2469bb' } }).png().toBuffer();
  await expectStatus(await request('/attendance', { method: 'POST', cookie: hr, body: photo(png) }), 403);
  const exactLimit = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 - png.length)]);
  await expectStatus(await request('/attendance', {
    method: 'POST', cookie: worker, body: photo(Buffer.concat([exactLimit, Buffer.alloc(1)])),
  }), 413);
  const submit = () => request('/attendance', { method: 'POST', cookie: worker, body: photo(exactLimit) });
  const submissions = await Promise.all([submit(), submit()]);
  assert.deepEqual(submissions.map((res) => res.status).sort(), [201, 409]);
  const row = await submissions.find((res) => res.status === 201).json();
  assert.match(row.submittedAt, /Z$/);
  assert.equal(row.date, new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date(row.submittedAt)));
  const evidence = `/attendance/${row.id}/evidence`;
  await expectStatus(await request(`/attendance/${row.id}`, { method: 'PATCH', cookie: hr, json: { date: row.date } }), 404);
  await expectStatus(await request(`/attendance/${row.id}`, { method: 'DELETE', cookie: hr }), 404);
  await expectStatus(await request(evidence, { cookie: other }), 404);
  const image = await expectStatus(await request(evidence, { cookie: hr }), 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 16);
  const list = await (await request(`/attendance?from=${row.date}&to=${row.date}&employeeId=${created.id}`, { cookie: hr })).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].employee.displayName, 'Karyawan Terverifikasi');
  await expectStatus(await fetch('http://127.0.0.1:3001/internal/attendance'), 403);
  await expectStatus(await request(`/employees/${created.id}`, { method: 'DELETE', cookie: hr }), 204);
  await expectStatus(await request(`/employees/${created.id}`, { method: 'DELETE', cookie: hr }), 204);
  await expectStatus(await request('/auth/me', { cookie: worker }), 401);
  await expectStatus(await request(evidence, { cookie: hr }), 200);

  const tryLogin = (candidate) => request('/auth/karyawan/login', { method: 'POST', json: { email, password: candidate } });
  const inactive = await expectStatus(await tryLogin(password), 403);
  assert.equal((await inactive.json()).message, 'Akun Anda dinonaktifkan sementara. Hubungi Admin HR untuk mengaktifkan kembali akun Anda.');
  const wrongPassword = await expectStatus(await tryLogin(randomUUID()), 401);
  assert.equal((await wrongPassword.json()).message, 'Email, kata sandi, atau jenis akun tidak cocok.');

  const reactivate = (cookie) => request(`/employees/${created.id}/reactivate`, { method: 'POST', cookie });
  await expectStatus(await reactivate(other), 403);
  await expectStatus(await reactivate(hr), 204);
  await expectStatus(await request('/auth/me', { cookie: worker }), 401);
  const signedInAgain = await login(email, password, 'EMPLOYEE');
  await expectStatus(await reactivate(hr), 204);
  await expectStatus(await request('/auth/me', { cookie: signedInAgain }), 200);
  await expectStatus(await request(evidence, { cookie: signedInAgain }), 200);
});

test('logout revokes the exact session without ending other sign-ins', async () => {
  const password = process.env.DEMO_EMPLOYEE_PASSWORD;
  const first = await login('employee@example.test', password, 'EMPLOYEE');
  const second = await login('employee@example.test', password, 'EMPLOYEE');
  await expectStatus(await request('/auth/logout', { method: 'POST', cookie: first }), 204);
  await expectStatus(await request('/auth/me', { cookie: first }), 401);
  await expectStatus(await request('/auth/me', { cookie: second }), 200);
});

test('successful logins do not exhaust the failed-login allowance', async () => {
  const db = await testDatabase();
  const tag = randomUUID().slice(0, 12);
  const email = `retry-${tag}@example.test`;
  const password = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  try {
    await db.execute(
      "INSERT INTO users (role, employee_code, display_name, email, password_hash) VALUES ('EMPLOYEE', ?, 'Login Test', ?, ?)",
      [`LOGIN-${tag}`, email, hash],
    );
    for (let attempt = 0; attempt < 13; attempt++) await login(email, password, 'EMPLOYEE');
    const wrong = () => request('/auth/karyawan/login', {
      method: 'POST', json: { email, password: 'definitely-incorrect' },
    });
    for (let attempt = 0; attempt < 12; attempt++) await expectStatus(await wrong(), 401);
    await expectStatus(await wrong(), 429);
  } finally {
    await db.execute('DELETE FROM users WHERE email = ?', [email]);
    await db.end();
  }
});

test('attendance rejects unauthorized multipart requests before parsing the upload', async () => {
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
  await expectStatus(await request('/attendance', { method: 'POST', body: photo(oversized) }), 401);
  const hr = await login('hr@example.test', process.env.DEMO_HR_PASSWORD, 'HR_ADMIN');
  await expectStatus(await request('/attendance', { method: 'POST', cookie: hr, body: photo(oversized) }), 403);
  await expectStatus(await fetch('http://127.0.0.1:3001/internal/attendance', {
    method: 'POST', headers: { 'x-service-key': 'forged', 'x-actor-id': '1', 'x-actor-role': 'EMPLOYEE' },
    body: photo(oversized),
  }), 403);
});

test('empty attendance photos return a validation error', async () => {
  const cookie = await login('employee@example.test', process.env.DEMO_EMPLOYEE_PASSWORD, 'EMPLOYEE');
  await expectStatus(await request('/attendance', { method: 'POST', cookie, body: photo(Buffer.alloc(0)) }), 400);
});

test('credentialed mutations reject a foreign Origin', async () => {
  const hr = await login('hr@example.test', process.env.DEMO_HR_PASSWORD, 'HR_ADMIN');
  await expectStatus(await request('/employees', {
    method: 'POST', cookie: hr, requestOrigin: 'https://untrusted.example',
    json: { email: 'csrf@example.test', employeeCode: 'CSRF', displayName: 'CSRF Test', password: randomUUID() },
  }), 403);
});

test('login rejects an accent-folded alias of another address', async () => {
  await expectStatus(await request('/auth/karyawan/login', {
    method: 'POST', json: { email: 'émployee@example.test', password: process.env.DEMO_EMPLOYEE_PASSWORD },
  }), 401);
});

test('a malformed stored password hash fails closed at login', async () => {
  const db = await testDatabase();
  const tag = randomUUID().slice(0, 12);
  const email = `bad-hash-${tag}@example.test`;
  try {
    await db.execute(
      "INSERT INTO users (role, employee_code, display_name, email, password_hash) VALUES ('EMPLOYEE', ?, 'Hash Test', ?, 'broken')",
      [`HASH-${tag}`, email],
    );
    await expectStatus(await request('/auth/karyawan/login', {
      method: 'POST', json: { email, password: randomUUID() },
    }), 401);
  } finally {
    await db.execute('DELETE FROM users WHERE email = ?', [email]);
    await db.end();
  }
});

test('the attendance day rolls over at midnight in Jakarta', () => {
  assert.equal(jakartaDate(new Date('2026-11-05T16:59:59.999Z')), '2026-11-05');
  assert.equal(jakartaDate(new Date('2026-11-05T17:00:00.000Z')), '2026-11-06');
});

test('runtime database grants keep employee and attendance records isolated', async () => {
  for (const [user, owned, denied] of [
    ['api', 'users', 'attendance'],
    ['attendance', 'attendance', 'users'],
  ]) {
    const db = await mysql.createConnection({
      host: '127.0.0.1', port: Number(process.env.MYSQL_PORT ?? 3307), database: 'wfh',
      user: `wfh_${user}`, password: process.env[`MYSQL_${user.toUpperCase()}_PASSWORD`],
    });
    try {
      await db.query(`SELECT id FROM ${owned} LIMIT 1`);
      await assert.rejects(db.query(`SELECT id FROM ${denied} LIMIT 1`), { code: 'ER_TABLEACCESS_DENIED_ERROR' });
      if (user === 'attendance') {
        await assert.rejects(db.query('DELETE FROM attendance WHERE 1 = 0'), { code: 'ER_TABLEACCESS_DENIED_ERROR' });
        await assert.rejects(db.query('UPDATE attendance SET evidence_size = 1 WHERE 1 = 0'), { code: 'ER_TABLEACCESS_DENIED_ERROR' });
      }
    } finally {
      await db.end();
    }
  }
});

test('HR can finish provisioning an existing employee account', async () => {
  const db = await testDatabase();
  const tag = randomUUID();
  const email = `pending-${tag}@example.test`;
  const inviteCode = randomUUID();
  const password = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}:${scryptSync(inviteCode, salt, 64).toString('hex')}`;
  try {
    const [created] = await db.execute(
      "INSERT INTO users (role, employee_code, display_name, email, password_hash, requires_activation) VALUES ('EMPLOYEE', ?, 'Karyawan Uji', ?, ?, TRUE)",
      [tag.slice(0, 12), email, hash],
    );
    const signInWithCode = () => request('/auth/karyawan/login', { method: 'POST', json: { email, password: inviteCode } });
    await expectStatus(await signInWithCode(), 401);
    const hr = await login('hr@example.test', process.env.DEMO_HR_PASSWORD, 'HR_ADMIN');
    const finishProvisioning = () => request(`/employees/${created.insertId}`, {
      method: 'PATCH', cookie: hr, json: { email, displayName: 'Karyawan Uji', initialPassword: password },
    });
    await expectStatus(await finishProvisioning(), 200);
    await expectStatus(await finishProvisioning(), 409);
    await expectStatus(await signInWithCode(), 401);
    await login(email, password, 'EMPLOYEE');
  } finally {
    await db.execute('DELETE FROM users WHERE email = ?', [email]);
    await db.end();
  }
});

test('both login portals validate credentials and only HR can create another admin', async () => {
  for (const portal of ['karyawan', 'admin']) {
    const attempt = (email, password) => request(`/auth/${portal}/login`, { method: 'POST', json: { email, password } });
    await expectStatus(await attempt('invalid-email', 'valid-length'), 400);
    await expectStatus(await attempt('user@example.test', 'short'), 400);
    await expectStatus(await attempt('user@example.test', 'x'.repeat(129)), 400);
  }
  const hr = await login('hr@example.test', process.env.DEMO_HR_PASSWORD, 'HR_ADMIN');
  const employee = await login('employee@example.test', process.env.DEMO_EMPLOYEE_PASSWORD, 'EMPLOYEE');
  const email = `new-admin-${randomUUID()}@example.test`;
  const password = randomUUID();
  const create = (cookie, fields = {}) => request('/admins', {
    method: 'POST', cookie, json: { email, password, displayName: 'Admin Uji', ...fields },
  });
  await expectStatus(await create(undefined), 401);
  await expectStatus(await create(employee), 403);
  await expectStatus(await create(hr, { email: 'invalid-email' }), 400);
  await expectStatus(await create(hr, { password: 'too short' }), 400);
  const db = await testDatabase();
  try {
    const created = await (await expectStatus(await create(hr), 201)).json();
    assert.deepEqual(Object.keys(created), ['id']);
    await expectStatus(await create(hr), 409);
    const newAdmin = await login(email, password, 'HR_ADMIN');
    await expectStatus(await request('/employees', { cookie: newAdmin }), 200);
    await expectStatus(await request('/auth/karyawan/login', { method: 'POST', json: { email, password } }), 401);
  } finally {
    await db.execute('DELETE FROM users WHERE email = ?', [email]);
    await db.end();
  }
});
