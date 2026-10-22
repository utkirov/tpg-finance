## 2024-05-14 - Icon-only buttons lacking ARIA labels
**Learning:** Icon-only action buttons (like those with `class="icon-btn"` or `class="x"` for closing/removing items) in this app often have a visual tooltip via the `title` attribute, but are missing an explicit `aria-label`. This means screen readers miss the context for these actions.
**Action:** When adding or updating icon-only buttons, always explicitly copy the localized `title` text (e.g. `t('Убрать')`) into an `aria-label` attribute to ensure parity between visual and auditory accessibility.
