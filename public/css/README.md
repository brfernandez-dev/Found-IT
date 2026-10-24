# CSS organization

- `student/style.css` — student pages and student-facing layout
- `student/notifications.css` — student notifications page
- `admin/admin.css` — staff/admin pages, sidebar, forms, tables and shared admin components
- `admin/campus-board.css` — Campus Board page-only overrides
- `admin/notifications.css` — staff notifications and claim-review page

Student templates load only `student/` stylesheets. Admin templates load only `admin/` stylesheets. The files are independent copies so changing one side will not change the other.
- `student/polish.css` — loaded after `style.css`; focus rings, motion, mobile menu, new home sections, dark-mode fixes
- `admin/polish.css` — loaded after `admin.css`; focus rings, motion, sidebar backdrop, scrollable tables, dark-mode fix
