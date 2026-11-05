# WFH Attendance Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal** Build a runnable local assessment covering employee attendance and HR monitoring.

**Architecture** A React web app calls a public NestJS API. The API owns employee accounts and delegates check-ins and evidence retrieval to a separate private NestJS process over HTTP. MySQL enforces one attendance record per Jakarta day.

**Tech stack** TypeScript, React, Vite, NestJS, MySQL 8.4, mysql2, sharp.

**Spec** The assessment planning bundle contains the original design, architecture, and PRD. See the [project README](../../../README.md) for setup and the implemented account activation workflow.

## Global constraints

- Run the two NestJS processes independently. Serve the private service on loopback.
- Use a server timestamp, Asia/Jakarta attendance dates, and a JPEG or PNG photo up to 2 MiB and 16 megapixels.
- Preserve attendance and evidence when HR deactivates an employee. Authorize each protected request.

## Tasks

- [x] Provision MySQL with Compose, connect from Windows, and apply the schema and runtime account grants through `server/migrate.ts`.
- [x] Implement employee management, signed sessions, and one-time employee and HR account activation in `server/api.ts` and `server/security.ts`. Verify role restrictions, duplicate employee validation, and session invalidation after deactivation.
- [x] Implement check-ins and protected evidence in `server/attendance.ts`. Verify malformed uploads, concurrent submissions, internal credential checks, and scoped evidence access via `tests/api.test.mjs`.
- [x] Build blue Karyawan and silver Admin HR authentication screens, employee check-in, and HR management and monitoring in `web/src`. Verify the happy path in a browser and document setup in `README.md`.
- [ ] Extend regression coverage for photo size boundaries, a simulated Jakarta midnight rollover, and loss of the private service.

## Review focus

Check all handling of unknown network outcomes, per-role access, MySQL uniqueness under concurrency, immutable evidence, and setup from a fresh project directory.
