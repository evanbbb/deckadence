// Turn what read_figma_frames.js returned into a deck spec for the Keynote builder.
//
//   osascript -l JavaScript figma_to_spec.js <work-dir> [--title "Deck name"] [--font-map '{"Inter Tight":"Inter"}']
//
// <work-dir> must contain:
//   frames-01.json …  the reader's results, one file per call, saved exactly as returned ({frames, warnings}); read in
//                     name order, so number them in slide order (a single frames.json with a list also works)
//   images/           every raw image from download_assets, any names: matched to Figma's image hashes by SHA-1
//   ref/              Figma's picture of each slide frame (download_assets `export`), named by frame id with ':' as '-'
//   raster/           only for the node ids this script lists as `missing_rasters` (gradient boxes with layers on top),
//                     named the same way. Everything else that must become a picture is cut out of the slide picture.
//                     Run once to get the list, download those, run again.
// Writes <work-dir>/deck-spec.json (and media/ for cut-outs) and prints a summary: slides, images, pictures, what's
// still missing, fonts (family, styles, slides, installed?) and the reader's warnings. Uses only macOS.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'keynote/lib.js'), $.NSUTF8StringEncoding, null).js);

var fid = id => id.replace(/:/g, '-').replace(/;/g, '_');
function intersect(b, c) {
  if (!c) return b;
  const x1 = Math.max(b[0], c[0]), y1 = Math.max(b[1], c[1]), x2 = Math.min(b[0] + b[2], c[0] + c[2]), y2 = Math.min(b[1] + b[3], c[1] + c[3]);
  return x2 - x1 < 0.5 || y2 - y1 < 0.5 ? null : [x1, y1, x2 - x1, y2 - y1];
}
function pathBox(d) {
  const nums = (d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || []).map(Number), xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2);
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs) + 0.5, Math.max(...ys) - Math.min(...ys) + 0.5] : null;
}

// A Figma image fill -> spec image with the crop (fractions of the picture), mask and rotation Keynote applies itself
function imageElement(el, src, size, relFile) {
  const W = size.w, H = size.h;
  let [x, y, w, h] = [el.x, el.y, el.w, el.h];
  const mode = el.mode || 'FILL';
  let crop;
  if (mode === 'FIT') { const s = Math.min(w / W, h / H), nw = W * s, nh = H * s; x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh; crop = [0, 0, W, H]; }
  else if (mode === 'CROP' && el.xf) { const [[a, , tx], [, d, ty]] = el.xf; crop = [tx * W, ty * H, (tx + a) * W, (ty + d) * H]; }
  else { const s = Math.max(w / W, h / H), cw = w / s, ch = h / s; crop = [(W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2]; }  // FILL
  // parts of the crop outside the picture are empty: shrink the box to match
  let sx = (crop[2] - crop[0]) / w, sy = (crop[3] - crop[1]) / h;
  if (crop[0] < 0) { x += -crop[0] / sx; w -= -crop[0] / sx; crop[0] = 0; }
  if (crop[1] < 0) { y += -crop[1] / sy; h -= -crop[1] / sy; crop[1] = 0; }
  if (crop[2] > W) { w -= (crop[2] - W) / sx; crop[2] = W; }
  if (crop[3] > H) { h -= (crop[3] - H) / sy; crop[3] = H; }
  if (el.clip && !el.rot) {  // clipping by parent frames (unrotated images)
    const v = intersect([x, y, w, h], el.clip); if (!v) return null;
    crop = [crop[0] + (v[0] - x) * sx, crop[1] + (v[1] - y) * sy, crop[0] + (v[0] - x + v[2]) * sx, crop[1] + (v[1] - y + v[3]) * sy];
    [x, y, w, h] = v;
  }
  const e = { type: 'image', file: relFile, x: round1(x), y: round1(y), w: round1(w), h: round1(h) };
  const f = [crop[0] / W, crop[1] / H, 1 - crop[2] / W, 1 - crop[3] / H].map(v => Math.max(0, Math.round(v * 10000) / 10000));
  if (f.some(v => v > 0.0005)) e.crop = { l: f[0], t: f[1], r: f[2], b: f[3] };
  if (el.shape === 'ellipse') e.mask = 'ellipse';
  else if (el.r) e.mask = { roundRect: el.r };
  if (el.rot) e.rotation = el.rot;
  if ((el.fo == null ? 1 : el.fo) < 0.999) e.opacity = el.fo;
  return e;
}

var CASE = { UPPER: s => s.toUpperCase(), LOWER: s => s.toLowerCase(), TITLE: s => s.replace(/\b\w/g, c => c.toUpperCase()) };
var ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }, VALIGN = { TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom' };
function textElement(el, fonts, n) {
  const paras = []; let cur = [];
  for (const sg of el.segs) {
    const parts = sg.s.split('\n');
    parts.forEach((part, i) => {
      if (i) { paras.push(cur); cur = []; }
      if (!part) return;
      const size = sg.sz || 24, run = { text: (CASE[sg.cs] || (v => v))(part), font: sg.f, style: sg.st, size: Math.round(size * 100) / 100, color: sg.c || '#000000' };
      if ((sg.o == null ? 1 : sg.o) < 0.999) run.opacity = sg.o;
      if (sg.u) run.underline = true;
      if (sg.link) run.link = sg.link;
      if (sg.ls) run.letterSpacing = Math.round((sg.ls.unit === 'PERCENT' ? sg.ls.value / 100 * size : sg.ls.value) * 100) / 100;
      run._lh = sg.lh ? (sg.lh.unit === 'PERCENT' ? sg.lh.value / 100 * size : sg.lh.value) : null;
      run._list = sg.list;
      cur.push(run);
      const f = fonts[sg.f || '?'] || (fonts[sg.f || '?'] = { styles: new Set(), slides: new Set() });
      f.styles.add(sg.st); f.slides.add(n);
    });
  }
  paras.push(cur);
  const align = ALIGN[el.ha] || 'left';
  const out = paras.map(runs => {
    if (!runs.length) return { align, runs: [{ text: '', size: 24 }] };
    const p = { align, runs: [] }, lhs = runs.map(r => r._lh).filter(Boolean);
    if (lhs.length) p.lineHeightPx = round1(Math.max(...lhs));
    if (runs.some(r => r._list)) p.bullet = true;
    for (const r of runs) { delete r._lh; delete r._list; p.runs.push(r); }
    return p;
  });
  let x = el.x, w = el.w;
  if (el.ar === 'WIDTH_AND_HEIGHT') {  // a box that grows with its text never wraps: give Keynote a little room too
    const slack = Math.max(8, w * 0.05); x -= { center: slack / 2, right: slack }[align] || 0; w += slack;
  }
  const e = { type: 'text', x: round1(x), y: el.y, w: round1(w), h: el.h, valign: VALIGN[el.va] || 'top', paragraphs: out };
  if (el.rot) e.rotation = el.rot;
  return e;
}

function run(argv) {
  if (!argv.length) return 'usage: osascript -l JavaScript figma_to_spec.js <work-dir> [--title NAME] [--font-map JSON]';
  const work = abspath(argv[0]), title = argOpt(argv, '--title', 'Figma slides'), fontMap = JSON.parse(argOpt(argv, '--font-map', '{}'));
  const calls = [];
  for (const f of listDir(work).filter(f => /^frames.*\.json$/.test(f)).sort()) { const d = readJSON(join(work, f)); calls.push(...(Array.isArray(d) ? d : [d])); }
  const frames = calls.flatMap(c => c.frames || []), warnings = calls.flatMap(c => c.warnings || []);
  const byHash = {};
  for (const f of listDir(join(work, 'images'))) { const p = join(work, 'images', f); if (!isDir(p)) byHash[sha1(p)] = p; }
  const fonts = {}, slides = [], missingImages = new Set(), missingRasters = [];
  let nImg = 0, nCut = 0, nOwn = 0;
  frames.forEach((fr, idx) => {
    const n = idx + 1, els = [], refp = join(work, 'ref', fid(fr.id) + '.png');
    let refInfo = null;
    fr.els.forEach((el, k) => {
      if (el.k === 'box') {
        let box = [el.x, el.y, el.w, el.h];
        if (el.clip && !el.rot) { box = intersect(box, el.clip); if (!box) return; }
        const e = { type: el.shape === 'ellipse' ? 'ellipse' : 'rect', x: box[0], y: box[1], w: box[2], h: box[3], fill: el.fill, fillOpacity: el.fo == null ? 1 : el.fo,
          stroke: el.stroke, strokeWidth: el.sw || 0, radius: el.r || 0 };
        if (el.rot) e.rotation = el.rot;
        els.push(e);
      } else if (el.k === 'path') {
        els.push({ type: 'path', d: el.d, fill: el.fill, fillOpacity: el.fo == null ? 1 : el.fo });
      } else if (el.k === 'img') {
        const src = byHash[el.hash]; if (!src) { missingImages.add(el.hash); return; }
        const e = imageElement(el, src, imageSize(src), relpath(src, work)); if (e) { els.push(e); nImg++; }
      } else if (el.k === 'raster') {
        const box = intersect([el.x, el.y, el.w, el.h], el.clip || [0, 0, fr.w, fr.h]); if (!box) return;
        // Default: cut the area out of Figma's picture of the slide: exactly what shows (filters, blurs, blend modes,
        // stacked fills, transparency). Layers over it get baked in too, but they're rebuilt on top as real objects.
        // Figma's export of one layer is flattened on white, so it only helps for a gradient box with layers on top.
        const later = fr.els.slice(k + 1).filter(o => (o.k === 'path' ? intersect(box, pathBox(o.d) || [0, 0, 0, 0]) : o.x != null && intersect(box, [o.x, o.y, o.w, o.h])));
        const own = join(work, 'raster', fid(el.id) + '.png');
        if (later.length && el.why === 'gradient') {
          if (!exists(own)) { missingRasters.push(el.id); return; }
          const rb = [el.x, el.y, el.w, el.h];
          let rel = relpath(own, work);
          if (box.join() !== rb.join()) {
            const sz = imageSize(own), sx = sz.w / rb[2], sy = sz.h / rb[3];
            rel = `media/s${String(n).padStart(2, '0')}_${k}_r.png`;
            cropImage(own, join(work, rel), { x: Math.round((box[0] - rb[0]) * sx), y: Math.round((box[1] - rb[1]) * sy), w: Math.round(box[2] * sx), h: Math.round(box[3] * sy) });
          }
          els.push({ type: 'image', file: rel, x: box[0], y: box[1], w: box[2], h: box[3], src: `raster ${el.id} (${el.why}, own export)` }); nOwn++;
        } else {
          if (!exists(refp)) { missingRasters.push(fr.id + ' (slide picture)'); return; }
          refInfo = refInfo || imageSize(refp);
          const sx = refInfo.w / fr.w, sy = refInfo.h / fr.h, rel = `media/s${String(n).padStart(2, '0')}_${k}_ref.png`;
          cropImage(refp, join(work, rel), { x: Math.round(box[0] * sx), y: Math.round(box[1] * sy), w: Math.round(box[2] * sx), h: Math.round(box[3] * sy) });
          els.push({ type: 'image', file: rel, x: box[0], y: box[1], w: box[2], h: box[3], src: `raster ${el.id} (${el.why}, cut from slide picture)` }); nCut++;
          if (later.some(o => o.k === 'text')) warnings.push(`slide ${n}: ${el.id} (${el.why}) is cut from the slide picture with text over it: if that text is moved later, a copy stays in the picture`);
        }
      } else if (el.k === 'text') {
        els.push(textElement(el, fonts, n));
      }
    });
    slides.push({ n, figma: fr.id, name: fr.name, background: fr.bg || '#FFFFFF', ref: exists(refp) ? relpath(refp, work) : null, elements: els });
  });
  const W = Math.max(1920, ...frames.map(f => f.w)) === 1920 ? 1920 : Math.round(Math.max(...frames.map(f => f.w)));
  const H = frames.length ? Math.round(Math.max(...frames.map(f => f.h))) : 1080;
  writeJSON(join(work, 'deck-spec.json'), { title, width: W, height: H, fontMap, slides });
  return JSON.stringify({ slides: slides.length, images: nImg, pictures_cut_from_slide: nCut, pictures_own_export: nOwn,
    missing_images: [...missingImages], missing_rasters: missingRasters, no_ref: slides.filter(s => !s.ref).map(s => s.figma),
    fonts: Object.entries(fonts).sort((a, b) => b[1].slides.size - a[1].slides.size).map(([fam, f]) => Object.assign(
      { family: fam, styles: [...f.styles].filter(Boolean).sort(), slides: f.slides.size }, fontMap[fam] ? { replaced_by: fontMap[fam] } : {},
      { installed: fontFaces(fontMap[fam] || fam).length > 0 })),
    warnings, spec: join(work, 'deck-spec.json') }, null, 1);
}
