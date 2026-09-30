// Turn a Google Slides extract (from extract_deck_inpage.js) into a deck spec for the Keynote builder.
//
//   osascript -l JavaScript slides_to_spec.js <extract.zip | extracted-folder> <work-dir> [--skip 3,17-19] [--font-map '{"Poppins":"DM Sans"}']
//
// Uses only macOS (unzip, curl, and the shared helpers). It:
//   1. unzips into <work-dir> (manifest.json, deck.json, ref/, media/)
//   2. describes each image's crop, mirroring and crop shape (circle, rounded box) in the spec: Keynote applies them
//      itself, and the builder cuts animated GIFs frame by frame (Keynote ignores crops on GIFs)
//   3. YouTube videos: downloads the HD thumbnail and makes it a clickable picture with a play badge
//   4. rebuilds text with Google's own line breaks, line spacing and paragraph gaps, and stacks everything in Google's
//      drawing order
//   5. writes <work-dir>/deck-spec.json and text.txt, and prints a summary: slides, images, GIFs, videos, and every font
//      family with its weights, slide count and whether this Mac has it (ask the user about replacements)
// Speaker notes are left out on purpose.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, ($.NSFileManager.defaultManager.fileExistsAtPath(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'powerpoint/lib.js')) ? 'powerpoint/lib.js' : 'keynote/lib.js')), $.NSUTF8StringEncoding, null).js);

function parseList(spec) {
  const out = new Set();
  for (const part of (spec || '').split(',')) {
    const p = part.trim(); if (!p) continue;
    if (p.includes('-')) { const [a, b] = p.split('-').map(Number); for (let i = a; i <= b; i++) out.add(i); } else out.add(+p);
  }
  return out;
}
var SOURCE_TARGET = 'keynote';
const sameStyle = (a, b) => ['font', 'size', 'weight', 'italic', 'color'].every(k => a[k] === b[k]);

// Group a paragraph's runs (one per SVG text node, usually a word) into the lines Google drew, top to bottom.
function linesOf(p) {
  const runs = (p.runs || []).filter(r => SOURCE_TARGET === 'powerpoint' ? !!r.text : (r.text || '').trim());
  if (runs.length && runs[0].y == null) return [runs];   // older extracts: no positions, one line
  const lines = [];
  for (const r of runs) {
    const size = r.size || 24;
    if (lines.length && Math.abs(r.y - lines[lines.length - 1][0].y) < size * 0.5) lines[lines.length - 1].push(r); else lines.push([r]);
  }
  lines.forEach(ln => ln.sort((a, b) => a.x - b.x));
  return lines;
}
// Rejoin words with spaces, keep Google's line breaks as soft breaks (\v), merge neighbours with the same style.
function runsOf(lines) {
  const out = [];
  lines.forEach((ln, li) => ln.forEach((r, i) => {
    const t = SOURCE_TARGET === 'powerpoint' ? r.text : r.text.trim();
    let sep;
    if (li === 0 && i === 0) sep = '';
    else if (i === 0) sep = '\v';
    else {  // a new text node also starts where the style changes mid-word ("meal" + "."): space only on a visible gap
      const prev = ln[i - 1], gap = r.x != null && prev.w != null ? r.x - (prev.x + prev.w) : 99;
      sep = gap > (r.size || 24) * 0.12 && !(SOURCE_TARGET === 'powerpoint' && (/\s$/.test(prev.text) || /^\s/.test(t))) ? ' ' : '';
    }
    const run = { text: sep + t, font: r.font, size: r.size, weight: r.weight, italic: r.italic, color: r.color };
    if (out.length && sameStyle(out[out.length - 1], run)) out[out.length - 1].text += run.text; else out.push(run);
  }));
  return out;
}
function alignment(lines) {
  const rows = lines.filter(ln => ln.length && ln[0].x != null).map(ln => [ln[0].x, ln[ln.length - 1].x + (ln[ln.length - 1].w || 0)]);
  if (rows.length < 2) return 'left';
  const spread = v => Math.max(...v) - Math.min(...v);
  if (spread(rows.map(r => r[0])) <= 6) return 'left';
  if (spread(rows.map(r => (r[0] + r[1]) / 2)) <= 8) return 'center';
  if (spread(rows.map(r => r[1])) <= 6) return 'right';
  return 'left';
}
function pitch(lines) {
  const ys = lines.filter(ln => ln[0].y != null).map(ln => ln[0].y);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter(g => g > 0).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
}
function textElement(tb) {
  const paras = (tb.paragraphs || []).filter(p => (p.text || '').trim());
  if (!paras.length) return null;
  const plines = paras.map(linesOf), align = alignment(plines.flat());
  let x = Math.min(...paras.map(p => p.rect.x)); const y = Math.min(...paras.map(p => p.rect.y));
  const right = Math.max(...paras.map(p => p.rect.x + p.rect.w)), bottom = Math.max(...paras.map(p => p.rect.y + p.rect.h));
  const w = right - x;
  // Google's line breaks are kept, so the box only needs room to never wrap on its own
  const slack = Math.max(16, w * 0.08);
  if (align === 'center') x -= slack / 2; else if (align === 'right') x -= slack;
  const sizes = plines.flat(2).map(r => r.size || 24).sort((a, b) => a - b), body = sizes[Math.floor(sizes.length / 2)] || 24;
  const boxPitch = plines.map(pitch).find(v => v);
  const out = []; let prevLast = null, prevLh = null;
  paras.forEach((p, k) => {
    const lines = plines[k], runs = runsOf(lines);
    if (!runs.length) return;
    const size = Math.max(...runs.map(r => r.size || 0)) || 24;
    const lh = pitch(lines) || (boxPitch && Math.abs(boxPitch - size * 1.2) < size * 0.6 ? boxPitch : null);
    const para = { align, runs };
    if (SOURCE_TARGET === 'powerpoint' && align === 'left' && Number.isFinite(lines[0][0].x)) {
      const inset = lines[0][0].x - x;
      if (inset > 1) para.marginLeft = round1(inset);
    }
    if (lh) para.lineHeightPx = round1(lh);
    if (prevLast != null && lines[0][0].y != null) {
      // from the top of the previous paragraph's last line: that line's height, plus the space before this one
      const gap = lines[0][0].y - prevLast - prevLh;
      if (gap > size * 0.1) para.spaceBefore = round1(gap);
    }
    prevLast = lines[lines.length - 1][0].y; prevLh = lh || size * 1.2;
    out.push(para);
  });
  const first = plines[0]?.[0]?.[0];
  const baseline = SOURCE_TARGET === 'powerpoint' && Number.isFinite(first?.baseline) ? { sourceBaselineY: first.baseline } : {};
  return { type: 'text', x: round1(x), y, w: round1(w + slack), h: bottom - y, paragraphs: out, src: tb.obj, z: tb.z, ...baseline };
}

// An image's crop (as fractions of the picture), mirroring and crop shape, for the builder
function imageElement(im, file) {
  const full = im.full, vis = im.vis;
  const e = { type: 'image', file, x: vis.x, y: vis.y, w: vis.w, h: vis.h, src: im.obj, z: im.z || 0 };
  if (full && (full.x !== vis.x || full.y !== vis.y || full.w !== vis.w || full.h !== vis.h) && full.w > 0 && full.h > 0) {
    let l = (vis.x - full.x) / full.w, t = (vis.y - full.y) / full.h;
    let r = 1 - (vis.x + vis.w - full.x) / full.w, b = 1 - (vis.y + vis.h - full.y) / full.h;
    if (im.flipH) [l, r] = [r, l];   // the crop is in the picture's own space; the slide shows it mirrored
    if (im.flipV) [t, b] = [b, t];
    const c = v => Math.max(0, Math.min(0.99, Math.round(v * 10000) / 10000));
    e.crop = { l: c(l), t: c(t), r: c(r), b: c(b) };
  }
  if (im.flipH) e.flipH = true;
  if (im.flipV) e.flipV = true;
  if (im.mask) {
    if (im.mask.startsWith('ellipse')) {
      const [mx, my, mw, mh] = im.mask.split(/\s+/).slice(1).map(Number);
      e.mask = Math.abs(mx - vis.x) < 3 && Math.abs(my - vis.y) < 3 && Math.abs(mw - vis.w) < 3 && Math.abs(mh - vis.h) < 3 ? 'ellipse'
        : { path: ellipsePath(mx, my, mw, mh) };
    } else e.mask = { path: im.mask };
  }
  return e;
}
function ellipsePath(x, y, w, h) {
  const pts = []; for (let i = 0; i < 64; i++) { const a = i / 64 * 2 * Math.PI; pts.push(round1(x + w / 2 + w / 2 * Math.cos(a)) + ' ' + round1(y + h / 2 + h / 2 * Math.sin(a))); }
  return 'M ' + pts[0] + ' L ' + pts.slice(1).join(' L ') + ' Z';
}

function youtubeThumb(work, id) {
  const out = `media/yt_${id}.jpg`, p = join(work, out);
  if (exists(p)) return out;
  for (const qual of ['maxresdefault', 'hqdefault']) {
    const r = sh(`/usr/bin/curl -sfL --max-time 20 -o ${q(p)} ${q(`https://i.ytimg.com/vi/${id}/${qual}.jpg`)}`);
    if (r.code === 0 && exists(p) && fileSize(p) > 2000) return out;
  }
  rmrf(p); return null;
}
function youtubeTitle(url) {
  const r = sh(`/usr/bin/curl -sfL --max-time 10 ${q('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url))}`);
  try { return JSON.parse(r.out).title; } catch (e) { return ''; }
}
function playBadge(x, y, w, h, z) {
  const d = Math.max(60, Math.min(160, Math.min(w, h) * 0.22)), cx = x + w / 2, cy = y + h / 2;
  return [{ type: 'ellipse', x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: '#000000', fillOpacity: 0.6, z: z + 0.5 },
    { type: 'text', x: cx - d / 2, y: cy - d * 0.36, w: d, h: d * 0.72, z: z + 0.6,
      paragraphs: [{ align: 'center', runs: [{ text: '▶', font: 'Helvetica Neue', size: Math.round(d * 0.5), color: '#FFFFFF' }] }] }];
}

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript slides_to_spec.js <extract.zip | folder> <work-dir> [--skip 3,17-19] [--font-map JSON]';
  const src = abspath(argv[0]), work = abspath(argv[1]);
  const skip = parseList(argOpt(argv, '--skip', '')), fontMap = JSON.parse(argOpt(argv, '--font-map', '{}'));
  mkdirp(work);
  if (src.endsWith('.zip')) shOK(`/usr/bin/unzip -o -q ${q(src)} -d ${q(work)}`);
  else if (src !== work) shOK(`/bin/cp -R ${q(src)}/. ${q(work)}/`);
  const manifest = readJSON(join(work, 'manifest.json')), deck = readJSON(join(work, 'deck.json'));
  const target = argOpt(argv, '--target', 'keynote'), videoPolicy = argOpt(argv, '--videos', '');
  SOURCE_TARGET = target;
  if (target === 'powerpoint' && (deck.youtube || []).length && videoPolicy !== 'source-poster-link') throw new Error('ask how to handle videos; supported policy is --videos source-poster-link');
  const ytByObj = {}; for (const v of deck.youtube || []) if (v.obj) ytByObj[v.obj] = v;
  const summary = { title: deck.title, slides: 0, skipped: [...skip].sort((a, b) => a - b), images: 0, gifs: 0, videos: [], warnings: (deck.warnings || []).slice() };
  const fonts = {}, slides = [], pendingArtwork = [], missingImages = [];
  const rebuilds = exists(join(work, 'rebuilds.json')) ? readJSON(join(work, 'rebuilds.json')) : {};
  for (const s of manifest) {
    const n = s.n; if (skip.has(n)) continue;
    let els = [];
    for (const sh_ of s.shapes || []) {
      if (!sh_.fill && !sh_.stroke) continue;
      const r = sh_.rect, base = { fill: sh_.fill, fillOpacity: sh_.fillOpacity == null ? 1 : sh_.fillOpacity, stroke: sh_.stroke, strokeWidth: sh_.strokeWidth || 0, radius: sh_.radius || 0, sourceId: sh_.sourceId, src: sh_.obj, z: sh_.z || 0 };
      if (sh_.path) els.push(Object.assign({ type: 'path', d: sh_.path }, base));
      else els.push(Object.assign({ type: ['ellipse', 'circle'].includes(sh_.tag) ? 'ellipse' : 'rect', x: r.x, y: r.y, w: r.w, h: r.h }, base));
    }
    // a YouTube embed is a thumbnail plus a small play badge in one object: keep the biggest image only
    const placed = new Set(), done = new Set();
    for (const im of (s.images || []).slice().sort((a, b) => b.vis.w * b.vis.h - a.vis.w * a.vis.h)) {
      const v = ytByObj[im.obj]; if (!v || done.has(v.id)) continue;
      done.add(v.id);
      const thumb = target === 'powerpoint' ? im.file : youtubeThumb(work, v.id), r = im.vis;
      summary.videos.push({ slide: n, url: v.url, title: target === 'powerpoint' ? '' : youtubeTitle(v.url), thumbnail: !!thumb });
      if (thumb) { els.push({ type: 'image', file: thumb, x: r.x, y: r.y, w: r.w, h: r.h, link: v.url, src: 'youtube', z: im.z || 0 }); if (target !== 'powerpoint') els = els.concat(playBadge(r.x, r.y, r.w, r.h, im.z || 0)); placed.add(im.obj); }
    }
    for (const im of s.images || []) {
      if (placed.has(im.obj)) continue;  // (no thumbnail download: the frame the deck showed is used instead)
      if (!im.file || !exists(join(work, im.file))) { summary.warnings.push(`slide ${n}: image ${im.k} missing (${im.type})`); missingImages.push({slide:n,id:im.k}); continue; }
      els.push(imageElement(im, im.file));
      summary.images++; if (im.type === 'image/gif') summary.gifs++;
    }
    for (const tb of s.texts || []) {
      const el = textElement(tb); if (!el) continue;
      if (el.z == null) el.z = 1e9;  // older extracts: text on top
      els.push(el);
      for (const p of el.paragraphs) for (const r of p.runs) {
        const fam = r.font || '?', f = fonts[fam] || (fonts[fam] = { weights: new Set(), slides: new Set(), max: 0 });
        f.weights.add(r.weight || 400); f.slides.add(n); f.max = Math.max(f.max, r.size || 0);
      }
    }
    if (target === 'powerpoint') for (const art of s.artwork || []) {
      const replacement = rebuilds[art.id];
      if (Array.isArray(replacement) && replacement.length) {
        els = els.filter(e => art.obj ? e.src !== art.obj : e.sourceId !== art.id);
        els.push(...replacement.map(e => Object.assign({ z: art.z || 0, sourceId: art.id }, e)));
      } else pendingArtwork.push({ slide: n, ...art });
    }
    // a text box's own highlight and background shapes go behind its text, whatever order the editor drew them in
    const textZ = {}; for (const e of els) if (e.type === 'text' && e.src) textZ[e.src] = e.z;
    for (const e of els) if (['rect', 'ellipse', 'path'].includes(e.type) && e.src in textZ) e.z = Math.min(e.z || 0, textZ[e.src] - 0.5);
    els.sort((a, b) => (a.z || 0) - (b.z || 0));  // back to front, as Google drew them
    const ref = `ref/s${String(n).padStart(2, '0')}.png`;
    slides.push({ n, background: s.background || '#FFFFFF', ref: exists(join(work, ref)) ? ref : null, elements: els });
  }
  if (manifest.some(s => (s.width || 1920) !== (manifest[0].width || 1920) || (s.height || 1080) !== (manifest[0].height || 1080))) throw new Error('source dimensions differ; ask how to normalize before converting');
  summary.slides = slides.length;
  writeJSON(join(work, 'deck-spec.json'), { title: deck.title || 'Deck', width: manifest[0]?.width || 1920, height: manifest[0]?.height || 1080, source: deck.url, physicalSize: deck.physicalSize || null, fontMap, slides, ...(target === 'powerpoint' ? {conversion:{unresolved_artwork:pendingArtwork,missing_images:missingImages,missing_rasters:[],flattened_artwork:[],missing_slides:(deck.requestedSlides || []).filter(n => !manifest.some(s => s.n === n)),source_errors:manifest.flatMap(s => (s.sourceErrors || []).map(why => ({slide:s.n,why})))}} : {}) });
  writeText(join(work, 'text.txt'), slides.map(s => `${s.n}: ` + s.elements.filter(e => e.type === 'text' && e.src).flatMap(e => e.paragraphs.map(p => p.runs.map(r => r.text).join('').replace(/\v/g, ' '))).join(' | ')).join('\n') + '\n');
  summary.fonts = Object.entries(fonts).sort((a, b) => b[1].slides.size - a[1].slides.size).map(([fam, f]) => Object.assign(
    { family: fam, weights: [...f.weights].sort((a, b) => a - b), slides: f.slides.size, largest_px: f.max },
    fontMap[fam] ? { replaced_by: fontMap[fam] } : {}, { installed: fontFaces(fontMap[fam] || fam).length > 0 }));
  if (target === 'powerpoint') { summary.artwork_needing_rebuild = pendingArtwork; summary.missing_images = missingImages; summary.incomplete = !!(pendingArtwork.length || missingImages.length); }
  summary.spec = join(work, 'deck-spec.json');
  return JSON.stringify(summary, null, 1);
}
