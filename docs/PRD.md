# Product requirements and assessment coverage

Implemented state, 7 November 2026. The source is the supplied Dexa Group one-page full-stack technical test.

## Acceptance criteria

| ID | Outcome | Main implementation and verification |
| --- | --- | --- |
| AUTH-01 | An active employee or HR account signs in through the matching portal. | `server/api.ts` login handlers and `web/src/Auth.tsx`. API regression tests cover wrong-role credentials. Browser verification covers an existing session in the opposite portal. |
| AUTH-02 | Inactive employees lose API access and receive a login message with correct credentials. | Account status and session-version checks. The integration workflow tests deactivation, reactivation, old-session rejection, and a fresh login. |
| EMP-01 | HR creates, lists, and updates employees. | Employee API and `EmployeeList` in `web/src/Workspace.tsx`. Real MySQL integration and browser walkthrough. |
| EMP-02 | HR can deactivate and reactivate employees while preserving evidence. | Delete and reactivate endpoints, status button, FK, and regression workflow. |
| ATT-01 | An employee submits a photo with server-generated date and time. | Public upload guard and private attendance service. MySQL integration and browser check-in. |
| ATT-02 | Concurrent submissions create one daily record. | Unique employee/date constraint. Integration test expects one 201 and one 409. |
| ATT-03 | Invalid uploads fail before attendance is stored. | Multipart limits, image decoder, size and pixel validation. Tests cover empty, damaged, exact-size, and oversized uploads. |
| HR-01 | HR views attendance and evidence with filters and cannot modify attendance. | Monitoring screen and read routes. Tests reject HR attendance creation and attendance update/delete routes. |
| DATA-01 | The database has constraints and separate service credentials. | `server/migrate.ts` and `server/config.ts`. Tests check runtime account permissions. |
| RUN-01 | A reviewer can reproduce setup and demonstrate both roles. | README startup, migration, seed, test commands, and the demo guide. |

## Objective mapping

| Assessment objective | Evidence to show |
| --- | --- |
| Backend i · Proper database structure | Users and attendance tables, foreign key, unique indexes, revocations, and versioned migrations. |
| Backend ii · Database connection | `database()` in `server/config.ts` connects to MySQL. Each service has its own runtime account. |
| Backend iii · Microservices concept | Two NestJS processes. `attendanceRequest()` in the API makes authenticated internal HTTP calls to the private service. |
| Backend iv · API CRUD | Employee create, list/read, update, and deactivate endpoints. Explain soft deletion and preservation of attendance history. |
| Frontend i · Pages using JavaScript | React login and workspace screens in `web/src`. |
| Frontend ii · API calls | The shared `api()` and `json()` helpers in `web/src/client.ts`. Screens use the actual API. |
| Frontend iii · Custom components | Auth, Sidebar, Icon, WorkspacePage, PageButtons, and reusable state feedback. |

## Submission boundaries

The brief expects completion in 3–4 days with a maximum of five. It supplies no scoring weights, hosting requirement, or repository visibility requirement. Confirm any separate recruiter delivery instructions. The repository remains private until an authorized reviewer is given access or visibility is deliberately changed.
