# PowerPoint deck spec

The source readers write `deck-spec.json`. Coordinates and text sizes are in source slide pixels, with an explicit `width` and `height`. When the source has a physical page size, retain it as `physicalSize:{widthIn,heightIn,provenance}`; the builder uses it automatically. Otherwise `--width-in` supplies the user's confirmed physical slide width. All distances scale by `width-in * 72 / width` points per pixel. Height preserves the source ratio. A different source width requires an agreed resizing decision and `--resize-approved`. Do not change the ratio or combine differently sized frames without an agreed normalization policy.

```json
{"title":"Source title","width":1920,"height":1080,"slides":[
 {"n":1,"name":"Source slide","background":"#FFFFFF","ref":"ref/s01.png","elements":[
  {"type":"rect","x":20,"y":20,"w":300,"h":100,"fill":"#FFCC00","stroke":"#222222","strokeWidth":2},
  {"type":"text","x":40,"y":40,"w":260,"h":70,"valign":"top","paragraphs":[
   {"align":"left","lineHeightPx":50,"spaceBefore":0,"runs":[
    {"text":"Source words","font":"Arial","weight":700,"italic":true,"size":40,"color":"#222222","letterSpacing":0}
   ]}
  ]}
 ]}
]}
```

Supported editable elements:

- `rect`, `ellipse`: `x,y,w,h`, `fill`, `fillOpacity`, `stroke`, `strokeWidth`, `radius` for rounded rectangles, `rotation`.
- `path`: absolute uppercase `M L C Q Z` SVG path commands in slide coordinates, with fill/stroke. Unsupported commands need reconstruction; never accept a mangled path as a fallback.
- `line`: `x1,y1,x2,y2`, stroke and width.
- `text`: bounds, `rotation`, `valign` (`top/middle/bottom`), `paragraphs`. Paragraphs accept `align`, `lineHeightPx` or proportional `lineSpacing`, `spaceBefore`, `marginLeft` (source pixels), `bullet`, and `runs`. Runs accept exact `text`, `font`, CSS `weight`, `style`, `fontVariations` (four-character axis tags mapped to numeric values), `italic`, `size`, `color`, `opacity`, `underline`, `letterSpacing` and `link`. `\u000b` denotes a soft line break. The writer preserves XML-sensitive characters and Unicode. No automatic fitting or theme fonts.
- `image`: bounds, relative `file`, `rotation`, `opacity`, `link`, `flipH`, `flipV`, fractional `crop:{l,t,r,b}` and `mask` (`"ellipse"`, `{roundRect:radius}` or `{path:"..."}`). PNG/JPEG/GIF are retained; other formats are converted by macOS when supported. Original animated GIF bytes remain in the PowerPoint package, including with native crop/mask; verify their actual playback.

Native picture-effect candidates use `imageEffects:{grayscale:true,duotone:["#FFFFFF","#000000"]}`, with optional `saturation` and `brightness` adjustments from −1 to 1. Saturation is a relative multiplier: −0.07 writes 93%, with luminance unchanged. The two duotone colours interpolate across the picture's tones. These effects preserve the original bitmap and can be removed in PowerPoint. DrawingML brightness is a linear adjustment; it is not an exact mapping of Figma exposure. Use candidates only to reconstruct a source effect, then compare the native render; their presence in XML is not proof of a match. Other picture effects need reconstruction.

Shape blur candidates use `blur:{radius:16.3,grow:true}` in source pixels. Preserve the original shape bounds; rendered bounds include the blur and are not the underlying shape geometry. This emits native [DrawingML blur](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.blur). Its rendering must be compared with Figma before accepting the candidate. A blur with an unresolved match remains flagged; it does not authorize flattening.

Elements draw in list order. Paths/media are relative to the spec. `sourceId` identifies reconstruction artwork. The builder's blank layout provides no visible theme. Preserve actual source backgrounds; do not use example colours as defaults for missing source data.

Google text may carry `sourceBaselineY`, measured from the editor's SVG text. For unrotated top-aligned text with exact installed faces, the PowerPoint writer derives the box origin from that baseline, source line height and font ascent/descent. Other alignments and unresolved faces retain the original bounds. This placement model was checked in native Mac PowerPoint and still requires a comparison for each conversion; it is not permission to change fonts or infer missing source baselines.

Native linear gradient candidates on rectangles/ellipses: `gradient:{transform:[[a,c,tx],[b,d,ty]],stops:[{position,color:{r,g,b,a}}],opacity}`. Values are Figma normalized coordinates and 0–1 channels. Other gradient types require reconstruction. Shadow candidates: `shadows:[{type:"inner"|"outer",color:"#000000",opacity:0.3,blur:8,x:0,y:4}]`. Spread, multiple/group effects need additional reconstruction and visual evidence; this format is not proof of faithful compositing.

`conversion` tracks `unresolved_artwork`, `missing_images`, `missing_rasters`, `flattened_artwork` and your decision log. Unresolved entries block non-draft builds. The readers and builder report other warnings and styles separately; resolve those too. Notes, charts/tables as native chart/table objects, transitions and video embedding are not implemented. Ask about actual affected content instead of quietly dropping it.
