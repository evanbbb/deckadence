# Gotchas (learned the hard way)

**Getting the deck**
- The PowerPoint export changes the layout, and the Drive API export fails for anything over 10 MB. Don't use either as the source. Read the live editor instead (`extract_deck_inpage.js`).
- The slide list (filmstrip) only draws thumbnails near the viewport. The script scrolls it to collect every slide. If `deck.json` warnings mention gaps, re-run it.
- Slides load lazily when you jump to them. The script waits until every image on the slide is loaded before reading it. On a slow connection some slides may time out; they're listed in warnings, so re-run just those with `window.__EXTRACT_OPTS={slides:[…]}`.
- Images come out at up to 2048 px on the long edge (that's what the editor loads), which is the original size for most images.
- **YouTube embeds aren't stored as youtube.com links.** They're `i.ytimg.com/vi/<id>` thumbnail URLs in the page data. The script finds them and the slide each sits on; `prepare_deck.py` looks up titles. Searching the text for "youtube" finds nothing.
- Google wraps links as `https://www.google.com/url?q=<real url>&…`. Use the real URL.
- The editor draws invisible hit areas and selection outlines. The script drops shapes with zero opacity. If a verbatim slide shows black boxes over the text, that filter has missed something.

**Figma**
- Load the `figma-use` skill before the first `use_figma` call.
- **Uploaded GIFs don't play.** A GIF sent through `upload_assets` keeps all its frames, but Figma shows only the first one, in the canvas, Dev Mode and Present. The upload tool also refuses video ("Unsupported content type: video/mp4"), and the Plugin API can't create video or fetch URLs. Only a GIF dragged in by hand plays. Once it's in the file, any fill that uses its image hash plays too, even after the dropped layer is deleted. The hash is the SHA-1 of the file. Hence the one-drag-per-deck flow: `prepare_deck.py` → `GIF:` slots → the user drags the folder in → `place_gifs.js`.
- Hand-dropped GIFs lose their file name (Figma calls them " 1", " 2" …). Match them by image hash, never by layer name.
- `upload_assets` rejects files over **10 MB** ("Asset too large (max 10MB)"), although Figma itself accepts 50 MB drag-and-drop. `prepare_deck.py` saves the untouched originals where the user asked. Then it either makes copies under the limit (big PNGs become high-quality JPEGs) or marks them `manual`, so the build leaves a "DRAG IN" drop-zone. GIFs don't need this: only a small still is uploaded.
- Don't assume the user can install software. Try `python3 -m pip install --user imageio-ffmpeg` before anything needing admin, and fall back to drop-zones rather than getting stuck.
- Upload URLs are single-use and expire in about 10 minutes: request them, then post straight away.
- GIF fills render **blank** in `get_screenshot` and `node.screenshot()`. Checking that the bytes start with `GIF89a` proves nothing: a still-only uploaded GIF has the same bytes. Only the user can see whether it plays.
- Look styles up **by name** at runtime. Hard-coded style IDs can fail with "Cannot find style".
- Line nodes put arrowheads on both ends. Use the `arrow()` helper (a vector with a cap on one end only).
- Use `insertCharacters` then `deleteCharacters` (as `fix_text.js` does) to change text. Setting `.characters` wipes coloured ranges and links.
- Each `use_figma` result is truncated around 20 kB: keep returned data compact.
- Pages load one at a time: switch with `await figma.setCurrentPageAsync(page)` once per call. For several pages, use parallel calls.

**Working safely**
- Only touch pages you created for this job. Before creating pages, record the full page list. At the end, compare it: if anything else changed or disappeared, tell the user (Figma's version history can restore it) rather than trying to repair it.
- When several builders run in parallel, give each exactly one page ID and tell it never to touch `figma.root` or other pages.
- Don't retry a macOS Keychain prompt in a loop: each retry opens another dialog.
- Headless browser sign-ins leave Google cookies on disk. Offer to delete them at the end.
