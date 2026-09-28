# Deck spec (the input to the Keynote builder)

Every "… to Keynote" skill first turns its source (a Google Slides extract, Figma frames, …) into one
`deck-spec.json`. The builder only reads this file, so it never needs to know where the slides came from.

All positions and sizes are in slide pixels, top-left origin, on a `width` × `height` slide (default 1920 × 1080).
In Keynote 1 px = 1 pt, so a 48 px font is 48 pt. File paths are relative to the spec file.

```json
{
  "title": "Lesson 6 — Colour",
  "width": 1920, "height": 1080,
  "slides": [
    {
      "n": 1,
      "background": "#FFFFFF",
      "ref": "ref/s01.png",
      "elements": [
        {"type": "rect", "x": 0, "y": 0, "w": 1920, "h": 160, "fill": "#1F6B4E", "fillOpacity": 1,
         "stroke": null, "strokeWidth": 0, "radius": 0, "rotation": 0},
        {"type": "ellipse", "x": 100, "y": 300, "w": 200, "h": 200, "fill": "#FFCC00"},
        {"type": "line", "x1": 100, "y1": 600, "x2": 900, "y2": 600, "stroke": "#000000", "strokeWidth": 3},
        {"type": "path", "d": "M100 700 L300 700 L200 800 Z", "fill": "#000000", "fillOpacity": 1},
        {"type": "image", "file": "media/s01_0.png", "x": 1000, "y": 200, "w": 800, "h": 600, "rotation": 0},
        {"type": "text", "x": 60, "y": 40, "w": 1800, "h": 90, "valign": "top",
         "paragraphs": [
           {"align": "left", "lineSpacing": null, "spaceBefore": 0, "bullet": false,
            "runs": [
              {"text": "Colour ", "font": "DM Sans", "weight": 700, "italic": false, "size": 72, "color": "#FFFFFF"},
              {"text": "theory", "font": "DM Sans", "weight": 400, "italic": true, "size": 72, "color": "#FFCC00",
               "underline": false, "link": "https://example.com"}
            ]}
         ]}
      ]
    }
  ]
}
```

Rules:
- Elements are drawn in list order: later ones sit on top.
- `image` may have a `link` (clicking the picture opens it: used for YouTube thumbnails).
- `image` files must already be cropped to what is visible, at the size shown. The builder stretches them to `w` × `h`.
  GIFs are fine: Keynote turns them into looping movies that play.
- `path` is a filled outline in slide px, absolute `M L C Q Z` commands only. It becomes an editable Keynote shape.
  Draw strokes and arrowheads as their outlines (Figma's `strokeGeometry` is exactly that).
- `image` may have `opacity` (0–1).
- Paragraphs may set `lineHeightPx` (exact line height in px) instead of `lineSpacing`. Runs may set `style`
  (the source's style name, e.g. "Semi Bold Italic": an exact match wins), `letterSpacing` (px) and `opacity` (0–1).
- `text` boxes wrap at `w` and have no inner padding, so `x`/`y` is where the first letter's box starts.
  `lineSpacing` is a multiple (1.2 = 120 %); null keeps the font's default.
- `font` is a family name as the source had it. `weight` is CSS (100–900). The builder picks the installed face
  of that family with the nearest weight. A `fonts` map passed to the builder swaps families first
  (`{"Proxima Nova": "Helvetica Neue"}`), for fonts that aren't installed.
- `ref` is a picture of what the slide should look like (the source render). `compare.js` checks the Keynote
  result against it.
- Anything else in an element is ignored, so a skill can keep its own notes (`"src": "…"`) there.
