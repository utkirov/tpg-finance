## 2024-05-24 - ARIA Labels on Icon Buttons
**Learning:** Icon-only buttons (like `class="x"` and `class="icon-btn"`) frequently lacked `aria-label`s, only providing `title`. This is an accessibility issue because screen readers rely on explicit aria-labels for proper identification.
**Action:** Add `:aria-label="t('Label')"` consistently to all instances of icon-only buttons to ensure they are accessible.
