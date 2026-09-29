## 2026-09-29 - Icon-only buttons accessibility
**Learning:** Icon-only remove buttons (like `class="x"` or `class="icon-btn"`) across this app used `title` for hover tooltips but lacked `aria-label` for screen readers. Both are needed when a button has no text content.
**Action:** Always ensure icon-only buttons have an explicit `aria-label` in addition to `title` (if used) for proper accessibility support.
