# Submission verification

Verified on 7 November 2026 using a new checkout of branch `codex/wfh-attendance`, generated environment secrets, and a new MySQL volume. The machine used Node 26.4.0, npm 11.17.0, MySQL 8.4, and Chrome.

## Results

| Check | Result |
| --- | --- |
| `npm.cmd ci` | Passed using the committed lockfile. Dependency audit reported zero known vulnerabilities. |
| `npm.cmd run setup` | Created a fresh Git-ignored environment file with generated credentials. |
| `npm.cmd run db:up` | MySQL became healthy on a separate scratch volume. |
| `npm.cmd run db:migrate` | All five migration versions applied. A repeat run succeeded. |
| `npm.cmd run build` | TypeScript and Vite production build passed. |
| `npm.cmd test` | All 12 tests passed against the new MySQL instance. |
| Browser rehearsal | HR employee create/edit, employee upload and reload, filtered HR evidence review, deactivation message, reactivation, mobile menu, and theme persistence passed. |
| Portal isolation | An HR session opening employee login retained the employee form, and HR credentials were rejected there. Automated tests cover wrong-role credentials in both directions. |
| Font loading | Browser font loading passed after fixing Vite’s project asset allowlist. |

The scratch checkout used host MySQL port 3317 and a unique Compose project name to isolate it from the existing local database. Application ports and the README startup commands were retained. The test-owned fixtures were removed.

## Automated regression scope

The suite exercises account provisioning and edits, HR read-only attendance, deactivation and reactivation, preserved evidence, old-session invalidation, logout revocation, successful-login throttling, unauthorized multipart rejection, empty and malformed photos, the exact 2 MiB upload boundary, oversize rejection, concurrent duplicate check-ins, foreign-origin mutations, email alias rejection, malformed stored hashes, Jakarta midnight, database grants, legacy pending accounts, and admin creation authorization.

## Setup issue found and corrected

A clean development checkout initially served the UI with a fallback font because Vite’s inferred filesystem boundary excluded the font package in the project-level dependencies. An explicit allowlist limited to the project directory fixes development asset access. The browser rehearsal was repeated with an assertion that Inter successfully loads.

## Limits and handoff

This verifies the local assessment setup and the exercised inputs. A public deployment, production load, and all possible malformed inputs remain outside this verification. The implementation uses employee deactivation as the delete operation. Its optional short demo password is configured locally, while a fresh setup generates random seed passwords.

Source verification was completed through commit `df030e1`. Subsequent submission changes update documentation only.
