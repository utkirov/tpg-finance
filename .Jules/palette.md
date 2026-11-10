## 2024-05-14 - Explicit ARIA Labels for Icon-Only Buttons
**Learning:** Icon-only buttons (like `class="x"` and `class="icon-btn"`) relying solely on `title` attributes for tooltips are insufficient for screen readers without explicit `aria-label` attributes.
**Action:** When creating or modifying icon-only buttons with `title` attributes, ensure `aria-label` is also explicitly set, preferably reusing the localized title string (e.g. `:title="t('Убрать')" :aria-label="t('Убрать')"`).
