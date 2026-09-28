# Keynote builder: gotchas (every one found by testing)

Everything runs on what ships with macOS: JavaScript for Automation (`osascript -l JavaScript`), Foundation, AppKit and
ImageIO through its Objective-C bridge, and `/usr/bin` tools (`zip`, `unzip`, `sips`, `curl`, `shasum`). No Python,
no packages, no admin rights. (Recent macOS has no Python until Apple's Command Line Tools are installed, which needs
an admin password: that's why the builder doesn't use it.)

**Importing the hand-over file**
- **Speaker notes make Keynote refuse the whole file** ("The file format is invalid"). The builder never writes notes. If that error comes back, find the cause by building a copy of the spec with one kind of element at a time.
- 1 px = 1 pt, so a 1920 × 1080 slide opens as a 1920 × 1080 Keynote document and font sizes carry over as they are.
- Only the Blank layout is in `pptx-template/`: layouts with placeholders make Keynote open a "Warnings" window.
- A dialog (import error, warnings, sign-in, "out of date") blocks every script until someone clicks it. `to_keynote.js` opens files with `open -b`, waits for the document to appear, and after `--wait` seconds says to ask the user what the dialog says.
- Saving as `.key` renames the document (`deck` → `deck.key`): scripts refer to it by id.
- Keynote's export fails ("The file doesn't exist") if the destination's parent folder is missing.
- Plain "Keynote" can mean Creator Studio or the old standalone app: always address it by bundle id.
- Never close "every document": the user may have their own decks open. Close by id only.

**Pictures**
- Keynote honours a picture's crop (`srcRect`), shape mask (ellipse, rounded rectangle, custom outline) and mirroring on import, so pictures stay the original files, editable in Keynote.
- **GIFs become movies**, which play in the editor and loop in Play mode. Keynote keeps their mirroring but **ignores crops and masks on them**, so `build_pptx.js` cuts animated GIFs frame by frame with ImageIO (every frame, its timing and the loop kept; on/off transparency, fine for circles and rounded corners). A GIF that shows up as an image instead of a movie probably won't play.

**Fonts**
- Fonts are written as PostScript names (`HelveticaNeue-Medium`). That's how Keynote picks the exact weight.
- **Keynote's importer drops italic faces**: `DMSans-LightItalic` comes in upright, even with the italic flag set. The builder lists every italic run in `<pptx>.fixups.json`; `to_keynote.js` sets those fonts again by AppleScript before saving (`fonts_fixed`).
- Don't write `b="0"`/`i="0"` on runs: Keynote obeys the flag over the face name.
- Some fonts come from a font service (Adobe Fonts / Creative Cloud): missing from macOS's font list but they load fine. Look fonts up by family (`fontFaces()` in lib.js, or `list_fonts.js --families …`).
- Keynote reports some faces under another PostScript name (DM Sans Medium comes back as `DMSans-9ptRegular_Medium`). Same font; `compare.js` checks each reported name can be loaded (`fonts_missing`).
- Hyperlinked text takes Keynote's link colour (blue, underlined), not the colour the source gave it.

**Text placement**
- Apps put the first line of a text box at different heights, most of all with tight line spacing (a 213 px title with 205 px line height came out 47 px too high). `fix_text_offsets.js` measures each box against the source picture and moves it (`build_check.js` runs it). It only moves a box when the match gets clearly better, and never more than half its text size.
- Exact line heights (`lineHeightPx`) are written as exact point spacing; keep the source's line breaks (`\v`) where known.

**Checking**
- Keynote exports PNGs in **Display P3**. Read without converting, every colour looks washed out (#1F6B4E reads as #36694F). `lib.js` draws every picture into an sRGB bitmap before comparing, which converts it.
- Slides are flagged on their **worst patch** of a 12 × 8 grid (the average hides a re-wrapped paragraph). Small text can still differ without being flagged: always spot-check.

**JavaScript for Automation quirks**
- A method with no arguments is called by naming it: `task.launch`, not `task.launch()`.
- `eval`'d helper code only exposes `var` and function declarations to the caller, not `const`/`let`.
- JavaScript `null` becomes NSNull for Objective-C methods: `NSImage`'s `CGImageForProposedRect(null, null, null)` and `representationUsingType(…, $())` fail. Load pictures with ImageIO and pass `$.NSDictionary.dictionary`.
- In Keynote's dictionary, `slide.iWorkItems` and export `withProperties` don't convert from JavaScript ("Can't convert types"). Read `textItems`, `shapes`, `images`, `movies`, `lines` separately; the default slide-image export is already PNG at slide size.
- Setting the font of a character range is only dependable in AppleScript: `to_keynote.js` writes a small AppleScript for it.
- Shell commands go through NSTask (`sh()` in lib.js): AppleScript's `do shell script` turns newlines into returns.
