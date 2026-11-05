# Ruang Kerja

Local demo for the Dexa Group full-stack assessment. The employee portal uses blue and the Admin HR portal uses silver. Each has its own sign-in and invitation-based account activation screen.

## Run locally

Requires Docker Desktop with the Linux engine, Docker Compose, and Node.js 24 or 26. Run these commands from the repository in PowerShell.

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run dev
```

Open [Ruang Kerja](http://localhost:5173). Vite proxies `/api` to NestJS at `127.0.0.1:3000`. The API calls the separate attendance service at `127.0.0.1:3001`. MySQL 8.4 listens on `127.0.0.1:3307` and uses a named Docker volume.

The setup command generates secrets and demo credentials in `.env`. It preserves existing values when rerun. Keep this file private. The database migration creates separate MySQL runtime accounts for the two services. The migration command expects the supplied MySQL Compose service.

## Demo accounts

| Portal | Email | Value in `.env` |
| --- | --- | --- |
| Karyawan sign-in | `employee@example.test` | `DEMO_EMPLOYEE_PASSWORD` |
| Admin HR sign-in | `hr@example.test` | `DEMO_HR_PASSWORD` |
| Karyawan account activation | `employee.invite@example.test` | `DEMO_EMPLOYEE_INVITE` |
| Admin HR account activation | `hr.invite@example.test` | `DEMO_HR_INVITE` |

Pick the matching role in the form. An invitation works once for the preassigned email and role. The activation screen sets a new password, then returns to sign-in. Admin HR can create employees and share the generated code directly. Admin HR invitations are provisioned by the database seed for this demo.

## Walkthrough

1. Sign in as Admin HR, create an employee, and copy their invitation code.
2. In another browser session, choose Karyawan, activate the account with the code, and sign in.
3. Upload a synthetic JPEG or PNG of at most 2 MiB. Refresh to confirm the timestamp and protected evidence remain available.
4. In the HR session, open **Absensi**, filter by date or employee, and view the photo.
5. Deactivate the employee and confirm their existing session loses API access while HR can still review attendance.

## Verify

With MySQL and both API processes running, run `npm.cmd test` for the integration workflow. Run `npm.cmd run build` for TypeScript checking and the production frontend bundle. Health endpoints are `http://127.0.0.1:3000/api/health` and `http://127.0.0.1:3001/internal/health`.

The implementation uses parameterized SQL with `mysql2` and a versioned migration runner. Each service can access only its own table. Account activation extends the original design by requiring an invitation before a newly created employee can sign in.
