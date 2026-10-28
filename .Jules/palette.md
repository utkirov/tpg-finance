## 2024-05-24 - Missing ARIA labels on icon-only buttons
**Learning:** Icon-only buttons often rely on `:title` attributes for tooltips but lack semantic accessible names for screen readers, leading to unannounced actions.
**Action:** Always ensure icon-only buttons using `class="x"` or `class="icon-btn"` have an explicit `:aria-label` matching their tooltip (`:title`).
