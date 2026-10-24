# Found IT! — Midterm Version (Weeks 1–8)

A campus Lost and Found website built with **Node.js, Express, EJS, and MySQL**. This version focuses on the foundational topics from Weeks 1–8: project setup, client/server requests, requirements, Express routes and middleware, EJS views, HTML forms, database CRUD, basic validation, error pages, and Git/AI documentation.

## Main functions

- Browse and filter lost/found reports.
- Submit a lost or found report using a form.
- View report details and uploaded item pictures.
- Sign in and use role-based staff pages to manage reports.
- Update item status and review claims.
- Store records in MySQL.

## Technology

- Node.js and npm
- Express.js routes and middleware
- EJS templates and shared partials
- MySQL with `mysql2`
- HTML forms and basic server-side validation
- Git workflow and AI-assisted development log

## Setup

1. Install Node.js and MySQL.
2. Open this project folder in VS Code or another editor.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and enter your local MySQL settings.
5. Create the database tables:

   ```bash
   mysql -u root -p < sql/schema.sql
   ```

   If you already have an existing Found-It database, apply the new Trash column migration instead of rerunning the full schema:

   ```bash
   mysql -u root -p found_it < sql/migrations/004_item_trash.sql
   ```

   The migration adds `trashed_at`, which is required for the 30-day Trash and automatic cleanup.

   Then apply the notification sender migration, so notifications show who actually sent them (a student or the admin):

   ```bash
   mysql -u root -p found_it < sql/migrations/005_notification_sender.sql
   ```

   To show who is online (the "Online now" panel), also apply the last-seen migration. It is safe to skip: the site works without it, the panel just stays hidden.

   ```bash
   mysql -u root -p found_it < sql/migrations/006_user_last_seen.sql
   ```

   To turn on the claim message box (finder, claimant and admin can message each other about a claim), apply the messages migration. Until you do, the site works and the message box stays hidden.

   ```bash
   mysql -u root -p found_it < sql/migrations/007_claim_messages.sql
   ```

   **Required for admin approval of new reports** (students' lost/found reports wait for staff to approve them before they reach the campus board). Existing reports stay visible. Run this before starting the updated site:

   ```bash
   mysql -u root -p found_it < sql/migrations/008_item_approval.sql
   ```

   (In phpMyAdmin: open the `found_it` database, choose the SQL tab, paste the file's contents and press Go.)

6. Start the website:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

## Environment variables

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`, and `SESSION_SECRET` in `.env`. Never upload your real `.env` file to Git.

## Scope note

This midterm copy removes the automated Vitest/SuperTest test suite, the custom CSRF middleware, custom login-attempt rate limiter, and extra security-header layer to keep the implementation closer to the Week 1–8 foundations. It retains the app's core lost-and-found features, login/session flow, role checks, MySQL data handling, and image uploads where those are part of the system requirements. This is a classroom-scope version, not a production security baseline.
