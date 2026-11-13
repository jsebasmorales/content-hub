# DESIGN.md · Content Hub

Design system for the **Content Hub**, an internal dashboard for Holafly's Content team (Jira tickets, SLAs, objectives and a searchable map of product texts). It is built on **Volare, Holafly's design ecosystem**.

**How to read this file.** Every value tagged **[Volare]** comes from the official Volare documentation. Every value tagged **[Proposed]** is not defined in Volare and was added for this product; keep it, but do not treat it as official. Do not invent colors, sizes or tokens beyond what is written here. All interface copy is in **Spanish**.

> Source: the `DESIGN.md` document of the Stitch project "Content Hub Dashboard Redesign". The short YAML export of the same system is kept as [DESIGN.stitch-corto.md](DESIGN.stitch-corto.md).

---

## 1. Visual theme and atmosphere

A calm, bright and light workspace. Clean neutral surfaces, generous whitespace, and one confident brand color (Holafly Magenta) used sparingly for actions and emphasis. The product should feel friendly and functional, not corporate-heavy: Volare asks for light, fresh typography and restraint with gradients. Data is the hero: large, legible numbers; simple charts; clear status.

Keywords: airy, friendly, precise, uncluttered, trustworthy.
Density: medium. This is a daily-use tool for 5–15 people on desktop; favor scanning speed over decoration.

---

## 2. Color

### 2.1 Brand and primary [Volare]

- **Holafly Magenta**, `color.magenta.400`, **#E6485C** (R230 G72 B92). The main brand color. Reserved for important actions (buttons, tabs, selected states) and brand moments.
- **Holafly primary-button gradient**, `#E12B57` → `#C8094E` (`color.gradient.holafly-magenta` → `holafly-magenta-medium`). Volare uses this gradient on primary buttons instead of flat Magenta 400 to meet contrast.
- Magenta shades: 100 `#FFEEF0`, 200 `#FFA4B0`, 300 `#FF5A6F`, 400 `#E6485C`, 500 `#D22C49`, 600 `#951C39`.

### 2.2 Neutrals [Volare]

| Token       | Hex     | Typical use [Proposed mapping]      |
| ----------- | ------- | ----------------------------------- |
| neutral.100 | #FFFFFF | Card and panel surface              |
| neutral.200 | #F8F8FB | Page background, table stripe       |
| neutral.300 | #E4E6EA | Borders, dividers                   |
| neutral.400 | #CCD0D7 | Disabled borders, placeholder icons |
| neutral.500 | #56575A | Secondary text                      |
| neutral.600 | #292B2E | Primary text, dark surface          |

### 2.3 Secondary and supporting families [Volare]

| Family    | 100     | 200     | 300     | 400     | 500     | 600     |
| --------- | ------- | ------- | ------- | ------- | ------- | ------- |
| Blue      | #EBF3FF | #BDD7FF | #62A0FF | #327DF0 | #2065CE | #002968 |
| Baby blue | #F8FDFF | #EDF9FE | #DCF4FF | #BFEBFF | #90C6DE | #176C93 |
| Green     | #EDFFF4 | #C5FFDB | #74FAA7 | #48EC86 | #32A45E | #206B43 |
| Mint      | #ECFCF4 | #C4F8D9 | #85F4BF | #36B37E | #156F49 | #0B4D31 |
| Amber     | #FFF8EC | #FFEAC0 | #FFCE6A | #F8BA3D | #C17B18 | #835617 |
| Yellow    | #FFFDF6 | #FFFCEE | #FFF7D1 | #FFF0AB | #E5D795 | #B58741 |
| Orange    | #FFFAF7 | #FDF3EE | #FFE3D3 | #FFCCB0 | #E5B59A | #B28870 |
| Red       | #FFEFEC | #FFCDC1 | #FF876D | #EA5230 | #C83D1E | #841C05 |
| Purple    | #FFEEFE | #E2BEE0 | #BD78B8 | #643560 | #4D2B49 | #3C263A |

Volare's secondary palette (yellow, purple, orange, baby blue) is for emphasis in backgrounds, illustration and banners, usually paired with gradients and the primary color.

### 2.4 Gradients [Volare]

Use gradients only to highlight one relevant element; never as general backgrounds.
`blossom #FFEEF0`, `blossom-medium #FEE5E9`, `sunrise-blue #EDF9FE`, `sunrise-blue-medium #BFEBFF`, `sunbeam #FFF2C9`, `sunbeam-medium #FFF6E6`, `silver #EDF4F8`, `silver-medium #B2BBCD`, `skeleton #FFFAFA`, `skeleton-medium #EEEEEE` (loading placeholders), `platinum #EDF9FE`.

### 2.5 Effects [Volare]

`effect.100` = `#292B2E` at 12 % opacity. `effect.200` = `#292B2E` at 20 % opacity. Used for shadows and overlays.

### 2.6 Semantic roles [Proposed, built only from Volare tokens]

| Role                                 | Light theme                            | Dark theme      |
| ------------------------------------ | -------------------------------------- | --------------- |
| Page background                      | #F8F8FB                                | #1E1F22         |
| Surface (cards, panels)              | #FFFFFF                                | #292B2E         |
| Raised surface (dropdowns, tooltips) | #FFFFFF + shadow                       | #34363A         |
| Border                               | #E4E6EA                                | #3A3C40         |
| Text primary                         | #292B2E                                | #F8F8FB         |
| Text secondary                       | #56575A                                | #CCD0D7         |
| Primary action                       | gradient #E12B57 → #C8094E, white text | same            |
| Brand accent, selected state         | #E6485C                                | #FF5A6F         |
| Link and small colored text          | #D22C49                                | #FF5A6F         |
| Focus ring (2 px, 2 px offset)       | #2065CE                                | #62A0FF         |
| Overlay / scrim                      | #292B2E at 40 %                        | #000000 at 60 % |

**Status colors** (always paired with an icon and text, never color alone):

| Status  | Text    | Background | Accent / icon |
| ------- | ------- | ---------- | ------------- |
| Success | #206B43 | #EDFFF4    | #32A45E       |
| Warning | #835617 | #FFF8EC    | #C17B18       |
| Error   | #841C05 | #FFEFEC    | #C83D1E       |
| Info    | #002968 | #EBF3FF    | #2065CE       |
| Neutral | #56575A | #F8F8FB    | #CCD0D7       |

Warning: Holafly Magenta (#E6485C) and Red 400 (#EA5230) are close in hue. Errors must always carry an icon plus text, and the magenta action color must never be the only signal of a problem.

### 2.7 Contrast notes (approximate, computed on white unless stated)

- Magenta 400 #E6485C with white text: about 3.9:1. Fails for small text; use only for large text, graphics, borders and selected indicators.
- `#E12B57` with white: about 4.5:1. `#C8094E` with white: about 5.8:1. This is why primary buttons use the gradient.
- Magenta 500 #D22C49 on white: about 5:1. Use it for links and small colored text.
- Neutral 500 #56575A on white: about 7:1. Neutral 600 #292B2E on white: above 14:1.
- Volare targets: small text 4.5:1, large text (18 pt regular / 14 pt bold) and graphics 3:1.

---

## 3. Typography

- **Corporate font [Volare]:** Modern Era. A tall x-height, low-contrast, friendly typeface. Use Light (300) and Regular (400) whenever possible to keep the brand's lightness.
- **Secondary font [Volare]:** **Mulish**, to be used when Modern Era is not available and when working online. Volare says it should not be used in official marketing materials.
- **For this product [Proposed]:** use **Mulish** (internal online tool), self-hosted as a variable font with a Latin subset. If a Modern Era license is provided later, swap the `--font-sans` token only.
- Weights [Proposed extension]: 300 for large numbers, 400 for text. Use 600 only for table headers, tags and small captions where legibility needs it. Avoid 700+.

Type scale [Proposed]:

| Role                   | Size / line height | Weight | Notes                           |
| ---------------------- | ------------------ | ------ | ------------------------------- |
| KPI number (hero)      | 56 / 64 px         | 300    | Tabular figures, tight tracking |
| KPI number (secondary) | 40 / 48 px         | 300    |                                 |
| Page title (h1)        | 32 / 40 px         | 400    |                                 |
| Section title (h2)     | 24 / 32 px         | 400    |                                 |
| Card title (h3)        | 20 / 28 px         | 400    |                                 |
| Body                   | 16 / 24 px         | 400    |                                 |
| Small, table cell      | 14 / 20 px         | 400    |                                 |
| Label, table header    | 12 / 16 px         | 600    | Sentence case, no all-caps      |
| Caption, tag           | 12 / 16 px         | 600    |                                 |

Rules: numbers use tabular figures; no all-caps; line length of paragraphs up to 70 characters; truncation with an ellipsis plus a tooltip for long ticket titles.

---

## 4. Spacing, radius, elevation

**Spacing scale [Volare], px:** none 0, xs 4, s 8, m 12, l 16, xl 20, 2xl 24, 3xl 32, 4xl 40, 5xl 48, 6xl 64, 7xl 80.
**Radius scale [Volare], px:** none 0, xs 4, s 8, m 12, l 16, xl 20, 2xl 24, 3xl 32, full 2000 (pill).

Assignments [Proposed]:

- Cards and panels: radius `l` (16), padding `2xl` (24).
- Buttons, inputs, selects: radius `m` (12).
- Dropdown panels and suggestion panel: radius `l` (16).
- Tooltips: radius `s` (8).
- Status chips and tags: `full` (pill).
- Gap between cards: `l` (16). Page padding: `3xl` (32). Section gap: `4xl` (40).

**Elevation [Proposed].** Cards sit flat with a 1 px border (#E4E6EA) and no shadow. Floating layers only: dropdowns, tooltips, the suggestion panel and toasts use `0 8px 24px effect.100`; modals use `0 16px 40px effect.200`.

---

## 5. Iconography

Volare icon font `@holafly/volare-icon-font`, classes `volare-icon-<group>-<name>`, size controlled by `font-size`. Icons inherit the text color. Default size 20 px (16 px inside chips and tables). Open points: the full icon list, and whether a lighter SVG subset should replace the font for performance. Until confirmed, design with a simple outlined icon style, 1.5 px stroke, rounded caps.

**`compare` (the Comparar switch).** The Hub's own icon, in `src/presentation/icons.ts`, on the same 24 px grid and 1.5 px stroke as the others: two small circles (bottom left, top right) joined by two right-angled lines whose arrowheads point in opposite directions, read as "this period set against another". It is used once, at 20 px, in front of the word "Comparar" in the filter header, and it is the only icon drawn in `--compare` (the previous-year purple, section 14.2) instead of the text color: it announces the color that will mark the previous year. When the Volare package or its SVG subset arrives (open point 6 of section 13), the equivalent comparison glyph replaces it with no change to the places that use it.

---

## 6. Layout

- **App shell:** fixed left navigation (248 px) + top bar (64 px) + scrollable content. Content max width 1200 px, centered, 12-column grid, 24 px gutters.
- **Breakpoints [Proposed]:** 1440 px desktop (primary), 1024 px tablet (navigation collapses to icons, 72 px), 768 px narrow (navigation becomes an overlay).
- **Left navigation:** brand mark at the top; sections grouped under small headings ("Resumen", "Content Ecosystem", "Trabajo", "Objetivos", "Referencia", "Administración"). Selected item: Magenta 100 `#FFEEF0` background, Magenta 500 text, 3 px Magenta 400 bar on the left. Sections the user cannot access **do not appear at all**: no lock icons, no disabled items, no hints.
- **Top bar:** page title, "Datos al <hora>" last-sync text, button **"Resincronizar con Jira"** (secondary style, with a spinner while running), user menu with name and role.
- **Page structure:** title and one-line purpose, a filter bar if the page has filters, a KPI row, then charts and tables in a card grid.

---

## 7. Components

### 7.1 Buttons

| Type                   | Style                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary                | Gradient #E12B57 → #C8094E, white text, 12 px radius, height 44 (default) / 36 (compact). Hover: gradient darkens slightly. Pressed: 2 % darker. Focus: 2 px #2065CE ring with offset. Disabled: neutral.300 background, neutral.400 text. Loading: spinner replaces the label, width preserved. |
| Secondary              | White surface, 1 px #CCD0D7 border, #292B2E text. Hover: #F8F8FB background.                                                                                                                                                                                                                     |
| Tertiary / text        | No border, Magenta 500 text, underline on hover.                                                                                                                                                                                                                                                 |
| Destructive [Proposed] | Red 500 #C83D1E background, white text, always with a confirmation step.                                                                                                                                                                                                                         |

One primary button per view region. Labels in Spanish, sentence case, verb first ("Resincronizar con Jira", "Aplicar filtros").

### 7.2 Inputs, selects and filters

Height 44, 12 px radius, 1 px #CCD0D7 border, white background, 16 px text. Hover: border #56575A. Focus: 2 px #2065CE ring. Error: border #C83D1E plus an error icon and message below in #841C05. Placeholder: neutral.500. Labels above the field, 12 px / 600.
List filters (a table's own selects, such as the tasks list): chips and compact selects in a single row, with a "Limpiar" text button that resets only that list. The period, request type and comparison filter of the four report pages is a different component: see §14.

### 7.3 Content Ecosystem search (custom to this product)

One horizontal bar, 56 px high, 16 px radius, white, 1 px #CCD0D7 border, soft shadow on focus. From left to right:

1. **Category dropdown**: a button showing the selected category or "Todas las categorías" (no leading icon), a chevron, a 1 px vertical divider on its right. Optional; not required to search. The panel opens below with a check mark on the selected item and a count tag on each row.
2. **Text input**: placeholder "Busca una frase, una llave de traducción o una ubicación".
3. **Clear button** (× appears when there is text).
4. **Search button**: a 44 px square (or pill) action button with a magnifier icon, in the primary gradient.

The bar behaves like a combobox with keyboard support (arrows, Enter, Esc).

**Suggestion panel** (opens under the bar like a search engine): white, 16 px radius, floating shadow, grouped rows by type with a small left icon and a type label on the right: _Frase_, _Campo_, _Llave_, _Ubicación_, _¿Quisiste decir…?_. Matched text is bolded; the active row has a Magenta 100 background. Maximum 8 rows. A footer row shows the keyboard hint.

Categories (14): Home, PDP, App, Emails, Landing Page, Markdown Page, Blog, WhatsApp, B2B, Short FAQ Section, Product Feature, Push notifications, Checkout, Holafly Hub.

### 7.4 Result list and detail panel (Content Ecosystem)

Two-column layout: results list on the left (≈ 40 %), detail panel on the right (≈ 60 %).

- Each result row: field label (14 / 600), the current text in two lines max with highlighted matches, then a metadata line with category, page, section and a platform tag. Selected row: Magenta 100 background and a left bar.
- Detail panel sections, in order: **Captura** (one screenshot per section with a red box on the selected field; clicking another field moves the box), **Texto actual**, **Dónde editarlo** (platform tag, collection or project, a link button "Abrir en Strapi" or "Abrir en Crowdin"), **Llave de traducción** (monospace chip with copy button), **Dependencias**, **Checklist de impacto** (checkboxes with a short note), **Propietario y verificación** (owner, last verified date, status chip).
- **Red box:** 3 px outline in Magenta 400 `#E6485C` with a 12 % Magenta fill and a 4 px radius, drawn over the screenshot; the rest of the image stays at full brightness. A small label "Campo seleccionado" may sit at its top left.

### 7.5 Cards

- **KPI card:** surface, 16 px radius, 24 px padding. Content: small label with an ⓘ icon (tooltip explains how the number is calculated), the number (56 / 64, weight 300), a unit or "de N", a delta line with an arrow icon and the comparison period, and an optional mini sparkline. Status shown with a chip, never with color alone. Hero KPIs in the executive summary use the largest size; secondary KPIs use 40 / 48.
- **Chart card:** title (h3), one-line subtitle, chart, legend (direct labels preferred), and a footer with the data cut-off time.
- **Insight card (executive summary):** left accent bar in Magenta 400, short headline, one sentence, optional link.

### 7.6 Tables

Sticky header on neutral.200, 12 / 600 headers, 14 px cells, 48 px rows, 1 px #E4E6EA row dividers, hover row #F8F8FB. Numeric columns right-aligned with tabular figures. Sortable columns show a small arrow. First column is the ticket key as a text link in Magenta 500. Pagination or "Mostrar más" at the bottom. Empty table: see 7.9.

### 7.7 Chips and status

Pill, 24 px high, 12 / 600 text, icon at 16 px. Ticket status chips: _Por hacer_ (neutral), _En progreso_ (info), _En revisión_ (warning), _Hecho_ (success), _SLA incumplido_ (error). Translation status and verification chips: _Listo_ (success), _Revisar_ (warning), _Desactualizado_ (error).

### 7.8 Tabs, tooltips, toasts

- **Tabs:** text tabs with a 3 px Magenta 400 underline on the selected one; secondary text in neutral.500; 44 px high.
- **Tooltip:** neutral.600 background, white 12–14 px text, 8 px radius, max width 280 px, appears on hover and keyboard focus; used on every ⓘ to explain how a figure is computed.
- **Toast:** floating card at the bottom right with an icon, message and optional action; auto-closes after 6 s; errors stay until dismissed.

### 7.9 Empty, loading and error states

- **Empty:** a simple illustration or icon, one line of title, one line of help, and a single action. Example: "No hay tickets para este filtro" + "Limpiar filtros".
- **Loading:** skeleton blocks using `skeleton #FFFAFA` → `skeleton-medium #EEEEEE`, never a full-page spinner.
- **Stale data:** a banner in warning style: "No pudimos conectar con Jira. Mostrando datos de las 14:32."
- **Objectives tree empty:** "Aún no hay épicas de objetivo" with a short explanation.

### 7.10 Objectives tree

Indented tree: Company objective → Marketing objective → Team epic → tickets. Each node shows its name, a progress bar (neutral.300 track, Magenta 400 fill), the percentage of effort, and a chevron to expand. Keep indentation to 24 px per level and use thin connector lines (#E4E6EA).

---

## 8. Data visualization [Proposed, from Volare colors]

- Series order: Magenta 400 `#E6485C`, Blue 400 `#327DF0`, Amber 400 `#F8BA3D`, Green 500 `#32A45E`, Baby blue 500 `#90C6DE`. Use no more than five series; group the rest as "Otros" in neutral.400. **Purple is not a series color**: it is reserved for the previous year (§14), so a chart never uses it for something else.
- Never encode meaning with color alone: add direct labels, markers, or patterns. The 90 % SLA target is a dashed neutral.500 line with a label.
- Chart types allowed: horizontal and vertical bars, lines, simple area, donut for part-to-whole with up to five parts, and stacked bars. No 3D, no gradients inside charts.
- Gridlines: 1 px #E4E6EA, horizontal only. Axis text 12 px neutral.500. Tooltips follow the tooltip component.
- Charts must be drawable as plain SVG; no animation required beyond a 200 ms fade on load.

---

## 9. Page patterns

All pages share the shell (section 6). Content to preserve comes from the screenshot attached to each request.

| Page                  | Purpose                                                   | Layout                                                                                               |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resumen ejecutivo     | Period findings at a glance                               | 3–4 hero KPI cards with ⓘ tooltips, a traffic-light status, a leader's message card, 2 insight cards |
| Content Ecosystem     | Find any text and see what depends on it                  | Search bar (7.3), result list and detail panel (7.4)                                                 |
| Resumen               | Tickets created, completed and in progress                | Global filter (§14), KPI row, trend chart, table                                                     |
| Tareas                | % completed, tasks by type and by status, one filter      | Single filter bar, KPI row, two charts, table                                                        |
| SLAs                  | Time to response and Time to done against the 90 % target | One card per SLA with big percentage and target line, trend chart, table                             |
| SLAs incumplidos      | Breaches and reasons                                      | KPI row, ranked table with breach chips                                                              |
| Objetivos             | Link work to company goals                                | Objectives tree (7.10) beside an effort chart                                                        |
| Capacidad             | Demand (created per week) vs capacity (resolved per week) | Combined line/bar chart, two KPI cards, short explanation                                            |
| Trimestre a trimestre | Compare quarters                                          | Grouped bars, comparison table with delta chips                                                      |
| Lo aprendido          | Quarter conclusions and next focus                        | Editorial layout: headline, three conclusion cards, focus list                                       |
| Definiciones          | How every number is calculated                            | Two-column definition list with search, last cut-off date                                            |
| Permisos              | Who sees what (leaders only)                              | Role × section matrix with switches, invite-by-email form, preview panel                             |
| Estado                | Sync health (leaders only)                                | Status cards for Jira and Crowdin, failed events table                                               |

---

## 10. Interaction, motion and accessibility

- Motion: 150–200 ms ease-out for hover, dropdowns and tooltips; no decorative animation; respect `prefers-reduced-motion`.
- Progressive enhancement: nothing depends on JavaScript. The one script of the Hub (the global filter, section 14, at most 2 KB gzip) only adds comfort on top of a form that already works.
- Keyboard: every control reachable; visible focus ring; the search combobox supports arrows, Enter and Esc; dropdowns and trees follow standard ARIA patterns.
- Touch targets at least 44 × 44 px.
- Contrast per section 2.7; do not rely on color alone; provide text alternatives for charts (a data table toggle or a summary sentence).
- Language is Spanish; dates as "12 nov 2026" (the global filter writes them as dd/mm/aaaa, as in its approved design), numbers with a thousands separator, percentages with no decimals unless needed.

---

## 11. Do and don't

Do

- Use Holafly Magenta for the one main action and for selection.
- Keep surfaces white or #F8F8FB with thin borders.
- Show the cut-off time and a ⓘ explanation on every key figure.
- Hide what a user cannot access.

Don't

- Don't use flat #E6485C behind white small text.
- Don't use gradients as backgrounds for whole sections.
- Don't show lock icons or disabled sections for restricted areas.
- Don't mix more than six chart colors or use red and magenta to mean different things without an icon.
- Don't invent components outside section 7 without marking them [Proposed].

---

## 12. CSS tokens (reference for the Astro implementation)

```css
:root {
  /* Volare */
  --magenta-100: #ffeef0;
  --magenta-300: #ff5a6f;
  --magenta-400: #e6485c;
  --magenta-500: #d22c49;
  --magenta-600: #951c39;
  --neutral-100: #ffffff;
  --neutral-200: #f8f8fb;
  --neutral-300: #e4e6ea;
  --neutral-400: #ccd0d7;
  --neutral-500: #56575a;
  --neutral-600: #292b2e;
  --blue-300: #62a0ff;
  --blue-400: #327df0;
  --blue-500: #2065ce;
  --blue-600: #002968;
  --blue-100: #ebf3ff;
  --green-100: #edfff4;
  --green-500: #32a45e;
  --green-600: #206b43;
  --amber-100: #fff8ec;
  --amber-400: #f8ba3d;
  --amber-500: #c17b18;
  --amber-600: #835617;
  --red-100: #ffefec;
  --red-500: #c83d1e;
  --red-600: #841c05;
  --purple-100: #ffeefe;
  --purple-200: #e2bee0;
  --purple-300: #bd78b8;
  --purple-400: #643560;
  --purple-500: #4d2b49;
  --purple-600: #3c263a;
  --baby-blue-500: #90c6de;
  --gradient-primary: linear-gradient(135deg, #e12b57, #c8094e);
  --effect-100: rgb(41 43 46 / 12%);
  --effect-200: rgb(41 43 46 / 20%);
  --space-xs: 4px;
  --space-s: 8px;
  --space-m: 12px;
  --space-l: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;
  --space-3xl: 32px;
  --space-4xl: 40px;
  --space-5xl: 48px;
  --space-6xl: 64px;
  --space-7xl: 80px;
  --radius-s: 8px;
  --radius-m: 12px;
  --radius-l: 16px;
  --radius-xl: 20px;
  --radius-full: 2000px;
  /* Proposed semantic layer */
  --bg: var(--neutral-200);
  --surface: var(--neutral-100);
  --border: var(--neutral-300);
  --text: var(--neutral-600);
  --text-muted: var(--neutral-500);
  --accent: var(--magenta-400);
  --link: var(--magenta-500);
  --focus: var(--blue-500);
  --shadow-float: 0 8px 24px var(--effect-100);
  --shadow-modal: 0 16px 40px var(--effect-200);
  --font-sans: 'Mulish', system-ui, sans-serif;
}
[data-theme='dark'] {
  --bg: #1e1f22;
  --surface: #292b2e;
  --border: #3a3c40;
  --text: #f8f8fb;
  --text-muted: #ccd0d7;
  --accent: var(--magenta-300);
  --link: var(--magenta-300);
  --focus: var(--blue-300);
}
```

---

## 13. Open points to confirm with the design team

1. Volare's semantic (alias) color tokens, which its documentation mentions but were not provided.
2. The official type scale, line heights, and the real radius of buttons and inputs.
3. Official shadow/elevation tokens, grid and breakpoints.
4. Dark mode: not defined in Volare; all dark values here are proposed.
5. Modern Era license, or confirmation that Mulish is acceptable for an internal tool.
6. Access to the icon package, or an approved SVG subset.
7. Screenshots of real Volare components (button, input, table, chip, tabs, navigation) to align shapes and states.

---

## 14. Filtros globales y comparación

Applies to Resumen ejecutivo, Resumen, SLAs and SLAs incumplidos only. The reference images are `docs/designs/filtros-globales/`; where this text and the image differ, the image wins.

### 14.1 Filter card

White card, 1 px `--border`, radius 16, padding 20 / 24 (20 on the sides from 1280 px, to fit the row). Header: funnel icon in a 36 px `--magenta-100` box (radius 12), the title **Filtros** (20 px, weight 400) and, to its right, the tag **"N activos"** (24 px pill with a magenta dot; "1 activo" in the singular; hidden when N is 0). A 1 px divider follows. From **1280 px** of window the controls are **one row that never wraps**: the first control starts at the card's left padding (aligned with the icon and the title), and Restablecer and Aplicar are pushed to the right end. Below 1280 px the row wraps, everything left-aligned, with Restablecer and Aplicar at the end of the last row. Nothing in the row shrinks (a clipped label is worse than a wrapped row). Measured at 1440 px with the sidebar open (inner width 1088): chips 250, year 113, dates 313 (one 1 px `--border-strong` box, radius 12, height 44, around the icon, both dates and the duration), types 163, Restablecer 100, Aplicar 103, gaps 8: 8 px free. The fixed note under the controls (Bogotá time, 3-year limit) was removed: it lives in Definiciones ("Período por defecto") and in the notice of a rejected period; only "El período llega hasta hoy." remains, and only when it applies. **The Comparar switch (about 160 px) does not fit on that row** (it overflows by about 168 px at 1440): in phase 1.5b it goes in the header row, to the right of the title, not among the controls.

1. Period chips: **30 días**, **T1**, **T2**, **T3**, **T4** (selected: `--magenta-100` fill, `--magenta-400` border, `--magenta-500` text). They are radios with a visible label.
2. **Año** select, for the quarters: same trigger (caption "Año" over the year, chevron). Where the browser supports `appearance: base-select` (Chromium: Chrome and Edge 135+) its list is drawn like the types panel, with the active year ticked on the right; Firefox and Safari keep the native list, with the same trigger. No script is involved.
3. Date range field with a calendar icon, "dd/mm/aaaa – dd/mm/aaaa" and the duration ("92 d") on its right.
4. **Tipo de tarea**, multiple choice, drawn after the Volare multi-select: the trigger has a 12 px caption ("Tipo de tarea") over the value ("Todos seleccionados", "1 seleccionado", "N seleccionados"), a small chevron that points up while open, and a darker border when open. The panel is white, 1 px `--border`, radius 12, soft shadow, 4 px under the trigger, **340 px wide** (never wider than the window; below 1280 px it hangs from the card's left edge), 44 px rows with a thin divider, `--surface-sunken` (#F8F8FB) on hover, regular 14 px text, the count on the right in grey. Checkboxes are 20 px, radius 4, white with a neutral border; checked = `--green-500` with a white tick. At most 8 rows tall (about 362 px): the 7 types plus "Seleccionar todos" fit with no scroll bar; with more it scrolls under a 6 px rounded bar and a soft fade at the foot. A name never takes more than 2 lines (then an ellipsis). The names are shown **short**: the ending in parentheses is dropped (`typeDisplayLabel`: "Edit or Change Content (Characteristics, Content)" reads "Edit or Change Content"), and if two names would look alike both keep the full name. Only the display is short: the address, the cookie, the validation and the domain keep the full Jira name, which is also the row's `title` and the checkbox's `aria-label`.
5. **Comparar** switch (`role="switch"`), with the comparison icon in `--compare` (in the header row, see above).
6. **Restablecer** (tertiary, reset icon) and **Aplicar** (primary gradient). There is one reset and no "Limpiar".

With the comparison on, a **previous-year box** appears under the controls: "Año previo", its date range, "mismo número de días, N d" and "Este color marca los datos del año previo en todo el Hub". The "Aparece en…" note that sits above the card in the design is a canvas annotation, not part of the product. Mobile has no design: the controls wrap and nothing else is promised.

**"Seleccionar todos"** is the first row of the types panel, shown only with the script (without it the row is hidden and the list works as before). It is ticked when every type is chosen, shows a dash when only some are and is never empty. Clicking it when not all are chosen chooses them all; clicking it when all are chosen does nothing, because one type must always be left. It has no name, so it never travels with the form.

**Behavior with the script on** (without it, all of this still works from the plain form): the request-type dropdown closes with Esc (focus returns to its button), on a click outside and when focus leaves it, only one is open at a time, and the last type cannot be unchecked (a short notice in a `role="status"` region says why); its label ("Todos los tipos (5)", "2 de 5 tipos") updates as you choose. A click anywhere on the date field opens the browser calendar, and the dates can still be typed. When the year changes, the quarter chips of quarters that have not started are disabled. The date format follows the browser language and cannot be forced; Firefox keeps its own calendar icon beside the design's.

An active filter counts 1 each: a period other than the default, a type selection other than "todos", and the comparison on.

### 14.2 Comparison color

The previous year is always the same Volare purple tint, on every page. It is not the brand magenta, the second chart series blue or a status color.

| Token              | Light                | Dark [Proposed]      | Use                                        |
| ------------------ | -------------------- | -------------------- | ------------------------------------------ |
| `--compare`        | Purple 400 `#643560` | Purple 200 `#E2BEE0` | Text, icons, switch on, lines, bar outline |
| `--compare-fill`   | Purple 300 `#BD78B8` | Purple 300 `#BD78B8` | Fill of bars and markers                   |
| `--compare-bg`     | Purple 100 `#FFEEFE` | Purple 600 `#3C263A` | Background of the box and of chips         |
| `--compare-border` | Purple 200 `#E2BEE0` | Purple 500 `#4D2B49` | Border of the box                          |

Contrast, computed by `scripts/check-design.mjs`: `--compare` on white and on `--compare-bg` clears 4.5:1; `--compare-fill` on white clears 3:1. **The stripe (`--compare-fill` on `--compare-bg`) is 2.89:1 in the light theme**, under the 3:1 graphics threshold, so every previous-year bar also has a 1.5 px outline in `--compare`, which carries the shape.

Rules:

- The previous year never depends on color alone. Bars use a diagonal stripe (`--compare-fill` over `--compare-bg`) plus the outline; lines are dashed with a marker whose shape differs by metric; every chart has a legend with the words "Año previo"; tooltips and text alternatives include the previous values.
- With the comparison off, the box, the purple, the previous series and the "vs año previo" deltas disappear.
- With it on, the "vs año previo" delta **replaces** the "vs período anterior" one; the two are never shown together.
- A small previous sample is flagged, not hidden: below 30 cases the delta is absolute and the note reads "Pocos datos del año previo (n = X)".
- No previous data reads "Sin datos del año previo", never a zero. A zero denominator reads "—".

### 14.3 The comparison on Resumen ejecutivo and Resumen (phase 1.5b)

Built, but **not visible**: the Comparar switch appears on the four pages at once when phase 1.5c closes (`COMPARE_ENABLED`, D-0k). Approved with the prototype of 2026-11-13.

- **Switch.** In the header row of the filter card, at the far right, level with "Filtros" and "N activos": the `compare` icon (section 5) in `--compare`, the word "Comparar" (14 px, 600) and a 40 × 24 px switch (`role="switch"`, native checkbox, `name="comparar"`). Measured in the prototype: 148 × 24 px; the header stays 53 px high at 1440, 1280 and 1024 px, and the controls row is untouched. At 519 px or less the header wraps and the switch takes its own line, with the track at the right edge (the header grows from 53 to 89 px at 390 px). Without JavaScript it works like any field: it is sent with "Aplicar".
- **Previous-year box**, under the controls and inside the card, only with the switch on: `--compare-bg` fill, 1 px `--compare-border`, radius 12. Content, in this order: striped swatch and **Año previo**, the previous days ("15 oct 2025 – 13 nov 2025"), "mismo número de días, N d", the coverage note if there is one, and on the right (below 1280 px, on its own line) "Este color marca los datos del año previo en todo el Hub". **The dates come from `previousYearWindow`** (the same window the figures are computed from), never typed by hand. For the filter 15/10/2026 – 13/11/2026 it reads 15 oct 2025 – 13 nov 2025 (a test pins it). With no data at all the headline is "Sin datos suficientes del año previo".
- **Cards (`KpiCard`, `SlaCard`).** The delta reads "+83 vs año previo (15)": a percentage for counts, points for rates, days for times (D-0b), and a striped swatch marks its reference. `SlaCard` adds a line "Año previo: 76,9 % · 10 cumplidos de 13 medidos" with its delta in points, and a dashed purple mark on the bar at the previous rate. "Estado de hoy" cards (open now, in progress, not started) carry the note "Estado de hoy, no se compara.", and "Abiertos hoy" drops its own "Estado de hoy" line.
- **Volume chart.** Four bars per group: created, its previous-year twin, resolved, its twin. Previous bars are 24 px wide like the others, striped, with a 1.5 px `--compare` outline and their value in `--compare`; the group is 140 px wide (96 px without comparison) and the chart still scrolls sideways. With the comparison on no leading empty bar is dropped, so bar _n_ is always the same stretch of days in both years. The legend adds "Año previo". The text alternative lists the previous counts.
- **Horizontal bars (`BarList`).** A second thinner striped bar under each row and the words "· año previo N" next to the count; a type that had tickets a year ago and none now is listed with 0.
- **Type table (`SummaryTypeTable`).** Under Creados, Completados and % completado, a line in `--compare`: "Año previo: N". "Abiertos hoy" is not compared.
- **Notes (`CompareNote`).** One 12 px line with an info icon in `--compare`. A card only carries its own small sample ("Pocos datos del año previo (n = 15)", under 30 cases); whether the data reaches the previous side ("Datos del año previo desde el 8 abr 2025.", "Sin datos del año previo.") is said once per section, chart and table, and in the box. With no data the delta itself says "Sin datos del año previo", so the card adds nothing. The production history begins on 8 April 2025 and the previous year holds about a tenth of today's volume, so the small-sample note is on most cards: it is kept short on purpose and explained in Definiciones.

## Decisions taken in the repo on top of this file

These do not change the Stitch document; they record how the Hub applies it (see `docs/PLAN_DISENO.md` and `docs/DECISIONES.md`).

- Navigation breakpoints: icon-only rail (72 px) from 768 px to 1439 px; overlay panel below 768 px.
- Second chart series: Blue 400 `#327DF0` (§8).
