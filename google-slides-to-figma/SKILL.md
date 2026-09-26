---
name: google-slides-to-figma
description: Port Google Slides decks into a Figma design file, one Figma page per deck, with every slide rebuilt as a 1920×1080 frame with real editable text, the original images at full quality, animated GIFs kept as GIFs, and YouTube embeds turned into a thumbnail plus link. Can either restyle slides into the team's own Figma template/design system or copy them verbatim. Use this whenever someone wants to move, port, copy, convert, import or rebuild Google Slides / a Slides deck / a lecture or course deck / a pitch deck into Figma — including "put my slides in Figma", "turn these lessons into Figma pages", a docs.google.com/presentation link next to a figma.com link, or "the deck I have open in my browser" — even if they don't say "skill". Also handles first-time setup (connecting the Figma MCP, getting at a deck that's only open in the user's browser).
---

# Google Slides → Figma

You are helping someone — often a designer, not a developer — move slide decks from Google Slides into Figma. They care that the result looks right and is fully editable. Explain things in plain words, keep them posted in short lines, and never make them do something technical you could do yourself.

The work has six stages: **set up → ask → study the Figma file → extract each deck → agree fonts and colours → build and check.** Pilot with one small deck before doing many.

Bundled files (paths relative to this skill's folder):
- `scripts/extract_deck_inpage.js` — runs inside the Google Slides tab; captures every slide (render, images/GIFs, text boxes with fonts, shapes, notes, YouTube) into one ZIP.
- `scripts/prepare_deck.py` — unpacks the ZIP, crops images, handles files over Figma's upload limit, writes contact sheets and a proofreading text file.
- `scripts/figma_helpers.js` — building blocks for `use_figma` scripts (template mode and verbatim mode).
- `scripts/read_figma_styles.js` — reads the Figma file's text styles, colour styles and colour variables (read-only).
- `scripts/fonts_colors.py` — lists the deck's fonts (by family) and colours, and proposes Figma replacements → `mapping.json`.
- `scripts/make_verbatim_scripts.py` — writes ready-to-run verbatim build scripts.
- `scripts/upload.sh` — uploads images into the placeholders.
- `scripts/fix_text.js` — style-safe find-and-replace for the spelling pass.
- `references/setup.md` — connecting Figma and a browser, for non-technical users. Read it in stage 1 if anything is missing.
- `references/template-mode.md` — how to study a Figma design system and lay slides out in it. Read before building in template mode.
- `references/gotchas.md` — hard-won lessons. Read before stage 4.

## 1. Set up (check silently first, only ask when something is missing)

You need three things. Check each yourself; only involve the user for what's actually missing, and then walk them through it with `references/setup.md`.

1. **Figma MCP.** Try the Figma `whoami` tool. If it's not available or fails, follow the Figma section of setup.md. Also load the Figma plugin's `figma-use` skill before the first `use_figma` call (it's mandatory for that tool).
2. **A way into the deck.** Any browser tool that can run JavaScript in a page works: Claude in Chrome (best for non-technical users — it uses the Chrome window they're already signed into), gstack `browse`, Playwright MCP, or — as a last resort — the user pasting one script into Chrome's console. Ask: *"Is the deck open in your browser right now? Can I use that tab?"* The Google Drive connector alone is not enough: it only gives text, and its export refuses decks over 10 MB.
3. **Local tools.** `python3`, and ffmpeg for shrinking big GIFs and making contact sheets. Many people can't install system software (no admin rights), so don't reach for Homebrew. If `ffmpeg` isn't on the PATH, run `python3 -m pip install --user imageio-ffmpeg`. It puts a private ffmpeg in the user's own folder with no admin password, and `prepare_deck.py` finds it automatically. Tell the user in one line what you're installing and why. If even that fails (no internet access to PyPI, or pip blocked), carry on without ffmpeg: oversize files become drag-in-by-hand placeholders (see Call 2, question 3).

## 2. Ask (one short round of questions, with sensible defaults)

Use AskUserQuestion (max 4 questions per call, so two calls). Put the recommended option first. Skip anything the user already told you.

**Call 1 — what and where**
1. *Which decks?* A link, "the one open in my browser", or a Drive folder plus which files. For several decks, confirm the list and the order.
2. *Where in Figma?* A figma.com/design link. Default: a new page per deck named "Lesson N — Title" (match any naming already in the file). New pages go next to related pages; never rename, move or delete existing pages.
3. *Look:* **Match my Figma template** (restyle into their design system — best when the file already has example slides or styles) / **Copy the slides as they are** (verbatim: same layout, fonts, colours) / **Mix** (verbatim layout but their fonts/colours).
4. *Design references:* "Is there a page or example slides in the Figma file I should follow?" Ask for links to the best 2–3 examples. Ask this in every mode: in verbatim mode the examples still show which fonts and colours are "theirs".

**Call 2 — content rules**
1. *Brand colours and fonts, where do they live?* **The Figma file's colour and text styles** (default) / **A page or frame in Figma that shows the palette and type** (ask for the link) / **I'll paste hex codes and font names** / **Keep the deck's colours and fonts**. Don't ask for the actual replacements yet: that comes after extraction, when you can show them what the deck really uses (stage 4b).
2. *Spelling:* **Fix obvious typos and list every change** / leave text exactly as written / only give me a list.
3. *Big files (mostly GIFs):* Figma's MCP upload is capped at 10 MB per file, but people can drag in up to 50 MB by hand. Where should full-size originals be saved? Default `~/Downloads/<deck> full-size originals/`. Then choose: **Upload a smaller animated copy now** (they can swap in the original later) / **Leave a labelled drop-zone** and they drag the original in by hand. If there's no ffmpeg, only the drop-zone option works: say so.
4. *Leave out:* standard boilerplate (housekeeping, syllabus, Q&A, survey slides)? Speaker notes: skip (default) or add beside each slide? Headings: keep as written or sentence-case ALL-CAPS?

YouTube videos always become an HD thumbnail + play badge + clickable link (Google Slides can't embed other video). Mention it; don't ask.

Then restate the plan in 3–5 lines and start. Don't wait for approval of every detail — the pilot deck is the approval step.

## 3. Study the Figma file (template and mix modes)

In every mode, run `scripts/read_figma_styles.js` as one `use_figma` call and save what it returns as `figma-styles.json`. That's the file's text styles, colour styles and colour variables. If the user pointed to a palette page or pasted hex codes and fonts instead, write those into the same shape: `{"paints":[{"name":"Brand green","hex":"#1F6B4E"}], "textStyles":[{"name":"Heading","family":"DM Sans","size":96}]}`.

Template mode: also read `references/template-mode.md`. In short: screenshot the example pages the user named, and read a few example frames in detail (sizes, positions, which style each text uses). From that, write the `CFG` object for `figma_helpers.js` (style names per role, colour roles, running label, grid) and a short list of the layouts the examples use. Match what's there; don't invent a new system.

## 4. Extract each deck

Follow `references/gotchas.md`. For each deck:

1. Open the deck's **editor** URL (`…/presentation/d/<id>/edit`) in the browser tool and wait for it to load.
2. Run `scripts/extract_deck_inpage.js` in that tab (paste the whole file as the JavaScript to run). It returns "started" immediately; poll `window.__EXTRACT.status` and `done/total` every few seconds (a 70-slide image-heavy deck takes a few minutes).
3. Get the ZIP onto disk:
   - user's own Chrome (Claude in Chrome / console): it downloads automatically to `~/Downloads/<deck>-extract.zip` — find it there;
   - gstack/Playwright: set `window.__EXTRACT_OPTS={download:false}` before running, then write `window.__EXTRACT_ZIP_DATAURL()` to a file (`browse js "window.__EXTRACT_ZIP_DATAURL()" --out deck.zip`). For very large decks pull files one at a time with `window.__EXTRACT_GET(i)`.
4. Run `python3 scripts/prepare_deck.py <zip> <work-dir> --originals "<folder from Call 2>" --oversize shrink|placeholder`. Read its summary: which ffmpeg it used, slide count, GIFs, oversize files (where each original went, and whether it was shrunk or needs a manual drag-in), YouTube videos with titles, and warnings. If there are no contact sheets (no ffmpeg or Pillow), look at the `ref/sNN.png` renders directly.
5. Look at every slide: the contact sheets (`ref/sheet-N.png`) for structure, and individual `ref/sNN.png` renders in batches for detail. Read `text.txt`. Decide which slides to skip and how sections map to rows.

## 4b. Fonts and colours (ask once, with the real lists)

This is where Slides and Figma differ most. Run `python3 scripts/fonts_colors.py <work-dir>[,<work-dir2>…] figma-styles.json`; pass all decks together so they share one mapping. It prints two short tables and writes `mapping.json`:
- **Fonts, by family:** each deck font family with its weights, what it's used for (headings, body, small text) and how many slides use it, plus the proposed Figma family. Families are replaced as a whole: at build time every weight goes to the nearest weight the new family has (Inter Black → DM Sans Black; if the family has no Black, then ExtraBold, then Bold).
- **Colours, most used first:** near-identical shades are grouped. Each shows what it's used for and the closest Figma colour style or variable, with a match rating (same / close / loose / no close match). "No close match" colours are kept as they are unless the user picks one.

Show the user both tables in plain words (for example "Your deck's dark green header bars (#1F6B4E, 30 slides) have no close match in your Figma colours. Keep the green, or use one of yours?") and ask one AskUserQuestion: **Use these replacements** / **Change some** (they say which, e.g. "light green → brand-blue, keep Arial") / **Keep the deck's fonts and colours**. Edit `mapping.json` to match, and keep it for every deck in this job.

How it's used:
- **Verbatim / mix:** `make_verbatim_scripts.py … --mapping mapping.json`. Text uses the mapped family at the nearest weight. Colours mapped to a Figma colour style are linked to that style, so later brand changes flow through; other colours are plain hex.
- **Template:** text styles already decide fonts, so the font table is a check that nothing important is lost (e.g. a code font). The colour mapping tells you how to translate emphasis: the deck's highlight colour becomes the template's accent, and its header-bar colour usually disappears into the template's backgrounds. Colours the user chose to keep can be used directly.

## 5. Build, upload, check

- **Create the page(s)** in their own small `use_figma` call. Record page IDs.
- **Template mode:** plan each slide's layout from the examples (see template-mode.md), then write build scripts: paste `figma_helpers.js` after `const PAGE_ID=…; const CFG=…;`, then the slides for 1–2 rows. Keep each script under ~45k characters. Every script returns `{created, imgs}`.
- **Verbatim mode:** `python3 scripts/make_verbatim_scripts.py <work-dir> <PAGE_ID> cfg.json --mapping mapping.json`, then read each generated file and run it as a `use_figma` call in order.
- **Which file per image:** `prepare_deck.py` records each image's best file in `manifest.json` as `upload`: the crop, or the under-10 MB copy. Images marked `manual: true` have nothing to upload. Place images with the `media()` / `mediaFit()` helpers, passing the manifest entry. They make a normal placeholder, or a dashed **"Drag in by hand: <file>"** drop-zone for manual ones, at the right size so the user just drags the original onto it.
- **Images:** call `upload_assets` with `nodeIds` = the placeholder ids from `imgs` (≤60 per call, `scaleMode` FILL, `currentPageId` = the page), write a pairs file (`<submitUrl> <file>` per line, same order), and run `scripts/upload.sh <work-dir> <pairs>` straight away (URLs expire in ~10 minutes). Every line should say `"success":true`.
- **YouTube:** download `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` (fall back to `hqdefault.jpg`) into the work dir and use the `youtube()` helper. Don't place the small play-badge image Slides adds.
- **Check:** screenshot the whole page (`get_screenshot` on the page id) and zoom into dense slides with `node.screenshot()`. Fix clipped or overlapping text, wrong aspect ratios, empty grey placeholders. GIFs show blank in screenshots — verify them instead with `figma.getImageByHash(hash).getBytesAsync()` starting with `GIF89a`.
- **Several decks:** once the pilot is approved and subagents are available, run one builder per deck in parallel — each gets its own page id and must not touch any other page. Browser extraction stays sequential (one tab).

## 6. Spelling pass (if chosen)

Proofread `text.txt` yourself: a dictionary check misses real-word slips ("parts of if", "a exterior"). Fix spelling, doubled or missing words, a/an, and brand names (Midjourney, ChatGPT…). Leave quotes, code, prompts and style choices alone. Apply with `scripts/fix_text.js`, one page per call. A row that matches 0 times was probably already reworded by the builder — search before assuming. Report every change, and flag any that might change meaning (for example a number).

## 7. Report

Keep it short and plain:
- per deck: page name, slides built, images placed, GIFs and videos;
- which source slides were skipped and why;
- where full-size originals are and which slide each one belongs on. For drop-zones, add: *"In Figma, search layers for 'DRAG IN' to find each spot, then drag the file from the folder onto it."*;
- spelling changes (if any);
- anything to eyeball: redrawn diagrams, made-up section names, low-confidence choices.

Offer to clean up afterwards: browser sign-in data saved by headless tools, and the work folder.

## Ground rules

- Work only on pages you created for this job. Never delete, rename or reorder the user's existing pages or frames, and never call `.remove()` on a page. If something unexpected is missing, say so — don't "fix" it.
- Keep body text word for word unless the user chose spelling fixes; changing case of ALL-CAPS headings is fine if they agreed.
- Keep every meaningful image. Leave out template decorations (logos repeated on every slide, blank shapes, tiny icons), and say what you left out.
- Keep people informed in short updates while long steps run, and never claim something worked without checking it.
