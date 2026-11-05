import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import sharp from 'sharp';

const origin = 'http://localhost:5173';
const endpoint = 'http://127.0.0.1:3000/api';

function testDatabase() {
  return mysql.createConnection({
    host: '127.0.0.1', port: Number(process.env.MYSQL_PORT ?? 3307), database: 'wfh',
    user: 'wfh_migrate', password: process.env.MYSQL_MIGRATE_PASSWORD,
  });
}

function request(path, { method = 'GET', cookie, json, body } = {}) {
  return fetch(endpoint + path, {
    method,
    headers: {
      Origin: origin,
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
  const submit = () => request('/attendance', { method: 'POST', cookie: worker, body: photo(png) });
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
