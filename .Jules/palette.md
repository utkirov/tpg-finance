## 2024-10-24 - Require ARIA labels for Icon-Only Buttons
**Learning:** Icon-only buttons relying solely on the `:title` attribute are insufficient for accessibility. Screen readers do not consistently announce the `title` attribute, leaving interactive elements like remove (`x` or `trash` icons) or add (`+`) buttons inaccessible to visually impaired users.
**Action:** Always include an explicit `:aria-label` (or `aria-label`) attribute on icon-only buttons to ensure they are properly announced. The value of `aria-label` can usually match the `title` provided for sighted users.
