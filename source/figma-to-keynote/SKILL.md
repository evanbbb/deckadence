---
name: figma-to-keynote
description: Convert slide-sized frames in a Figma design file into a Keynote (.key) deck that looks like the design and stays editable — real text in the file's fonts and styles (italics, letter spacing and line height included), shapes, vector arrows and lines as editable Keynote shapes, images cropped and masked as in Figma, editable gradient backgrounds and shadows, with complex artwork rebuilt first and flattened only after a failed attempt and user approval — then check every slide against Figma's own render and fix what doesn't match. Uses the Figma MCP and Keynote on the user's Mac, with nothing to install. Use this whenever someone wants to turn Figma frames, a Figma page or a figma.com/design link into Keynote, a .key file or "a deck for Keynote". Not for Google Slides sources (use google-slides-to-keynote).
---

# Figma → Keynote

You are helping someone — often a designer — turn slide frames in Figma into a Keynote deck. They care that it looks like the design and stays editable. Explain things in plain words, keep them posted in short lines, and never make them do something technical you could do yourself.

These instructions work in any AI coding tool that can run shell commands on the user's Mac and use MCP servers (Claude Code, Codex and others). Where they say **ask the user**, use your tool's question feature if it has one; otherwise ask in plain text and wait for the answer.

The work has five stages: **set up → ask → read the frames → fonts → build and check**, then report. **Always pilot on a small, varied batch (5–10 frames) first, and ask before doing the rest.** Follow-up fixes are re-tested on the affected frames only.

How it works: `read_figma_frames.js` runs read-only inside Figma (through the Figma MCP's `use_figma` tool) and describes each frame: text with its styled segments, boxes, image fills with their crop, vector outlines (fill and stroke geometry, so arrowheads are exact), and which layers Keynote can't express. You save those results to disk, download Figma's picture of each frame and the original images, and `figma_to_spec.js` turns it all into a neutral `deck-spec.json`. The shared Keynote builder does the rest, exactly as for Google Slides: a hand-over PowerPoint file, Keynote saves a real `.key`, and every slide is compared with Figma's picture of it.

**Nothing to install.** Every script on the Mac runs with `osascript -l JavaScript` and tools that ship with macOS. No Python, no packages, no admin rights. Existing Figma nodes are never modified. An approved background fallback may create a temporary export rectangle using the frame’s fills; remove it immediately after downloading its render. Nothing is uploaded to unrelated services.

Bundled files (paths relative to this skill's folder):
- `scripts/read_figma_frames.js` — read-only frame reader for one `use_figma` call. Changes nothing in the file.
- `scripts/create_background_artwork.js` — isolated background export after a failed editable reconstruction and user approval; creates a temporary rectangle that must be removed.
- `scripts/figma_to_spec.js` — matches images by hash, works out crops and masks, cuts pictures out of the slide render, writes `deck-spec.json`, lists fonts.
- `scripts/keynote/` — the Keynote builder, shared with google-slides-to-keynote (`build_check.js` and the steps it runs, `list_fonts.js`, `deck-spec.md`, `keynote-gotchas.md`).
- `references/setup.md` — connecting Figma and letting the AI control Keynote, for non-technical users.
- `references/gotchas.md` and `scripts/keynote/keynote-gotchas.md` — hard-won lessons. Read both before stage 3.

Below, `S` means this skill's `scripts` folder, and every Mac-side `.js` script runs as `osascript -l JavaScript "$S/<script>" …`.

## 1. Set up (check silently, only ask when something is missing)

1. **Figma MCP.** Try the Figma `whoami` tool; if it's missing or fails, follow setup.md. If your tool offers Figma's own `figma-use` guide (a skill, or the MCP resource `skill://figma/figma-use/SKILL.md`), read it before the first `use_figma` call.
2. **Keynote Creator Studio.** Check `/Applications/Keynote Creator Studio.app` (bundle id `com.apple.Keynote`) and default to it. If only the older standalone Keynote is installed, or both are, ask the user which to use (`--app com.apple.iWork.Keynote` for the old one).
3. **Permission to control Keynote.** Warn the user before the first Keynote step: *"macOS will ask whether your terminal may control Keynote. Please click OK."* If your tool's sandbox blocks controlling other apps, see setup.md.

## 2. Ask (one short round, with sensible defaults)

Ask the user; put the recommended option first; skip anything they already told you.
1. *Which frames?* A figma.com/design link to a page or frames. List the page's top-level frames with `get_metadata` (on the page id, e.g. `0:1`) and keep the slide-sized ones (usually 1920 × 1080). Frames of other sizes: ask whether to include them.
2. *Slide order:* Figma has no slide order. Default: rows top to bottom, then left to right (by frame y, then x; frames within about half a frame's height count as one row). Show the first few as "1. <frame name or first heading> …" and ask: **This order** / **I'll tell you the order** / **Order by frame name**.
3. *Where should the Keynote file go?* Default `~/Documents/Keynote/<page or file name>.key`. Keep the work folder inside the user's home folder (Keynote is sandboxed).
4. *Pilot frames:* "I'll try 5–10 varied frames first and show you the result before doing the rest." Suggest a mix (title, text-heavy, images, diagram with arrows, anything with effects).

Mention without asking: Figma prototype links, comments and animations aren't copied; videos in Figma become their first frame. Fonts are asked about after reading the frames (stage 4).

## 3. Read the frames

For each batch of frames:
1. **Reader.** Run `scripts/read_figma_frames.js` as one `use_figma` call per 2–4 frames, with `const FRAME_IDS = ['1:3', '1:49'];` before the file's contents. Results over about 20 kB get cut off: text-heavy or diagram-heavy frames need smaller batches. If a result looks cut off, re-run with fewer frames.
2. **Save each result exactly as returned** to `<work>/frames-01.json`, `frames-02.json` … in slide order (the converter reads them in name order). Don't edit or summarise them.
3. **Slide pictures and images.** For each frame, call `download_assets` with the frame id. Request PNG at a scale that gives at least 1920 pixels across the frame (`defaultFormat: "png"`, `defaultScale: Math.max(1, 1920 / frameWidth)`). Download its `export` to `<work>/ref/<frame id with : as ->.png` (e.g. `ref/1-49.png`) and every `rawImages` URL into `<work>/images/` (any names: images are matched to Figma's image hashes by SHA-1). URLs expire in minutes: download straight away with `curl -sL -o <file> <url>`, in parallel.
4. **Convert:** `figma_to_spec.js <work> --title "<deck name>"`. Read the summary:
   - `missing_images` — an image fill whose file wasn't among the raw images (rawImages is capped at 20 per call): call `download_assets` on that layer's parent and download its raw images too.
   - `native_artwork_to_check` — editable linear gradients and simple shadows. Build and compare these candidates; native effects are attempts, not a guarantee that Keynote imports them accurately.
   - `artwork_needing_rebuild` — complex shadows, gradients, masks, blurs, blend modes, patterns, etc. Attempt an editable reconstruction using supported shapes, paths, gradient fills, images and shadows in the deck spec. Save replacement elements in `<work>/rebuilds.json` as `{"node-id": [elements]}`; use `"frame-id:background"` for a background so child text stays separate. Coordinates are slide coordinates. A nonempty replacement can contain multiple shapes. Keep text word for word and editable.
   - `missing_rasters` — exports still needed for fallback artwork the user already approved. See the fallback procedure below.
   - `fonts`, `warnings`, `incomplete`. Never deliver a deck as finished while `incomplete` is true.
   Run it again after downloads or rebuilds. Do not pass `--approved-rasters` until the relevant attempt failed its visual check and the user approved that specific fallback.

**Artwork fallback, only after an editable attempt fails**

1. Compare the attempted reconstruction with the source. Record the element id, what was attempted, and the remaining difference in the work folder. Show the user the comparison and explain exactly what would stop being editable. Allow the user to request another attempt, approve flattening that element, or leave it unresolved. A complex source feature alone is not a failed attempt. Do not ask for flattening approval before attempting the reconstruction.
2. For each approved background (`frame-id:background`), run `create_background_artwork.js` in `use_figma` with `const FRAME_ID = '…';`. This creates one temporary rectangle containing only the original background fills. Keep its returned `createdNodeIds`. Save its `renderBounds` in `<work>/raster-bounds.json` as `{"frame-id:background": [x,y,w,h]}` so shadows extending beyond the frame can be cropped accurately. Download its PNG to `<work>/raster/<frame-id with : as ->-background.png` at a scale giving at least 1920 pixels across. Then remove only those temporary ids using `getNodeByIdAsync(id)` and `remove()` in a follow-up call; return `removedNodeIds`. Clean up even when a download fails. Never hide or modify original children. This keeps the slide’s text out of the background image.
3. For approved individual layers, download an isolated PNG to `<work>/raster/<id with : as ->.png` and verify its transparency and render bounds. If its exported bounds differ from the reader’s element bounds, record them under the node id in `raster-bounds.json`. Blurs and blend modes that depend on the backdrop may need a crop from the source render. If that crop contains overlapping text, disclose it and get approval for that additional loss of editability before using it. Never silently bake text into artwork.
4. Re-run with `--approved-rasters '1:2,1:3:background'`, including only approved ids. Approved ids override attempted replacements in `rebuilds.json`; their backgrounds and source text are never combined into one full-slide picture. Inspect `flattened_artwork` and re-check the affected slides. Keep the approval list for subsequent rebuilds.

## 4. Fonts (always ask, every job)

Never replace a font without asking, even when the choice looks obvious, and even when every font is installed (then confirm in one line). For each family with `installed: false`, propose a replacement the Mac has (`list_fonts.js`), close in feel and with the styles used. A font may exist in Figma (a team font) but not on the Mac: say so plainly and offer to keep the name so it switches back once they install it. Ask the user: **Use these replacements** / **Change some** / **Keep the original names**. Pass the answer as `--font-map '{"Inter Tight":"Inter"}'`. Styles are matched by name first ("Semi Bold Italic"), then by nearest weight.

## 5. Build and check (every slide, every time)

```
osascript -l JavaScript "$S/keynote/build_check.js" <work>/deck-spec.json <output>.key [--font-map '…'] [--app …]
```
It builds, converts (re-applying italics Keynote's importer drops), lines text boxes up with Figma's picture, rebuilds if anything moved, and compares every slide. Side-by-side pictures (left to right: Figma | Keynote | red where they differ) and `flagged.png` are in `<output>-check/compare/`. Individual comparisons use 1920 pixels across by default, preserve the deck’s aspect ratio, and use smaller patches to catch local errors. Higher-resolution checks take longer than the former thumbnail checks. `low_resolution_slides` flags source or output images below the comparison resolution; re-export those before claiming detailed fidelity.

Then:
1. Look at `flagged.png`, the side-by-side of every flagged slide, and a few unflagged ones at random. Small text can differ without being flagged.
2. For each real difference, find the cause (gotchas), fix the reader, the converter or the spec, and re-run **only the affected frames**.
3. Stop when every flagged slide is fixed or explained. Never say a slide matches without having looked at its side-by-side picture.
4. After the pilot: show the user a few side-by-sides and the `.key`, and ask before doing the rest.

If `to_keynote.js` stops with `ask_user`, Keynote is showing a dialog: ask the user what it says. Don't take screenshots of their screen.

## 6. Report

Keep it short and plain:
- where the `.key` is, slides built, images, layers turned into pictures (and why: filters, blur, gradient…);
- font replacements the user chose, and any font still missing;
- slides that still differ, and how;
- anything unresolved, prototype links and animations omitted, and each approved flattened element with its reason. Disclose any approved pictures with text baked in (from `warnings`).

Offer to delete the work folder afterwards (it holds every image).

## Ground rules

- Read source nodes without changing them. After an approved background fallback, `create_background_artwork.js` may create an export-only rectangle. Remove only its returned temporary ids immediately after the export; never change, move or delete existing source nodes.
- Attempt editable artwork first. Flatten only a visually failed attempt the user explicitly approved, and report every flattened element. A request to try again revokes the fallback for that element until a new approval is given.
- Only create new files. Never overwrite an existing `.key` without asking.
- Only close Keynote documents this job opened. Never close or quit the user's other documents, and never quit Keynote.
- Keep text word for word.
- Don't take screenshots of the user's screen. Keynote's exports and Figma's renders are how you see the result.
- Don't upload the design, its images or the Keynote file anywhere.
