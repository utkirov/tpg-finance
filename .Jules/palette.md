## 2024-10-09 - Added aria-labels to icon-only buttons
**Learning:** Icon-only buttons used for close/remove actions (such as `class="x"` and `class="icon-btn"`) throughout the app were relying entirely on the `title` attribute. While this provides a tooltip on hover, providing an explicit `aria-label` is a more robust way to ensure screen reader users have a properly described control.
**Action:** When adding new icon-only buttons with tooltips (`title`), always bind a matching `aria-label` to ensure full accessibility support.
