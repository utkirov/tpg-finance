## 2024-05-15 - ARIA Labels for Icon-Only Buttons
**Learning:** Icon-only buttons using Phosphor icons (`<Icon ... />`) lacked explicit ARIA labels. Even if they have `:title` attributes for visual tooltips, screen readers might not reliably announce the action, leading to poor accessibility.
**Action:** Always ensure that icon-only buttons include an explicitly defined `:aria-label` alongside the `:title` attribute (e.g., `<button :title="t('Action')" :aria-label="t('Action')">`). This is a critical pattern for all actionable UI elements containing only icons.
