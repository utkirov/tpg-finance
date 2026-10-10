## 2024-04-19 - Missing ARIA labels on common icon-only buttons
**Learning:** The application frequently relies on `.x` and `.icon-btn` classes to style icon-only action buttons (e.g. for removing items or adding relations). While they provide visual affordances via titles, they systemically omit explicit `:aria-label` attributes, creating poor screen reader experiences.
**Action:** When adding or auditing icon-only buttons in the future (especially `.x` or `.icon-btn`), always ensure an `:aria-label` attribute (usually mirroring the `:title` with `t()`) is present.
