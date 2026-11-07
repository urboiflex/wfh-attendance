# Demo and interview guide

## Before the call

Start Docker Desktop, then follow the README. Keep the terminal running `npm.cmd run dev` open. Open two browser profiles or one regular and one private window so each role has its own session. Have the generated HR seed password available locally and use a synthetic image.

## Five-minute walkthrough

| Time | Action | Explain |
| --- | --- | --- |
| 0:00–0:40 | Open the repository and show the architecture diagram. | React calls a public NestJS API, which delegates attendance to a separate NestJS process. Both use MySQL through separate credentials. |
| 0:40–1:30 | Sign in as HR, create an employee, and edit the display name. | HR owns employee master data. Unique email and employee-code constraints protect duplicate creation. |
| 1:30–2:30 | Sign in as the new employee in the second browser profile. Upload a synthetic photo, submit, and reload. | The server owns the clock. The attendance date is Jakarta-local and the stored instant is UTC. |
| 2:30–3:20 | Return to HR, open Absensi, filter the employee, and view the photo. | HR can review evidence. Both server authorization and the database service permissions protect attendance. |
| 3:20–4:15 | Deactivate the employee, attempt login, reactivate, and sign in again. | The login message explains the temporary status. Session versions prevent old sessions from returning after reactivation. |
| 4:15–5:00 | Show the test command and explain one concurrency test and one bug fix. | Two simultaneous submissions result in one attendance record. Logout revokes its exact token. |

Optional polish, if time remains, is to show the role-specific navigation, mobile drawer, and light/dark settings.

## Questions to rehearse

**Why two services?** The brief asks for the microservices concept. Separating attendance creates a real service boundary and a demonstrable failure boundary, while one repository and one MySQL instance keep setup manageable.

**Why parameterized SQL?** The small schema and limited queries remain easy to inspect. Parameters protect values from becoming SQL syntax, and constraints enforce integrity under concurrency.

**Why store images in MySQL?** One insert stores evidence and attendance together. That makes partial failure and cleanup simpler for a short assessment. At larger volume, object storage would reduce database and backup size, with explicit coordination between the object and its attendance record.

**Why soft delete?** Deactivating an account prevents future access while keeping evidence linked to its employee. The delete endpoint implements that lifecycle. Explain this interpretation if the evaluator asks for CRUD.

**What if the employee changes their clock?** The attendance service captures its own time. The client’s clock does not set the persisted timestamp or attendance day.

**What if a submission is retried?** MySQL’s unique employee/date key handles simultaneous requests. An uncertain client response triggers a status refresh. The client avoids automatic resubmission across midnight.

**What happens when the attendance service fails?** Attendance returns an upstream error, and employee account management can continue. The API has a bounded internal request timeout.

**What did testing uncover?** Explain the reproduced and fixed issues with logout replay, upload parsing before authorization, empty photos, accent-folded email aliases, malformed password hashes, and successful login rate-limit accounting.

**What would you improve for a public deployment?** HTTPS, shared rate limiting across API instances, operational monitoring and backups, and an evidence-storage strategy sized to actual use.

**What remains a tradeoff?** The browser uses one current session per browser profile. Use separate profiles to demonstrate two roles simultaneously. The service shares a database instance and a foreign key, so schema deployment remains coordinated.

## Delivery

Share the repository link and the exact branch `codex/wfh-attendance`. It is a private repository. Follow the recruiter’s instructions for granting reviewer access. Send passwords through the agreed private channel, or let the reviewer generate local seed credentials from setup.
