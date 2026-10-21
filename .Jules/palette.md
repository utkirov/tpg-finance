## 2024-05-01 - Missing ARIA labels on icon-only buttons
**Learning:** Icon-only buttons using `class="x"` or `class="icon-btn"` often have a `:title` attribute but miss `:aria-label` for screen readers.
**Action:** Always verify that icon-only buttons have an explicit `aria-label`, reusing the translated `title` string when available.
