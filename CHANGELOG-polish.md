# Found IT! — polish pass

## Branding
- Visible name is now **Found IT!** (page titles, header, footer, login/signup, admin console, server log).

## Look and feel
- New `polish.css` layer for student and admin (loaded after the main stylesheets, so the originals are untouched).
- Smoother button and card motion (hover lift, press feedback); respects "reduce motion".
- Home page: new "How it works" steps and a call-to-action band (signed-in and signed-out variants); friendlier empty state.
- Error pages (403/404/500) now offer Back home / Browse campus board / Get help.

## Mobile
- Student header collapses into a menu button on phones (`js/student-nav.js`); closes on Esc or outside tap.
- The dark-mode switch was hidden on small screens; it is now inside the mobile menu.
- Admin sidebar gets a dimmed backdrop and closes when a link is tapped.
- Form fields use 16px text on phones (stops iOS zoom-on-focus); 44px tap targets on touch devices.
- Admin tables scroll sideways instead of overflowing.

## Usability (`js/enhance.js`)
- Submit buttons show a spinner and ignore double-clicks (no more duplicate reports/claims). The button is not disabled, so its name/value still reach the server.
- Show/Hide button on password fields (login, signup, profile/settings).
- Success messages fade after 6 seconds; errors stay.
- Back-to-top button on long pages.

## Accessibility
- "Skip to main content" link, visible keyboard focus rings everywhere, `aria-current` on active nav links.
- Fixed: admin nav wrote `aria-current` through `<%= %>`, which escaped the quotes and produced an invalid attribute. It now renders correctly.
- Meta description, theme colour, and favicon added.

## Bugs fixed along the way
- Login and signup showed every flash message twice (once above the card, once in it).
- Explicit dark mode used pure black for both page and cards; it now uses the same navy palette as the OS-dark default.
- "Recent campus reports" heading was nearly invisible in dark mode.

## Not changed
- Routes, models, SQL, database schema, and security behaviour are untouched.
- The gold call-to-action button in the home hero is kept as in the original design.

## Update: who is online + who posted
- **Online now** panel (logged-in users only) on the student home and campus board, and the admin home and campus board. Shows name, avatar and a Staff tag; you see "(you)" next to yourself. "Online" means active in the last 5 minutes.
- Presence is stored as `users.last_seen_at`, written at most once a minute per user (`middleware/activity.js`). Logging out removes you from the list immediately.
- **Run `sql/migrations/006_user_last_seen.sql` once** (fresh installs get it from `sql/schema.sql`). Without it the site still works; the panel stays hidden and one warning is logged.
- **Posted by <name>** on every item card (home, campus board) and on the item detail pages. It uses the poster's current account name, so a renamed account shows the new name on old posts.
- Privacy: visitors who are not logged in do not see the online list or poster names ("a CSPC member" is shown instead). Emails and contact details are never shown in the panel.

## Update: claim message box + status labels
- **Message box per claim** (`claim_messages` table, `models/messageModel.js`). The person who posted the found item, the person who claimed it, and staff can message each other on the item page (student and admin). The claim form also has an optional "Message to the finder" field that is sent with the claim. The other people in the conversation get a notification. Conversations close when the claim is rejected or the item is marked returned. After approval the item goes to Trash, so students open the thread from their notification (`/items/claims/:id/messages`).
- **Run `sql/migrations/007_claim_messages.sql` once.** Without it the site still works; the message box stays hidden.
- **Status names are now the same everywhere**: Unclaimed, Pending, Claimed, Returned (`utils/status.js`).
- **Admin**: status chips with counts on the Campus Board, and a *Change status* form on the item page (e.g. mark Returned once the owner has it). Pending is automatic when a claim is submitted. Reopening a report as Unclaimed brings it back from Trash. Claimants and the finder are notified when an item is marked Returned.

## Fix: admin notifications
- Every admin notification said "From Admin" with a generic ♧ icon, because the admin page ignored the sender and the old template hard-coded both. It now uses the same row layout as the student page: the sender's real name, photo or initials, and a Student / Admin / System badge.
- Each row opens through `/notifications/:id/open`, so it is marked read and goes to the right place (a trashed item no longer ends in a 404). Added All / Unread tabs, day groups and flash messages.
- Notifications made before `005_notification_sender.sql` was applied have no sender; that migration also fills them in.

## Update: admin approval for new reports
- A lost/found report posted by a student now starts as **pending**. It is hidden from the campus board, home page and counts until staff approve it. Only the student and staff can open it meanwhile (others get a 404), and it cannot be claimed.
- Staff are notified ("A new lost/found report needs review"). The admin Notifications page has a **Reports waiting for approval** panel with Approve & publish / Reject (optional reason), the same buttons appear on the report's page, and the Campus Board shows an *Awaiting approval* chip.
- The student is notified of the decision (rejected reports include the reason). Their report page and profile show *Waiting for admin approval* / *Rejected*.
- Reports posted by staff, and private "I found it" reports linked to a lost report, are published immediately.
- **Run `sql/migrations/008_item_approval.sql` once** (fresh installs get it from `sql/schema.sql`). Required: the site will error without the new columns.

## Fix: admin profile page looked unstyled
- **Symptom:** on the staff Profile page, "Recent reports" showed stacked filters and a plain table; in dark mode the text was nearly invisible.
- **Cause:** `admin.css` carries a copy of the student rules, and the profile styles (plus their `--student-*` colour variables) are scoped under `.student-area`. Admin pages never get that class, so none of it applied.
- **Fix:** the admin profile `<main>` now opts in with `student-area`. The student "dark mode fix" block that `admin.css` was missing is ported to the end of `admin.css`, so the profile cards are dark in dark mode.
- **Same cause, admin home:** the "No photo available" placeholder (`home-item-visual`, `home-no-photo`) is now styled for the admin shell in `admin/polish.css`.
