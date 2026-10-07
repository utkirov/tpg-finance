## 2024-05-24 - Missing ARIA Labels on Icon-Only Buttons
**Learning:** Found a recurring pattern in this app's components where icon-only buttons (`class="x"` and `class="icon-btn"`) use `title` attributes for tooltips but lack explicit `aria-label`s for screen reader accessibility.
**Action:** When adding or reviewing icon-only buttons in this codebase, ensure both `title` and `aria-label` are present for equivalent sighted and non-sighted accessibility.
