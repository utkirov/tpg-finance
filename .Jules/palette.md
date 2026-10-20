## 2024-05-18 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Found a pattern across the application where icon-only buttons using `class="x"` (delete/remove actions) and `class="icon-btn"` were missing `aria-label`s, which is critical for screen reader accessibility, even though they had `title` attributes.
**Action:** Always ensure that any button without visible text content has an explicit `aria-label` attribute (often mirroring the `title` text for localized tooltips).
