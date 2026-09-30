## 2024-03-24 - Icon-only Buttons Need Explicit ARIA Labels
**Learning:** Icon-only buttons (like those with `class="icon-btn"` or `class="x"`) often rely solely on `title` attributes for tooltips, which aren't robustly announced by all screen readers.
**Action:** Always add an explicit `aria-label` (matching the title/intent) to any button that doesn't have text content inside it. Additionally, for toggle buttons, add `aria-expanded` attributes.
