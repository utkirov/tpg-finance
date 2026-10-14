## 2024-10-14 - Accessible Icon-Only Buttons
**Learning:** Found an app-wide pattern where icon-only buttons (like `class="x"` and `class="icon-btn"`) relied solely on the `title` attribute for tooltips, lacking `aria-label`s for proper accessible names. While `title` gives a mouse hover tooltip, `aria-label` is required for screen readers.
**Action:** Always add explicit `aria-label` attributes to icon-only buttons, even when a `title` attribute is present.
