# AI-Assisted Development Log

This file discloses every use of an AI coding tool on this project, per the
Week 8 requirement. One entry per task. "The AI wrote it" is never a defence
in review - whoever commits a change is responsible for it.

## Assistance levels

1. **Autocomplete only** - inline suggestions accepted line-by-line.
2. **Single function/snippet** - one function or block generated from a prompt,
   reviewed and edited before committing.
3. **Multi-file task** - an agent edits more than one file in a single pass
   (e.g. a route plus its view) against an explicit scope.
4. **Autonomous / agentic** - the tool plans and executes a multi-step task
   with minimal turn-by-turn supervision.

## Entry template

```
### <date> - <short task title>

- Assistance level: <1-4>
- Files touched: <list>
- Prompt used:
  <the exact prompt>
- What was verified before committing:
  <manual checks, tests run, diff reviewed for the failure modes below>
```

## Example entry

### 2026-09-20 - Add status filter to GET /items

- Assistance level: 3
- Files touched: routes/items.js
- Prompt used:
  ```
  In routes/items.js only, add a status filter to GET /items.

  Constraints:
  - Validate status against the ENUM values
    ['unclaimed','claimed','returned']. Anything else -> ignore the
    filter, do not query.
  - Use a parameterised query; do not build SQL by concatenation.
  - Keep the existing ORDER BY and LIMIT.
  - Do not modify any other file.

  Done when: tests/health.test.js still passes and a manual check of
  /items?status=claimed shows only claimed items.
  ```
- What was verified before committing:
  - `git diff` showed changes only in `routes/items.js` - no scope creep.
  - Confirmed the query still uses a `?` placeholder, not string
    concatenation.
  - Ran `npm test`; `tests/health.test.js` passed unchanged.
  - Manually requested `/items?status=claimed` and `/items?status=bogus`
    (the second ignores the filter and returns everything, as specified).

### 2026-10-20 - System-wide review and hardening

- Assistance level: 4
- Files touched: app.js, middleware/ (auth, csrf, rateLimit, upload), utils/,
  routes/ (auth, items, admin, settings), models/ (itemModel,
  notificationModel), views (CSRF partial in every POST form, claims panel in
  admin/index.ejs, 403 message), sql/schema.sql, sql/migrations/003, tests/,
  README.md, .env.example
- Prompt used:
  ```
  improve the behavior of my system, please improve it all, if you see flaws
  fix it, dont change the design
  ```
- What was verified before committing:
  - Ran the new and existing tests plus end-to-end checks (login, CSRF,
    uploads, claim/status transactions) against a stubbed database.
  - NOT yet verified: a run against a real MySQL database, `npm test` with
    vitest on the project's own machine, and a manual click-through of the
    admin "Claims waiting for review" table. Do these before merging.

## Failure modes checked on every AI-generated diff

| Failure mode | How it's caught |
|---|---|
| Insecure by default | Search the diff for string-concatenated SQL, or `<%- %>` around a value from `req.body`/`req.query` |
| Silent scope creep | `git diff` before staging - a task scoped to one route should not reformat `app.js` |
| Confident invention | Run it - a method that doesn't exist on the `mysql2` pool fails immediately |
| Tests written to pass, not to test | Break the code on purpose and confirm the test actually fails |

### 2026-10-20 - Prepare Weeks 1-8 midterm copy

- Assistance level: 4
- Files touched: app.js, routes/auth.js, routes/items.js, routes/settings.js,
  views/*.ejs, middleware/, tests/, package.json, package-lock.json, README.md
- Prompt used: "implement only the week 1 to week 8"
- Changes: removed the custom CSRF layer, custom login-attempt rate limiter,
  extra security-header middleware, and later-course automated test suite from
  this separate midterm copy. Kept the primary website workflows and documented
  the project scope in README.md.
- What was verified before packaging: `node --check` passed for all 19 JavaScript
  files. A full browser/database test was not run in this environment because
  the MySQL server and complete npm dependency installation were unavailable.


## 2026-10-20 — Admin interface refinement
- **Task:** Improve the staff overview, Trash, Notifications, report table, typography, and sidebar navigation icons.
- **Tool:** ChatGPT (AI-assisted drafting).
- **Changes:** Updated the admin EJS views and shared stylesheet; added consistent line-style inline SVG navigation icons; improved table spacing, page headings, empty states, notification/claim cards, and responsive styling.
- **Scope check:** Kept the implementation within the Weeks 1–8 stack already used by the project (Express routes, EJS templates/partials, HTML, CSS, and existing form posts). No new framework or UI library added.
- **Verification:** Reviewed the changed templates and route relationships. Run the application locally and check the admin overview, `/admin/trash`, and `/notifications` with a staff account before submitting.


## 2026-10-21 — Separate student and admin views and CSS

- **Task:** Copy pages shared by staff and students into admin-owned EJS templates, and organize the stylesheets so the two interfaces can be customized separately.
- **Tool:** ChatGPT (AI-assisted drafting).
- **Changes:** Added an admin-only Campus Board at `/admin/campus-board`; changed the old `/admin` URL to redirect there; copied the item detail/report forms, claim receipt, notifications, profile/settings, home/information pages, and error pages into `views/admin/`. Staff routes now render the admin copies while student routes keep their existing templates.
- **CSS structure:** Student styles are under `public/css/student/`. Admin styles are under `public/css/admin/`, with separate Campus Board and admin notification stylesheets. Admin partials are under `views/admin/partials/`; student partials remain under `views/partials/`.
- **Scope check:** Uses the existing Express routes, EJS templates/partials, HTML, CSS, and JavaScript. No new framework or UI library added.
- **Verification:** `node --check` passed for the modified route/app files; all EJS templates compile and all relative EJS includes resolve. A live browser test against the project's MySQL database was not run here.
