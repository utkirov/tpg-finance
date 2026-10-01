## 2023-10-01 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Found a recurring pattern in the application where icon-only buttons (especially those with classes like `x` and `icon-btn`) used `title` or `:title` for tooltips but lacked `:aria-label`. Relying solely on `title` is insufficient for accessibility, as screen readers may not read it consistently.
**Action:** When adding new icon-only buttons, always include an explicit `aria-label` attribute matching the intended action. Do not rely solely on `title`.
