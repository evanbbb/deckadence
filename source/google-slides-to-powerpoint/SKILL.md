---
name: google-slides-to-powerpoint
description: Rebuild Google Slides as editable PowerPoint (.pptx) files, preserve the source design, ask about unresolved conversion choices, and compare PowerPoint renders with the source. Use for Google Slides links or browser decks requested as PowerPoint; not for Figma sources or creating a new deck design.
---

# Google Slides → PowerPoint

Convert the user's existing deck faithfully. Preserve its words, slide order, dimensions, colours, fonts, line breaks, images, crops and stacking. Do not add a cover, badge, theme, new layout or rewritten copy. Google's PPTX download is not the fidelity check. Build a direct PPTX from the editor extraction and check it in the user's PowerPoint environment.

Works with Codex, Claude Code and other coding assistants on macOS. Mac scripts use `osascript -l JavaScript` and built-in tools; no npm, Python or Keynote is needed. Ask through the assistant's question tool, or in plain text and wait. Skip questions already answered. Explain choices in plain words and keep the user informed.

## Set up and ask

Read [references/setup.md](references/setup.md) for browser access and native PowerPoint rendering, then [references/fidelity.md](references/fidelity.md) for the build/check commands and artwork approval process.

Ask one short round before dependent work:

1. Which deck or decks, and which slides? Preserve editor order unless the user requests another order. Confirm any exclusions; do not infer that a Q&A or housekeeping slide is disposable.
2. Where should each `.pptx` and its working files go? Suggest a local Documents folder for approval. Choose a new filename if it exists; never overwrite a user's output without permission.
3. Preserve the source's actual page size. Read page properties from a supported Google Slides API/browser UI, or run `scripts/read_source_size_inpage.js` and poll `window.__SOURCE_SIZE`. Its Google PPTX export is used only for page properties; none of that export's object layout is reused. Carry `result` into extraction options as `sourceSize`. If the actual size cannot be read, explain that and ask for it; do not invent a standard PowerPoint width. Ask about resizing only if the user requests it.
4. Suggest a small varied pilot after seeing the deck (about 5–10 slides, or all if shorter). Show the slide list and get agreement before converting it, then get approval before running the rest.
5. Where will the result be checked: PowerPoint on this Mac, Windows, or a connected PowerPoint session? If none is available, explain that a draft can be built but rendering cannot yet be verified.

After reading the source, ask only the choices it actually presents. Show the source font families, styles and missing faces; keep them when already instructed. For every missing or unresolved family/style, ask whether to install the original, retain its name with the match explicitly unverified, or use a specifically chosen substitute. Wait for that answer before applying the choice. A request to keep the design does not answer a missing-font question. Never install, substitute or synthesize a weight by assumption. Confirm media behavior when videos or GIFs occur. The supported video policy retains the source poster and a clickable link; embedding a playable video needs another implementation and testing, so ask whether that is required. Never add a play badge. GIF playback needs a slideshow test, not a still PNG.

Speaker notes, links inside Google text, animations and transitions are not implemented by this reader/builder. Identify any present, explain the limitation, and ask whether to proceed with those differences or implement a supported alternative. Charts, tables or artwork that cannot be represented faithfully follow the editable-attempt and approval process in fidelity.md; do not quietly rasterize them.

## Extract and convert

`S` below means this skill's `scripts` directory. Open the signed-in Google Slides **editor** (`/presentation/d/<id>/edit`), using the user's preferred browser tools. Set `window.__EXTRACT_OPTS={slides:[1,4,7],download:false,renders:true,refWidth:1920,exactPaths:true,sourceSize:window.__SOURCE_SIZE.result}` for the agreed pilot, then run the entire `scripts/extract_deck_inpage.js` in that tab. Poll `window.__EXTRACT.status`, `done/total` and `error`. When finished, save the ZIP via `window.__EXTRACT_ZIP_DATAURL()` or download it with `window.__EXTRACT_ZIP()`. For large files, retrieve `window.__EXTRACT.files` and `window.__EXTRACT_GET(i)` individually. Decode returned data URLs rather than writing their text as the file.

Convert with:

```sh
osascript -l JavaScript "$S/slides_to_spec.js" <extract.zip-or-folder> <work> --target powerpoint
```

Add `--videos source-poster-link` only after that treatment is agreed; `--skip 3,17-19` only for requested exclusions. The extract normalizes the width to 1920 while recording the actual aspect ratio. An older extract without dimensions needs its aspect confirmed against the source and recorded in the working manifest before use. Do not accept the legacy 1080-height fallback as evidence of source size.

Read `artwork_needing_rebuild`, `missing_images`, all warnings and the font inventory. Source paint servers, filters, blend modes and transformed geometry are flagged for editable reconstruction/check. Store replacements in `<work>/rebuilds.json` under the returned artwork ID; retain any associated foreground text in those replacements. Inspect `conversion.missing_slides` and `source_errors` for extraction losses; those block a non-draft build. Read the remaining warnings, inspect `ref/sNN.png`, and check the spec's text against the original. Compare SVG references with the editor before relying on them: Google can export different line wraps. If the user chooses the editor appearance, obtain slide-only browser screenshots at least 1920 pixels wide by enlarging the browser viewport or using supported screenshot scaling. Wait for fonts and media, exclude editor chrome and selection overlays, verify dimensions, and point each spec `ref` at that corresponding screenshot. Record reference provenance and the user's choice. Never enlarge a small screenshot to claim more detail. Extraction warnings, missing images, approximated shapes and incomplete text are unresolved differences, not permission to omit content. Fix the reader or working spec and re-check affected slides. Text boxes may have importer slack; inspect the resulting bounds and wrapping in PowerPoint before accepting it.

## Build, inspect and finish

Use the shared [fidelity workflow](references/fidelity.md): build a new `.pptx`, inspect structural validation, export the same file in native PowerPoint, compare every slide at 1920 pixels across (or a user-requested higher resolution), then visually inspect each side-by-side. Resolve differences in the working spec, rebuild under a new filename and export again. Do not treat Keynote or another renderer as PowerPoint evidence.

Show the pilot deck and comparisons before the full conversion. A failed artwork reconstruction can be attempted again when the user asks; flatten only after a failed visual attempt and that user's approval for the named element. The approval applies to the named artwork, not the slide's text.

Report the local output link, converted slides, requested omissions, approved font changes and flattened elements, remaining differences, and exactly which PowerPoint version/platform was checked. If native checks are missing, label the result **draft — PowerPoint rendering unverified**. Never call a structurally valid file tried and tested. Offer to remove this job's working files after delivery; do not upload to unrelated services or close the user's other documents.
