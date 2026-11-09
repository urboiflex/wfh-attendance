# Ruang Kerja

Local demo for the Dexa Group full-stack assessment. Karyawan uses a blue sign-in page and Admin HR uses a separate silver sign-in page. HR creates and edits employee accounts.

## Run locally

Requires Docker Desktop with the Linux engine running, Docker Compose, Git, and Node.js 24 or 26. In PowerShell, clone the private repository using a GitHub account with access.

```powershell
git clone --branch codex/wfh-attendance https://github.com/urboiflex/wfh-attendance.git
cd wfh-attendance
```

For the first start, run these commands from the repository.

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev
```

Open [Ruang Kerja](http://localhost:5173). Vite proxies `/api` to NestJS at `127.0.0.1:3000`. The API calls the separate attendance service at `127.0.0.1:3001`. MySQL 8.4 listens on `127.0.0.1:3307` and uses a named Docker volume.

The setup command generates secrets and demo credentials in `.env`. It preserves existing values when rerun. Keep this file private. The database migration creates separate MySQL runtime accounts for the two services. The migration command expects the supplied MySQL Compose service.

For later starts, run `npm.cmd run db:up` and `npm.cmd run dev`. After pulling changes, rerun `npm.cmd ci` if dependencies changed and `npm.cmd run db:migrate` for schema updates. Keep the development terminal open. Ctrl+C stops the web app and both Node services. `docker compose stop` stops MySQL while retaining its volume.

Ports 5173, 3000, 3001, and 3307 must be available. If MySQL’s host port conflicts, change `MYSQL_PORT` in `.env` before starting Compose. If Compose reports a credential mismatch with an existing volume, use the environment file originally used to initialize that database. The seed preserves existing passwords on repeat runs.

## Demo accounts

| Portal | Email | Value in `.env` |
| --- | --- | --- |
| [Karyawan sign-in](http://localhost:5173/login/karyawan) | `employee@example.test` | `DEMO_EMPLOYEE_PASSWORD` |
| [Admin HR sign-in](http://localhost:5173/login/admin) | `hr@example.test` | `DEMO_HR_PASSWORD` |

Use the sign-in page for your account type. HR sets the initial employee password when creating an account and shares it privately. An employee from the previous invitation flow can sign in after HR sets their initial password using **Edit**.

After login, HR uses `/admin` and employees use `/karyawan`. Each role’s settings route is under its own dashboard path. A browser profile has one current login session. Use separate browser profiles or a private window to demonstrate both roles at the same time.

To seed an additional admin for a local demo, set `DEMO_EXTRA_HR_EMAIL` and `DEMO_EXTRA_HR_PASSWORD` in the Git-ignored `.env`, then run `npm.cmd run db:migrate`. Seeding preserves an existing account with the same email. Keep demo credentials local.

To create another admin, select **Buat sekarang** on the Admin HR login page and sign in with an existing Admin HR account. If you’re already signed in, use **Akun Admin** in the sidebar. New employee and admin accounts require an initial password of 12–128 characters. The login forms accept passwords of 8–128 characters for the local demo account as well.

## Walkthrough

1. Sign in as Admin HR. Use **Tambah karyawan** to set the employee code, name, email, and initial password. Use **Edit** to update the name or email.
2. In a separate browser session, open the Karyawan sign-in page and enter the employee’s email and password.
3. Upload a synthetic JPEG or PNG of at most 2 MiB. Refresh to confirm the timestamp and protected evidence remain available.
4. In the HR session, open **Absensi**, filter by date or employee, and view the photo.
5. Deactivate the employee and confirm their existing session loses API access while HR can still review attendance.
6. Click **Aktifkan kembali**. The employee can sign in again with the same password. Their older session remains invalid.

## Verify

With MySQL and both API processes running, run `npm.cmd test` for the integration workflow. Run `npm.cmd run build` for TypeScript checking and the production frontend bundle. Health endpoints are `http://127.0.0.1:3000/api/health` and `http://127.0.0.1:3001/internal/health`.

The tests use real MySQL, create synthetic fixtures, and clean up the fixture rows they own. Run the suite on the local assessment database.

The implementation uses parameterized SQL with `mysql2` and a versioned migration runner. The public API owns employee accounts and session revocations. The private service can read and insert attendance. The API limits employee account creation and editing to HR and gives HR read-only access to attendance.
