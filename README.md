# Ruang Kerja

Local demo for the Dexa Group full-stack assessment. Karyawan uses a blue sign-in page and Admin HR uses a separate silver sign-in page. HR creates and edits employee accounts.

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
| [Karyawan sign-in](http://localhost:5173/login/karyawan) | `employee@example.test` | `DEMO_EMPLOYEE_PASSWORD` |
| [Admin HR sign-in](http://localhost:5173/login/admin) | `hr@example.test` | `DEMO_HR_PASSWORD` |

Use the sign-in page for your account type. HR sets the initial employee password when creating an account and shares it privately. An employee from the previous invitation flow can sign in after HR sets their initial password using **Edit**.

## Walkthrough

1. Sign in as Admin HR. Use **Tambah karyawan** to set the employee code, name, email, and initial password. Use **Edit** to update the name or email.
2. In a separate browser session, open the Karyawan sign-in page and enter the employee’s email and password.
3. Upload a synthetic JPEG or PNG of at most 2 MiB. Refresh to confirm the timestamp and protected evidence remain available.
4. In the HR session, open **Absensi**, filter by date or employee, and view the photo.
5. Deactivate the employee and confirm their existing session loses API access while HR can still review attendance.

## Verify

With MySQL and both API processes running, run `npm.cmd test` for the integration workflow. Run `npm.cmd run build` for TypeScript checking and the production frontend bundle. Health endpoints are `http://127.0.0.1:3000/api/health` and `http://127.0.0.1:3001/internal/health`.

The implementation uses parameterized SQL with `mysql2` and a versioned migration runner. Each service can access only its own table. The API limits employee account creation and editing to HR and gives HR read-only access to attendance.

The authentication screens use a [Tate Modern photograph by Jonny James](https://unsplash.com/photos/a-black-and-white-photo-of-a-curved-concrete-structure-ulFAi1jkNcA), under the [Unsplash License](https://unsplash.com/license).
