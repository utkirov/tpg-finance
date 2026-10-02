## 2024-05-18 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Icon-only buttons often rely purely on titles and lack aria-labels, negatively impacting accessibility for screen reader users in this application. Common patterns seen are `<button class="x">` and `<button class="icon-btn">` with just an `<Icon>` element inside.
**Action:** When adding or fixing icon-only buttons (`class="x"`, `class="icon-btn"`, etc.), ensure to include explicit `aria-label` attribute (e.g. `:aria-label="t('Описание')"`). Using translation string preserves the app-wide i18n support.
