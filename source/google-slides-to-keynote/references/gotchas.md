# Gotchas (learned the hard way)

Keynote-side lessons (importing, fonts, italics, text placement, checking) are in `scripts/keynote/keynote-gotchas.md`. Read both.

**Getting the deck**
- Google's PowerPoint export changes the layout, and the Drive API export fails for anything over 10 MB. Read the live editor instead (`extract_deck_inpage.js`).
- The slide list only draws thumbnails near the viewport; the script scrolls it. If `deck.json` warnings mention gaps, re-run it.
- Slides load lazily. Slides that time out are listed in warnings: re-run just those with `window.__EXTRACT_OPTS={slides:[…]}`.
- **Measure the slide by its background, not by everything on it.** The page group's outline grows to include anything hanging off the slide (a photo bleeding past the edge), which shrank and shifted every position on such slides. The extractor uses the slide background element (`<pid>-bg`), which is exactly slide-sized.
- A deck's GIFs can add up to hundreds of MB: pull extracted files one by one (`__EXTRACT_GET(i)`) rather than as one ZIP data URL.
- YouTube embeds are stored as `i.ytimg.com/vi/<id>` thumbnail URLs, not youtube.com links.
- Links inside text aren't captured by the extractor. Known limit: say so in the report.

**Turning it into a spec**
- **Stacking order matters**: a full-slide photo drawn after the shapes hid the boxes on top of it. The extractor records each element's drawing order (`z`); the converter sorts by it. A text box's own highlight and background shapes always go behind its text.
- **Keep Google's line breaks.** Each word is its own SVG text node with a position, so the converter rebuilds the lines Google drew and writes them as soft line breaks, plus the measured line spacing. Widening boxes "to be safe" made Keynote re-wrap paragraphs.
- A new text node also starts where the style changes mid-word ("meal" + "."): a space is only added where there's a visible gap.
- Paragraph gaps are measured from the top of the previous paragraph's last line: subtract that line's height, not the next paragraph's.
- Images can be drawn **mirrored** (negative scale) and **cropped to a shape** (circle, rounded box). The extractor records `flipH/flipV` and the crop outline (`mask`); the converter mirrors the picture and makes it transparent outside the shape. Animated GIFs get on/off transparency, which is fine for circles and rounded corners.
- Curved or irregular shapes (rounded boxes, arrows) are traced into outlines; plain rectangles stay boxes.

**Checking against Google's picture**
- The comparison picture uses Google's SVG export rendered at 1920 pixels across, with a server PNG fallback if SVG rendering fails. Low-resolution fallbacks are warned about. The server export, which sometimes wraps a line differently from the editor (slide 43 of the test deck: "of a" / "great evening" in the export, "of a great" in the editor). Keynote follows the editor. If a flagged slide differs only by one word moving between lines, that's this, not a bug.
- A centred two-line title can come out with slightly more space between its lines. Known limit.
