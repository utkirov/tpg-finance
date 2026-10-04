## 2026-10-04 - Adding ARIA labels to icon-only buttons
**Learning:** In this Nuxt 3 application, icon-only buttons (like delete, remove, or add actions) frequently lack explicit `aria-label` attributes. Often, they use a `title` attribute populated by the `t()` localization function.
**Action:** When working on accessibility enhancements, always check if buttons with classes like `x` or `icon-btn` have corresponding `aria-label` attributes. Apply the same localization function `t()` used for the `title` to the `aria-label` to ensure comprehensive accessibility support.
