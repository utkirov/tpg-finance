## 2026-10-26 - Icon-only buttons accessibility
**Learning:** Icon-only buttons often rely on 'title' for tooltips but lack explicit 'aria-label', which hides their purpose from screen readers. In Vue components with i18n, reusing the translated tooltip as the ARIA label maintains consistency and improves accessibility.
**Action:** Always add :aria-label matching the :title attribute on icon-only buttons.
