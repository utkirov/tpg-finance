## 2024-05-18 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Relying solely on `title` attributes for tooltips on icon-only buttons (`class="icon-btn"`, `class="x"`) leaves them inaccessible to screen readers. ARIA labels are required.
**Action:** Always include an `:aria-label` attribute on icon-only buttons, mirroring the localized tooltip text used in `:title` (e.g., `:title="t('Убрать')" :aria-label="t('Убрать')"`).
