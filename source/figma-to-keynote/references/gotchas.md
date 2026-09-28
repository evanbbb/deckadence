# Gotchas (learned the hard way)

Keynote-side lessons (importing, fonts, italics, text placement, checking) are in `scripts/keynote/keynote-gotchas.md`. Read both.

**Reading frames**
- If your AI tool offers Figma's `figma-use` guide (a skill, or the MCP resource `skill://figma/figma-use/SKILL.md`), read it before the first `use_figma` call.
- `use_figma` results are cut off around 20 kB. The reader keeps output small (defaults and frame-wide clips are dropped), but diagram frames with many arrows or long text still need 1–3 frames per call.
- The results come back to you, not to a file: save each one to `frames-NN.json` exactly as returned.
- **Figma path data has the command letter stuck to the first number** (`M111.707 0.707107C…`). Splitting on spaces gave `NaN` everywhere. The reader splits into letters and numbers.
- Vector outlines are taken from `fillGeometry` and `strokeGeometry` and moved into frame coordinates in the reader, so arrowheads, stroke caps, rotation and mirroring are all already applied. They become editable Keynote shapes.
- `absoluteRenderBounds` (not the bounding box) is where a layer's picture lands: it includes effects and rotation.
- Text: `getStyledTextSegments` gives font, size, colour, letter spacing, line height, case, links and lists per run. Line height and letter spacing in percent are converted to px with the run's size.
- Figma doesn't expose where it wraps lines. Keynote wraps at the same width, but a font drawn a touch narrower or wider (DM Sans Bold in Keynote vs Figma) can move one word between lines. Known limit.

**Images**
- `download_assets` gives the original images without saying which layer uses which. Figma's image hash is the SHA-1 of the file, so match by hashing. `rawImages` is capped at 20 per call.
- Image fills: `FILL` = cover the box, `FIT` = contain, `CROP` = `imageTransform` gives the visible part of the image in 0–1 image coordinates. `TILE`, rotated image fills and image filters can't be expressed in Keynote.
- **Figma's export of a single layer is flattened on white** (no transparency, for images with filters, stacked fills, mirrored images, blurs…). Exported on its own, a head on a grey box came out on a white square. So layers that must become pictures are cut out of Figma's picture of the whole slide instead: exactly what shows, blend modes and transparency included, and no extra downloads. Only a gradient box with layers on top uses its own export (it's a solid rectangle, and the text on it stays out of the picture).
- A picture cut from the slide can have text baked in when text sits on top of it. The text is still rebuilt as real text on top, so it looks right, but moving that text later leaves a copy behind. The converter warns about each one.

**Fonts**
- Team fonts (like "OpenAI Sans") may render differently in Figma than the copy installed on the Mac: the test file's word spacing was much wider in Figma. The check barely flags small text like that, so spot-check.
- Optical-size families ("DM Sans 18pt", "24pt"…) exist next to the main family. The builder prefers the main family's faces.

**Frames**
- Figma has no slide order: ask (rows top to bottom, then left to right, is the default).
- A frame background that's a gradient becomes its first colour (warning in the summary).
- Shadows are left out (warning per layer).
