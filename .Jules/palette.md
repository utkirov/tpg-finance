## 2024-10-04 - Icon-only buttons accessibility pattern
**Learning:** The application heavily uses `class="x"` and `class="icon-btn"` for icon-only buttons (like delete/remove). These previously had `:title` attributes for tooltips but lacked explicit `:aria-label` attributes for screen readers.
**Action:** When adding new icon-only buttons in this app, always bind both `:title` and `:aria-label` using the `t()` translation function to ensure parity between sighted users and screen reader users.
