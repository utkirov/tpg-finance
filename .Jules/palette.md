## 2024-10-09 - Accessible Icon-Only Buttons
**Learning:** Relying solely on the `title` attribute for icon-only buttons (like `class="x"` and `class="icon-btn"`) is insufficient for screen readers and breaks accessibility standards. The tooltip helps sighted users, but assistive technologies require an explicit `aria-label` to announce the action appropriately.
**Action:** Always include an explicit `:aria-label` attribute on icon-only buttons in addition to `:title` (or regular `title`/`aria-label`) to ensure full accessibility support.
