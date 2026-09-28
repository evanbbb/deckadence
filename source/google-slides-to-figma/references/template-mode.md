# Template mode: restyling slides into the team's Figma system

The goal is that a ported slide looks like it was designed in the file from the start: same text styles, colours, grid and layout vocabulary as the user's best example slides. It should not look like a screenshot of Google Slides.

## 1. Study the file (read-only)

In one `use_figma` call:
- list pages (`figma.root.children` → id, name);
- local text styles (`getLocalTextStylesAsync`: name, font, size, line height) and paint styles (`getLocalPaintStylesAsync`: name, colour);
- variables if any.

Then for each example page the user pointed to (one `use_figma` call per page, in parallel):
- list the top-level frames with name, x, y, size and background (fill or fill style);
- for each frame, list its children: name, type, position and size, text style name, first ~60 characters of text, and fill type (IMAGE/VIDEO/SOLID).

Screenshot each example page (`get_screenshot` with a large `maxDimension`) and a few typical frames up close. Output is capped around 20 kB per call, so keep the per-child summary short.

## 2. Write down the system

From the examples, note:
- **Slide size and grid:** usually 1920×1080, frames spaced on a regular grid (e.g. every 2070 px across, 1480 px down).
- **Page structure:** e.g. first row = black title slide + agenda; then **one row per section**, starting with a section-header slide (often a grey or coloured background); content slides follow in order; the last slide is a closer ("Cheers", "Thank you").
- **Recurring elements:** small running label top-left (course name), heading position, body column, outlined media box.
- **Layout vocabulary**, with coordinates. For example:
  - *big statement*: heading (H2) + large body, left, ~1040 wide
  - *text left / media right*: H3 heading + body in a 584-wide column at x=60; outlined box 668,60 → 1192×960 holding images
  - *wide*: H3 heading across the top, outlined box 60,280 → 1800×740 for diagrams and grids
  - *statement slide*: grey background, one centred H2 sentence
  - *two columns*: two headings at x=60 and x=972, images below
- **Colour roles:** background per slide type, body text, muted text (labels, captions), accent (highlighted words, used where the original deck had coloured emphasis).

Put this into the `CFG` object (see the top of `figma_helpers.js`): `textStyles` maps roles (h1, h2, h3, h5, b1, b2, bL, lab, code) to the file's style **names**. Look styles up by name at runtime; style IDs copied from another call can fail. Paint style names or hex go in `colors`, plus `label` and `grid`.

## 3. Plan each deck before building

Look at every slide render. For each slide pick: keep / skip (boilerplate, duplicates), its row (section), and a layout from the vocabulary. Rules of thumb:
- Title-only slides in the source become section headers (if they start a section) or grey statement slides (if they're a punchline mid-section).
- Heading + a few lines → *big statement*. Heading + text + one or two images → *text left / media right*. Many images → a clean grid inside the *wide* box using `imgFit` (keep each image's aspect ratio; don't reproduce messy collages).
- Diagrams made of shapes and arrows in the source → rebuild as editable Figma shapes (frames, text, `arrow()`), in the template's colours. Red crosses or highlights become the accent colour unless the user wants the originals.
- Coloured words in the source → `accent` ranges on the text.
- Links → real hyperlinks (unwrap Google redirect links: take the `q=` parameter).
- A section-less run of slides can go in its own row with a sensible name taken from the slide titles; mention it in the report.

## 4. Build

- Write helpers + CFG + 1–2 rows of slides per `use_figma` script, under ~45k characters, so a failure is cheap to retry.
- After each batch, return `{created, imgs}` and keep all the `imgs` pairs for the upload step.
- Headings that wrap onto two lines push body text down: place body text relative to the heading's height (`h.y + h.height + 40`), as the helpers do, rather than at a fixed y.
- Screenshot the page after building and again after fixes. Look for clipped text, overlaps, text running off the slide, and stretched images.
