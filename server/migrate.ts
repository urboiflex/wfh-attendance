import { spawnSync } from 'node:child_process';
import type { RowDataPacket } from 'mysql2';
import { database, env } from './config';
import { hashPassword } from './security';

const migrations = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role ENUM('HR_ADMIN', 'EMPLOYEE') NOT NULL,
    employee_code VARCHAR(24) UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) UNIQUE NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT employee_has_code CHECK ((role = 'EMPLOYEE') = (employee_code IS NOT NULL))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id INT UNSIGNED NOT NULL,
    attendance_date DATE NOT NULL,
    submitted_at_utc DATETIME(3) NOT NULL,
    evidence_mime ENUM('image/jpeg', 'image/png') NOT NULL,
    evidence_size INT UNSIGNED NOT NULL,
    evidence_bytes MEDIUMBLOB NOT NULL,
    CONSTRAINT attendance_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT attendance_employee_day UNIQUE (employee_id, attendance_date),
    INDEX attendance_date_order (attendance_date, submitted_at_utc, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `ALTER TABLE users ADD COLUMN requires_activation BOOLEAN NOT NULL DEFAULT FALSE`,
];

function provisionRuntimeUsers() {
  const statements = (['api', 'attendance'] as const).flatMap((name) => {
    const password = env(`MYSQL_${name.toUpperCase()}_PASSWORD`);
    if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('Use a setup-generated runtime database password.');
    const account = `'wfh_${name}'@'%'`;
    const grants = name === 'api' ? 'SELECT, INSERT, UPDATE ON wfh.users' : 'SELECT, INSERT ON wfh.attendance';
    return [
      `CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY '${password}';`,
      `GRANT ${grants} TO ${account};`,
    ];
  });
  const result = spawnSync('docker', [
    'compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root',
  ], { input: statements.join('\n'), encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Runtime database account provisioning failed. Check the Compose service and .env.');
}

async function migrate() {
  const pool = database('migrate');
  const connection = await pool.getConnection();
  try {
    const [lock] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('wfh-schema-migrations', 15) AS acquired");
    if (lock[0]?.acquired !== 1) throw new Error('Another migration is running.');
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY, applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    )`);
    for (const [index, sql] of migrations.entries()) {
      const version = index + 1;
      const [result] = await connection.execute<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version = ?', [version]);
      if (result.length > 0) continue;
      const [existing] = version === 3 ? await connection.query<RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'requires_activation'",
      ) : [[]];
      if (existing.length === 0) await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    }
    provisionRuntimeUsers();
    for (const account of [
      ['HR_ADMIN', null, 'Dina HR', 'hr@example.test', 'DEMO_HR_PASSWORD', false],
      ['EMPLOYEE', 'EMP-001', 'Raka Pratama', 'employee@example.test', 'DEMO_EMPLOYEE_PASSWORD', false],
      ['HR_ADMIN', null, 'Admin Undangan', 'hr.invite@example.test', 'DEMO_HR_INVITE', true],
      ['EMPLOYEE', 'EMP-002', 'Karyawan Undangan', 'employee.invite@example.test', 'DEMO_EMPLOYEE_INVITE', true],
    ] as const) {
      const [role, code, name, email, secret, requiresActivation] = account;
      await connection.execute(`
        INSERT INTO users (role, employee_code, display_name, email, password_hash, requires_activation)
        VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id
      `, [role, code, name, email, await hashPassword(env(secret)), requiresActivation]);
    }
    console.log('Schema, runtime accounts, and demo users are ready.');
  } finally {
    connection.destroy();
    await pool.end();
  }
}

void migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
