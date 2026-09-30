---
name: figma-to-powerpoint
description: Convert selected Figma Design frames into editable PowerPoint (.pptx), preserve the source artwork and text, ask about frame order and conversion choices, reconstruct complex artwork before seeking approval to flatten it, and check native PowerPoint renders. Use for Figma Design frames requested as PowerPoint; not for Google Slides sources or redesigning a deck.
---

# Figma → PowerPoint

Preserve the user's selected design word for word: source layout, colours, typography, frame backgrounds, shadows, images and stacking. Do not infer slide order, select frames by a presumed aspect ratio, restyle the deck, substitute fonts or replace a gradient with a plain colour. Text stays editable. Attempt complex artwork as editable elements first; a picture is a fallback after an unsuccessful visual check and per-element user approval.

Works in Codex, Claude Code and other coding assistants with a Figma connection on macOS. Mac-side scripts use only `osascript -l JavaScript` and built-in tools. No Keynote or third-party Figma export plugin is required. Ask with the assistant's question tool or in plain text and wait; reuse answers already given.

Read [references/setup.md](references/setup.md) to check Figma access and PowerPoint rendering. Read [references/fidelity.md](references/fidelity.md) before building or proposing an artwork fallback.

## Ask before dependent work

1. Which file, page and frames? Inspect metadata and show the candidates, including their dimensions. Let the user select; do not silently filter out non-widescreen frames. If the link is a Figma Slides file, clarify that source type and use its supported extraction/export route rather than pretending it is a Design frame.
2. What order? Show the frame names and IDs. Offer canvas order, name order or a supplied list, and confirm the actual sequence. Figma's node or canvas order is not automatically slide order.
3. Where should the `.pptx` and work folder go? Propose a local destination; use a new name if taken.
4. Preserve equal frame dimensions as the source aspect ratio automatically. Ask whether physical inches matter only when that preference is unknown. If the user says only the aspect ratio matters, use `--pixels-per-inch 96` as a unit conversion and state the resulting dimensions; do not keep asking them to choose a template size. If they need particular inches, use their confirmed width. Mixed dimensions require a choice: separate decks, or a confirmed common canvas and fit/crop/padding policy. Do not combine width and height maxima or distort frames silently. Normalize only a local working copy after agreement; retain untouched source data and corresponding references for checking.
5. Suggest 5–10 varied pilot frames (all if shorter), including a text-heavy frame, cropped image and any effects. Agree the list, then ask before the full deck.
6. Where can native PowerPoint rendering be tested? Follow setup.md; without it, build only a clearly labelled unverified draft.

After extraction, show the actual fonts and styles. Keep source names when authorized and explain missing local fonts versus fonts on the presentation machine. For every missing or unresolved family/style, ask whether to install the original, retain its name with the match explicitly unverified, or use a specifically chosen substitute. Wait for that answer before applying the choice. A request to keep the design does not answer a missing-font question. Never install, substitute or approximate a weight by assumption. Ask about any GIFs/videos and intended playback. Figma prototype links, comments, motion and video playback are not implemented by this converter; clarify whether those are needed and obtain agreement to any losses or implement them. Do not assume static output is acceptable merely because a frame can be exported.

## Read and preserve the source

Read your environment's Figma `figma-use` instructions before using `use_figma`. Run `scripts/read_figma_frames.js` read-only in that tool, prefixed by `const FRAME_IDS = ['1:3','1:49'];`. Use small batches in the confirmed order; split further if the tool truncates results. Save returned objects exactly to `<work>/frames-01.json`, `frames-02.json`, etc. Do not summarize away properties or text.

For each frame, use `download_assets` for a PNG reference at least 1920 pixels wide: `defaultFormat:"png", defaultScale:Math.max(1,1920/frameWidth)`. Save the frame `export` immediately to `<work>/ref/<id-with-colons-as-hyphens>.png`, and its `rawImages` to `<work>/images/`. URLs expire; download promptly. Raw images are matched by hash, not guessed from filenames. More than 20 images may require calls on smaller parent nodes. Reference quality must be recorded; upscaling a small PNG does not make it a high-resolution reference. If asset URLs repeatedly return HTTP 202 or empty files, verify the response instead of saving it as an image. A documented read-only `node.exportAsync({format:"PNG",constraint:{type:"SCALE",value:scale}})` followed by `figma.io.write(filename,bytes)` can return the PNG directly through `use_figma`. Follow the Figma API guidance and save the returned image bytes; large base64 text returns may be truncated. Use only the confirmed frame references or specifically approved fallback nodes, and retain their render bounds.

`S` below is this skill's `scripts` directory. Run:

```sh
osascript -l JavaScript "$S/figma_to_spec.js" <work> --target powerpoint --title "<confirmed title>"
```

Inspect `missing_images`, `artwork_needing_rebuild`, `native_artwork_to_check`, `missing_rasters`, `fonts`, `warnings` and `incomplete`. Preserve variable font axes in the spec. Check the builder's `unresolved_font_styles` and `unresolved_font_variations` as well: native run properties do not preserve axes such as optical size (`opsz`). Ask the same font-choice question for these unresolved axes and record the answer; retaining a family name does not establish an exact match. Missing assets and complex backgrounds remain unresolved; do not accept plain-colour substitutes or skip shadows. Linear gradients and simple shadows are native candidates that still need PowerPoint visual checks.

For unsupported effects, use the source properties to build editable candidates in `<work>/rebuilds.json`, keyed by node id, or `<frame-id>:background` for backgrounds. Values are arrays of neutral deck-spec elements in slide coordinates. Candidates can contain several shapes, paths, gradients, images and shadows; keep foreground text separate and word for word. See the [deck spec](scripts/powerpoint/deck-spec.md). Preserve original frame data for auditing. Re-run conversion after changing candidates.

## Check candidates and finish

Follow [fidelity.md](references/fidelity.md) to build, validate, render natively and compare every slide. For a reconstruction under review, `--draft` allows unresolved artwork to be inspected; clearly identify any omitted candidates in the draft. Fix affected frames and repeat native exports after each changed build.

If an editable artwork attempt fails, show the comparison, name the node and remaining error, explain exactly what would lose editability, and ask: another editable attempt, approve that artwork as a picture, or stop with the difference unresolved. Allow additional attempts whenever requested. Pass `--approved-rasters` only for the named approvals after failures. Use the isolated background procedure in fidelity.md; never flatten the foreground text with its background or crop a full slide for a background replacement.

Present the pilot and ask before processing the remaining agreed frames. Report the local `.pptx`, frame order, dimensions, chosen font changes, approved flattened artwork, remaining differences, and the PowerPoint version/platform used for checks. A missing native check means **draft — PowerPoint rendering unverified**. Only call the result tried and tested after native visual checks and required slideshow checks. Existing Figma nodes stay unchanged; only approved temporary export artwork may be created, then removed immediately. Never upload to unrelated services, overwrite outputs or close other user documents.
