---
name: google-slides-to-figma
description: Port Google Slides decks into a Figma design file, one Figma page per deck, with every slide rebuilt as a 1920×1080 frame with real editable text, the original images at full quality, animated GIFs that play (after one drag-in by the user), and YouTube embeds turned into a thumbnail plus link. Can either restyle slides into the team's own Figma template/design system or copy them verbatim. Use this whenever someone wants to move, port, copy, convert, import or rebuild Google Slides / a Slides deck / a lecture or course deck / a pitch deck into Figma — including "put my slides in Figma", "turn these lessons into Figma pages", a docs.google.com/presentation link next to a figma.com link, or "the deck I have open in my browser" — even if they don't say "skill". Also handles first-time setup (connecting the Figma MCP, getting at a deck that's only open in the user's browser).
---

# Google Slides → Figma

You are helping someone — often a designer, not a developer — move slide decks from Google Slides into Figma. They care that the result looks right and is fully editable. Explain things in plain words, keep them posted in short lines, and never make them do something technical you could do yourself.

Where these instructions say **ask the user**, use your AI tool's question feature if it has one; otherwise ask in plain text and wait for the answer.

The work has six stages: **set up → ask → study the Figma file → extract each deck → agree fonts and colours → build and check**, plus a short **GIF hand-off** when a deck has GIFs. Pilot with one small deck before doing many.

> **Known limitation: GIFs need the user's help.** Figma only plays a GIF that a person dragged in by hand. A GIF uploaded through the Figma MCP shows only its first frame, even though all its frames are stored. The MCP also refuses video (MP4), and the Plugin API can't create video or download files. So you can't make a GIF play on your own. Tell the user this in plain words when you ask your questions (Call 2, question 3), and again in stage 5b. Never say a GIF plays until the user has confirmed it.

Bundled files (paths relative to this skill's folder):
- `scripts/extract_deck_inpage.js` — runs inside the Google Slides tab; captures every slide (render, images/GIFs, text boxes with fonts, shapes, notes, YouTube) into one ZIP.
- `scripts/prepare_deck.py` — unpacks the ZIP, crops images, handles files over Figma's upload limit, writes contact sheets and a proofreading text file.
- `scripts/figma_helpers.js` — building blocks for `use_figma` scripts (template mode and verbatim mode).
- `scripts/read_figma_styles.js` — reads the Figma file's text styles, colour styles and colour variables (read-only).
- `scripts/fonts_colors.py` — lists the deck's fonts (by family) and colours, and proposes Figma replacements → `mapping.json`.
- `scripts/make_verbatim_scripts.py` — writes ready-to-run verbatim build scripts.
- `scripts/upload.sh` — uploads images into the placeholders.
- `scripts/place_gifs.js` — after the user drags the GIF folder onto the page, swaps the playing GIFs into their slots.
- `scripts/fix_text.js` — style-safe find-and-replace for the spelling pass.
- `references/setup.md` — connecting Figma and a browser, for non-technical users. Read it in stage 1 if anything is missing.
- `references/template-mode.md` — how to study a Figma design system and lay slides out in it. Read before building in template mode.
- `references/gotchas.md` — hard-won lessons. Read before stage 4.

## 1. Set up (check silently first, only ask when something is missing)

You need three things. Check each yourself; only involve the user for what's actually missing, and then walk them through it with `references/setup.md`.

1. **Figma MCP.** Try the Figma `whoami` tool. If it's not available or fails, follow the Figma section of setup.md. If your AI tool offers Figma's `figma-use` guide (a skill, or the MCP resource `skill://figma/figma-use/SKILL.md`), read it before the first `use_figma` call.
2. **A way into the deck.** Any browser tool that can run JavaScript in a page works: a tool that controls the user's own Chrome (best for non-technical users — it uses the Chrome window they're already signed into), a headless browser tool (Playwright, gstack `browse`, …), or — as a last resort — the user pasting one script into Chrome's console. Ask: *"Is the deck open in your browser right now? Can I use that tab?"* The Google Drive connector alone is not enough: it only gives text, and its export refuses decks over 10 MB.
3. **Local tools.** `python3`, and ffmpeg for GIF stills, shrinking big files and making contact sheets. Many people can't install system software (no admin rights), so don't reach for Homebrew. If `ffmpeg` isn't on the PATH, run `python3 -m pip install --user imageio-ffmpeg`. It puts a private ffmpeg in the user's own folder with no admin password, and `prepare_deck.py` finds it automatically. Tell the user in one line what you're installing and why. If even that fails (no internet access to PyPI, or pip blocked), carry on without ffmpeg: oversize files become drag-in-by-hand placeholders (see Call 2, question 3).

## 2. Ask (one short round of questions, with sensible defaults)

Ask the user, in two short rounds. Put the recommended option first. Skip anything the user already told you.

**Call 1 — what and where**
1. *Which decks?* A link, "the one open in my browser", or a Drive folder plus which files. For several decks, confirm the list and the order.
2. *Where in Figma?* A figma.com/design link. Default: a new page per deck named "Lesson N — Title" (match any naming already in the file). New pages go next to related pages; never rename, move or delete existing pages.
3. *Look:* **Match my Figma template** (restyle into their design system — best when the file already has example slides or styles) / **Copy the slides as they are** (verbatim: same layout, fonts, colours) / **Mix** (verbatim layout but their fonts/colours).
4. *Design references:* "Is there a page or example slides in the Figma file I should follow?" Ask for links to the best 2–3 examples. Ask this in every mode: in verbatim mode the examples still show which fonts and colours are "theirs".

**Call 2 — content rules**
1. *Brand colours and fonts, where do they live?* **The Figma file's colour and text styles** (default) / **A page or frame in Figma that shows the palette and type** (ask for the link) / **I'll paste hex codes and font names** / **Keep the deck's colours and fonts**. Don't ask for the actual replacements yet: that comes after extraction, when you can show them what the deck really uses (stage 4b).
2. *Spelling:* **Fix obvious typos and list every change** / leave text exactly as written / only give me a list.
3. *GIFs and big files:* Figma only plays GIFs that a person drags in by hand, so after the build they'll drag one folder of GIFs onto each page (one drag per deck, not per GIF). Where should that folder, and any image over Figma's 10 MB upload limit, be saved? Default `~/Downloads/<deck> GIFs and originals/`. For big non-GIF images: **Upload a smaller copy now** / **Leave a labelled drop-zone** to drag the original in by hand. If there's no ffmpeg or Pillow, only the drop-zone option works: say so.
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
   - user's own Chrome (browser tool or console): it downloads automatically to `~/Downloads/<deck>-extract.zip` — find it there;
   - gstack/Playwright: set `window.__EXTRACT_OPTS={download:false}` before running, then write `window.__EXTRACT_ZIP_DATAURL()` to a file (`browse js "window.__EXTRACT_ZIP_DATAURL()" --out deck.zip`). For very large decks pull files one at a time with `window.__EXTRACT_GET(i)`.
4. Run `python3 scripts/prepare_deck.py <zip> <work-dir> --originals "<folder from Call 2>" --oversize shrink|placeholder`. Read its summary: which ffmpeg it used, slide count, GIFs (each one's drag-in file and still), oversize files (where each original went, and whether it was shrunk or needs a manual drag-in), YouTube videos with titles, and warnings. If there are no contact sheets (no ffmpeg or Pillow), look at the `ref/sNN.png` renders directly.
5. Look at every slide: the contact sheets (`ref/sheet-N.png`) for structure, and individual `ref/sNN.png` renders in batches for detail. Read `text.txt`. Decide which slides to skip and how sections map to rows.

## 4b. Fonts and colours (ask once, with the real lists)

This is where Slides and Figma differ most. Run `python3 scripts/fonts_colors.py <work-dir>[,<work-dir2>…] figma-styles.json`; pass all decks together so they share one mapping. It prints two short tables and writes `mapping.json`:
- **Fonts, by family:** each deck font family with its weights, what it's used for (headings, body, small text) and how many slides use it, plus the proposed Figma family. Families are replaced as a whole: at build time every weight goes to the nearest weight the new family has (Inter Black → DM Sans Black; if the family has no Black, then ExtraBold, then Bold).
- **Colours, most used first:** near-identical shades are grouped. Each shows what it's used for and the closest Figma colour style or variable, with a match rating (same / close / loose / no close match). "No close match" colours are kept as they are unless the user picks one.

Show the user both tables in plain words (for example "Your deck's dark green header bars (#1F6B4E, 30 slides) have no close match in your Figma colours. Keep the green, or use one of yours?") and ask the user once: **Use these replacements** / **Change some** (they say which, e.g. "light green → brand-blue, keep Arial") / **Keep the deck's fonts and colours**. Edit `mapping.json` to match, and keep it for every deck in this job.

How it's used:
- **Verbatim / mix:** `make_verbatim_scripts.py … --mapping mapping.json`. Text uses the mapped family at the nearest weight. Colours mapped to a Figma colour style are linked to that style, so later brand changes flow through; other colours are plain hex.
- **Template:** text styles already decide fonts, so the font table is a check that nothing important is lost (e.g. a code font). The colour mapping tells you how to translate emphasis: the deck's highlight colour becomes the template's accent, and its header-bar colour usually disappears into the template's backgrounds. Colours the user chose to keep can be used directly.

## 5. Build, upload, check

- **Create the page(s)** in their own small `use_figma` call. Record page IDs.
- **Template mode:** plan each slide's layout from the examples (see template-mode.md), then write build scripts: paste `figma_helpers.js` after `const PAGE_ID=…; const CFG=…;`, then the slides for 1–2 rows. Keep each script under ~45k characters. Every script returns `{created, imgs}`.
- **Verbatim mode:** `python3 scripts/make_verbatim_scripts.py <work-dir> <PAGE_ID> cfg.json --mapping mapping.json`, then read each generated file and run it as a `use_figma` call in order.
- **Which file per image:** `prepare_deck.py` records each image's best file in `manifest.json` as `upload`: the crop, the under-10 MB copy, or (for a GIF) a still first frame. Images marked `manual: true` have nothing to upload. Place images with the `media()` / `mediaFit()` helpers, passing the manifest entry. They make a normal placeholder, a **"GIF: <file>"** slot for GIFs (showing the still for now), or a dashed **"Drag in by hand: <file>"** drop-zone for manual ones.
- **Images:** call `upload_assets` with `nodeIds` = the placeholder ids from `imgs` (≤60 per call, `scaleMode` FILL, `currentPageId` = the page), write a pairs file (`<submitUrl> <file>` per line, same order), and run `scripts/upload.sh <work-dir> <pairs>` straight away (URLs expire in ~10 minutes). Every line should say `"success":true`.
- **GIFs:** the build shows a still in each `GIF:` slot. Making them play is stage 5b, after the check below.
- **YouTube:** download `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` (fall back to `hqdefault.jpg`) into the work dir and use the `youtube()` helper. Don't place the small play-badge image Slides adds.
- **Check:** screenshot the whole page (`get_screenshot` on the page id) and zoom into dense slides with `node.screenshot()`. Fix clipped or overlapping text, wrong aspect ratios, empty grey placeholders. GIFs can't be checked from screenshots or bytes (a still-only GIF has the same bytes); that's what stage 5b is for.
- **Several decks:** once the pilot is approved and subagents are available, run one builder per deck in parallel — each gets its own page id and must not touch any other page. Browser extraction stays sequential (one tab).

## 5b. Bring in the GIFs (only if `gifs.json` is not empty)

Why this works: once a GIF has been dragged into the file, any fill that uses its image hash plays too. The hash is the SHA-1 of the file, which `prepare_deck.py` recorded in `gifs.json`. So the user does one drag per page, and `place_gifs.js` puts each GIF in its place.

1. **Prompt the user,** one page at a time, and say it plainly. For example:
   *"Figma only plays GIFs that you drag in yourself; I can't upload them in a way that plays. This page has 6 GIFs. Please:*
   *1. Open the folder `~/Downloads/Lesson 6 GIFs and originals/` (in Finder: Go → Go to Folder…, then paste it).*
   *2. Select all the GIFs (⌘A).*
   *3. Drag them onto the 'Lesson 6 — …' page in Figma. Anywhere on the page is fine; I'll move each one into place.*
   *4. Wait until they've finished loading in Figma."*
   Options: **Done, they're in** / **Skip GIFs for now** (they stay as stills and can be done later) / **Something went wrong** (ask what, and help).
2. **Place them.** When they say done, run `scripts/place_gifs.js` as one `use_figma` call. Set its `PAGE_ID` and paste `<work-dir>/gifs.json` as `GIFS`. It points each `GIF:` slot at its GIF, deletes the dropped copies, and returns `placed`, `alreadyPlaying` and `notDraggedInYet`.
3. **Follow up on gaps.** If `notDraggedInYet` isn't empty, name those files and ask the user to drag in just those. Then run the script again; it's safe to re-run.
4. **Ask them to confirm.** Give a link to one GIF slide (`…?node-id=<slot id with - for :>`) and ask: *"Can you check that this GIF plays? GIFs play on the canvas; if it looks still, try Present (▶)."* Options: **Yes, it plays** / **No, it's still**. If it's still, check that its slot has the hash from `gifs.json`, and ask whether the drag finished. Don't report GIFs as playing until they say yes.

Several decks: one prompt, one drag and one `place_gifs.js` run per page. Keep them in order, so the user always knows which folder goes onto which page.

## 6. Spelling pass (if chosen)

Proofread `text.txt` yourself: a dictionary check misses real-word slips ("parts of if", "a exterior"). Fix spelling, doubled or missing words, a/an, and brand names (Midjourney, ChatGPT…). Leave quotes, code, prompts and style choices alone. Apply with `scripts/fix_text.js`, one page per call. A row that matches 0 times was probably already reworded by the builder — search before assuming. Report every change, and flag any that might change meaning (for example a number).

## 7. Report

Keep it short and plain:
- per deck: page name, slides built, images placed, GIFs (confirmed playing, or still waiting for the drag-in: say which files and which page) and videos;
- which source slides were skipped and why;
- where full-size originals are and which slide each one belongs on. For drop-zones, add: *"In Figma, search layers for 'DRAG IN' to find each spot, then drag the file from the folder onto it."*;
- spelling changes (if any);
- anything to eyeball: redrawn diagrams, made-up section names, low-confidence choices.

Offer to clean up afterwards: browser sign-in data saved by headless tools, and the work folder.

## Ground rules

- Work only on pages you created for this job. Never delete, rename or reorder the user's existing pages or frames, and never call `.remove()` on a page. If something unexpected is missing, say so — don't "fix" it.
- Keep body text word for word unless the user chose spelling fixes; changing case of ALL-CAPS headings is fine if they agreed.
- Keep every meaningful image. Leave out template decorations (logos repeated on every slide, blank shapes, tiny icons), and say what you left out.
- Keep people informed in short updates while long steps run, and never claim something worked without checking it. For GIFs that means the user's own confirmation (stage 5b).
