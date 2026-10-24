# Found-It design separation

## Student interface
- Views: `views/items/`, `views/partials/`, `views/pages/`, `views/notifications/`
- Main CSS: `public/css/student/style.css`
- Notification CSS: `public/css/student/notifications.css`
- Polish layer: `public/css/student/polish.css` (loaded after `style.css`)
- Student pages continue to use the existing `/items`, `/notifications`, `/profile`, `/settings`, `/about`, `/help`, and `/how-it-works` URLs.

## Admin interface
- Views: `views/admin/`
- Campus Board: `views/admin/campus-board.ejs` at `/admin/campus-board`
- Shared-page copies: `views/admin/items/`, `views/admin/notifications/`, `views/admin/pages/`
- Admin partials: `views/admin/partials/`
- Main CSS: `public/css/admin/admin.css`
- Campus Board CSS: `public/css/admin/campus-board.css`
- Notification CSS: `public/css/admin/notifications.css`
- Polish layer: `public/css/admin/polish.css` (loaded after `admin.css`)

Admin and student templates are separate files. They can use the same model and existing form/action routes while their HTML, partials, and CSS are customized independently. Do not import the student stylesheet from admin templates or the admin stylesheet from student templates.
