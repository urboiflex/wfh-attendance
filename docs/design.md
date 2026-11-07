# Product and interaction design

Implemented state, 7 November 2026.

## Purpose

Employees record WFH attendance with a photo and a server timestamp. HR manages employee master data and reviews attendance evidence. The assessment specifies NestJS, React, a database, API CRUD, and a microservices concept. The user selected MySQL and two independently running NestJS processes.

## Approaches considered

| Approach | Tradeoff |
| --- | --- |
| Two NestJS processes | A real network boundary makes the microservices concept demonstrable, with another process and internal credential to operate. The user selected this approach. |
| One modular NestJS process | Simpler startup, with less evidence of independently running services. |

## Roles and screens

Karyawan and Admin HR have separate login pages and dashboards. Wrong-role credentials are rejected. Opening the other login page with an existing session displays that role’s login form.

HR creates employee accounts with an initial password and can edit the employee’s name and email. HR can deactivate and reactivate employees, preserving historical attendance. Existing admins can create another admin. The Create now link on admin login requests existing HR authentication before displaying the creation form.

Employees see today’s attendance state, select and preview a photo, and submit. After confirmation, the recorded time and a protected evidence link remain available on reload. HR monitoring supports date ranges and an employee ID filter.

Both workspaces use a compact sidebar, menu search, and a collapse control. Mobile navigation uses a dialog drawer with keyboard focus handling. Settings supplies light and dark themes, saved per account in the current browser. Motion for React provides page and drawer transitions, respecting reduced-motion preferences.

## Policies

- One check-in per employee per Jakarta calendar day.
- Server time determines the attendance instant and date.
- Evidence is a required JPEG or PNG, up to 2 MiB and 16 megapixels.
- HR’s attendance access is read-only.
- Employee delete means deactivation. History and evidence remain reviewable.
- Password recovery, checkout, payroll, GPS, face recognition, exports, and self-service profile changes are outside the delivered scope.

The daily cadence and soft-delete interpretation are implementation choices where the brief leaves details open. A photo supplies evidence for review and does not establish location by itself.
