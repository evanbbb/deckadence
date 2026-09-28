---
name: google-slides-to-keynote
description: Convert Google Slides decks into Keynote (.key) files that look like the original and stay editable — real text in the deck's fonts at the right weights (italics included), Google's own line breaks, shapes and outlines, full-quality images cropped, masked and mirrored as on the slide, animated GIFs that play, and YouTube videos as a clickable thumbnail — then check every slide against the original and fix what doesn't match. Runs on the user's Mac with Keynote and nothing to install. Use this whenever someone wants to move, convert, export, copy or rebuild a Google Slides deck / a docs.google.com/presentation link / "the deck open in my browser" as Keynote, a .key file or "for Keynote". Not for Figma sources (use figma-to-keynote) or for putting slides into Figma (use google-slides-to-figma).
---

# Google Slides → Keynote

You are helping someone — often a designer, not a developer — turn Google Slides decks into Keynote files. They care that the result looks like the original and is fully editable. Explain things in plain words, keep them posted in short lines, and never make them do something technical you could do yourself.

These instructions work in any AI coding tool that can run shell commands on the user's Mac (Claude Code, Codex and others). Where they say **ask the user**, use your tool's question feature if it has one; otherwise ask in plain text and wait for the answer.

The work has five stages: **set up → ask → extract → fonts → build and check**, then report. **Always pilot on a small, varied batch (10–15 slides) first, and ask before running the whole deck.** Follow-up fixes are re-tested on the affected slides only.

How it works: a script reads the deck from the Google Slides editor in the browser (layout, text with fonts and line positions, shapes and outlines, images with their crop, mirroring and crop shape, GIFs, a picture of each slide). `slides_to_spec.js` turns that into a neutral `deck-spec.json`. The Keynote builder writes a PowerPoint file only as a hand-over format; Keynote opens it, fixes are applied by AppleScript, and it saves a real `.key`. Every slide is then exported and compared with Google's picture of it. Google's own PowerPoint export is never used (it breaks layouts and fails over 10 MB).

**Nothing to install.** Every script runs with `osascript -l JavaScript` and tools that ship with macOS (`zip`, `unzip`, `sips`, `curl`). No Python, no packages, no admin rights. Nothing is uploaded anywhere: the scripts only read from Google Slides and write files on this Mac.

Bundled files (paths relative to this skill's folder):
- `scripts/extract_deck_inpage.js` — runs inside the Google Slides tab; captures every slide into one ZIP.
- `scripts/slides_to_spec.js` — unpacks the extract, describes images, rebuilds text with Google's line breaks, lists fonts, writes `deck-spec.json`.
- `scripts/keynote/` — the Keynote builder, shared with figma-to-keynote:
  - `build_check.js` — **the one command for stage 5**: build → convert → line up text → rebuild → compare.
  - `build_pptx.js`, `to_keynote.js`, `fix_text_offsets.js`, `compare.js` — the steps it runs (use them one by one only when fixing something).
  - `list_fonts.js` — which fonts and weights this Mac has.
  - `deck-spec.md` — the spec format, for editing the spec by hand. `keynote-gotchas.md` — Keynote lessons.
- `references/setup.md` — getting into the deck and letting the AI control Keynote, for non-technical users.
- `references/gotchas.md` and `scripts/keynote/keynote-gotchas.md` — hard-won lessons. Read both before stage 3.

Below, `S` means this skill's `scripts` folder, and every `.js` script runs as `osascript -l JavaScript "$S/<script>" …`.

## 1. Set up (check silently, only ask when something is missing)

1. **Keynote Creator Studio.** Check `/Applications/Keynote Creator Studio.app` exists (bundle id `com.apple.Keynote`). Default to it. If only the older standalone Keynote is installed (`com.apple.iWork.Keynote`), or both are, ask the user which to use and pass `--app <bundle id>` for anything but Creator Studio. An out-of-date standalone Keynote shows an "out of date" dialog and opens nothing: say so and suggest Creator Studio.
2. **Permission to control Keynote.** The first Keynote step makes macOS ask whether the terminal (or the AI app) may control Keynote. Warn the user just before: *"macOS will ask whether your terminal may control Keynote. Please click OK."* If it was refused before, see setup.md. If your tool runs commands in a sandbox that blocks controlling other apps, ask the user to allow it for this job (setup.md).
3. **A way into the deck.** Any browser tool that can run JavaScript in a page, or the user pasting one script into Chrome's console (always works, no installs). Follow the user's own rules about which browser tool to use. See setup.md.

## 2. Ask (one short round, with sensible defaults)

Ask the user; put the recommended option first; skip anything they already told you.
1. *Which decks?* A link, "the one open in my browser", or several (confirm the list and order).
2. *Where should the Keynote files go?* Default `~/Documents/Keynote/<deck title>.key`. Keynote is sandboxed: keep the work folder inside the user's home folder (Documents or Downloads), not `/tmp`.
3. *Leave anything out?* Boilerplate slides (housekeeping, Q&A…), or nothing (default).
4. *Pilot slides:* "I'll try 10–15 varied slides first and show you the result before doing the rest." Suggest a mix (title, text-heavy, photo grid, GIF, diagram) once you've seen the slides; let them pick others.

Mention without asking: speaker notes are not copied; YouTube videos become a clickable thumbnail with a play badge (Keynote can't embed YouTube); GIFs will play. Fonts are asked about after extraction (stage 4), when you can show the real list.

## 3. Extract

Follow the gotchas. For each deck:
1. Open the deck's **editor** URL (`…/presentation/d/<id>/edit`) and wait for it to load.
2. Run `scripts/extract_deck_inpage.js` in that tab (the whole file as the JavaScript to run). It returns "started". Poll `window.__EXTRACT.status` and `done/total` every few seconds (a few seconds per slide). For the pilot, set `window.__EXTRACT_OPTS={slides:[…]}` first.
3. Get the ZIP onto disk: in the user's own Chrome it downloads to `~/Downloads/<deck>-extract.zip`. With a headless browser tool, set `window.__EXTRACT_OPTS={download:false, …}` before running, then write `window.__EXTRACT_ZIP_DATAURL()` to a file, or for big decks (hundreds of MB of GIFs) pull the files one by one: `window.__EXTRACT.files[i].name` and `window.__EXTRACT_GET(i)` (a data URL of file i).
4. Run `slides_to_spec.js <zip-or-folder> <work-dir> [--skip 3,17-19]`. Read the summary: slides, images, GIFs, videos, warnings, and the **fonts** table.
5. Look at the slide pictures (`ref/sNN.png`) so you know what each slide should look like.

## 4. Fonts (always ask, every job)

Never replace a font without asking, even when the choice looks obvious, and even when every font is installed (then just confirm in one line: *"All the deck's fonts are on this Mac: DM Sans (72 slides), Arial (2). I'll keep them."*).

For every family with `installed: false`, propose a replacement the Mac has (`osascript -l JavaScript "$S/keynote/list_fonts.js"` lists them; `--families "Name"` checks one): close in feel, with the weights the deck uses. Show a short table in plain words, e.g. *"IBM Plex Serif (the big numbers, 2 slides) isn't on this Mac. Use Georgia, or keep IBM Plex Serif so it switches back once you install it?"* Ask the user: **Use these replacements** / **Change some** (they say which) / **Keep the original names** (Keynote shows a substitute until the font is installed). Pass the answer as `--font-map '{"IBM Plex Serif":"Georgia"}'`. Weights go to the nearest weight the new family has.

## 5. Build and check (every slide, every time)

```
osascript -l JavaScript "$S/keynote/build_check.js" <work>/deck-spec.json <output>.key [--font-map '…'] [--app …]
```
It builds the hand-over file, has Keynote open it and save the `.key` (re-applying italics, which Keynote's importer drops), exports every slide, lines text boxes up with the source picture, rebuilds once if anything moved, and compares every slide. It prints: slides, GIFs that came in as movies, italic fixes, text boxes lined up, `fonts_not_installed`, `fonts_missing`, and the flagged slides with their scores. The side-by-side pictures (left to right: source | Keynote | red where they differ) and `flagged.png` are in `<output>-check/compare/`. Allow about 5 seconds per slide.

Then:
1. Look at `flagged.png`, the side-by-side picture of every flagged slide, and a few unflagged ones at random. The score is a pointer, not a verdict: small text can differ without being flagged.
2. For each real difference, find the cause (the gotchas list the known ones), fix the spec or the script, and re-run **only the affected slides** (make a spec with just those, or re-extract them with `__EXTRACT_OPTS.slides`).
3. Stop when every flagged slide is fixed or explained. Never say a slide matches without having looked at its side-by-side picture.
4. After the pilot: show the user a few side-by-sides and the `.key`, and ask before running the whole deck.
5. Ask the user to open the `.key` and play one GIF slide. GIFs can't be checked from a still picture.

If `to_keynote.js` stops with `ask_user`, Keynote is showing a dialog. Ask the user what it says (they can send a screenshot); don't take screenshots of their screen yourself. If Keynote already has a document with the same name open, it stops: ask the user to close it.

## 6. Report

Keep it short and plain:
- per deck: where the `.key` is, slides built, images, GIFs, videos;
- slides left out, and why;
- font replacements the user chose, and any font still missing;
- slides that still differ, and how (for example "slide 43: one line wraps a word later than Google's picture shows");
- known limits that affected this deck (gotchas): links inside text aren't copied, speaker notes aren't copied, charts and tables come across as pictures or simple shapes.

Offer to clean up afterwards: the work folder (it holds a copy of every image) and any browser sign-in data a headless browser saved.

## Ground rules

- Only create new files. Never overwrite an existing `.key` without asking; if the name is taken, add " (2)".
- Only close Keynote documents this job opened. Never close or quit the user's other documents, and never quit Keynote.
- Keep text word for word. Don't fix spelling unless the user asks.
- Keep every meaningful image. Leave out nothing unless the user said so, and report what you left out.
- Don't take screenshots of the user's screen. Keynote's own exports are how you see the result.
- Don't upload the deck, its pictures or the Keynote file anywhere.
