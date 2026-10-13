## 2026-10-13 - Adding ARIA labels to Icon Buttons
**Learning:** This application heavily relies on icon-only buttons using Phosphor icons, often with the classes `icon-btn` or `x`. While they have `title` attributes, they lack explicit `aria-label`s.
**Action:** Applied `:aria-label` identical to the localized `:title` to improve accessibility for screen readers on all `icon-btn` and `x` buttons.
