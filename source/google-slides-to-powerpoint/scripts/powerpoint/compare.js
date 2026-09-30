// Check the Keynote result against the source, slide by slide.
//
//   osascript -l JavaScript compare.js <deck-spec.json> <keynote-png-dir> [--out <dir>] [--flag 12] [--width 1920]
//
// For every slide with a `ref` picture in the spec, compares it with Keynote's export of the same slide (the i-th spec
// slide is Keynote's sNN.png, NN = i) and writes:
//   <out>/sNN.png       side by side, left to right: source | Keynote | where they differ (red)
//   <out>/flagged.png   every flagged slide on one sheet (source above, Keynote below)
//   <out>/report.json   per slide: scores, object counts, fonts Keynote used; flagged slides first
// Scores are the colour difference after a light blur, as a percentage (0 = identical):
//   score - the whole slide on average;   worst - the worst patch of a 48 x 27 grid (slides are flagged on this one:
//   a re-wrapped line barely moves the average but lights up its patch).
// It's a pointer, not a verdict: look at the side-by-side pictures of flagged slides, and spot-check others.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);

// Full HD by default, keeping the deck's aspect ratio. Contact sheets remain small;
// individual comparisons retain enough detail to inspect small text and thin strokes.
var W = 1920, H = 1080;
function blur(px) {  // two passes of a 3 x 3 box blur per channel ≈ a light Gaussian
  let a = px.rgb;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Uint8Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; s += a[(yy * W + xx) * 3 + c]; n++; } }
      b[(y * W + x) * 3 + c] = s / n;
    }
    a = b;
  }
  return a;
}
function diffMap(r, k) {
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = 0.299 * Math.abs(r[i * 3] - k[i * 3]) + 0.587 * Math.abs(r[i * 3 + 1] - k[i * 3 + 1]) + 0.114 * Math.abs(r[i * 3 + 2] - k[i * 3 + 2]);
  return d;
}
function stats(d) {
  let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i];
  const cols = Math.min(48, W), rows = Math.min(27, H);
  let worst = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x1 = Math.floor(i * W / cols), x2 = Math.floor((i + 1) * W / cols);
    const y1 = Math.floor(j * H / rows), y2 = Math.floor((j + 1) * H / rows);
    let s = 0; for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) s += d[y * W + x];
    worst = Math.max(worst, s / ((x2 - x1) * (y2 - y1)) / 255 * 100);
  }
  return { score: sum / d.length / 255 * 100, worst };
}
function paste(dst, dw, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const s = (y * sw + x) * 3, d = ((oy + y) * dw + ox + x) * 3; dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; }
}

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript compare.js <deck-spec.json> <keynote-png-dir> [--out DIR] [--flag 12] [--width 1920]';
  const specPath = abspath(argv[0]), kdir = abspath(argv[1]), base = dirname(specPath);
  const out = abspath(argOpt(argv, '--out', join(dirname(kdir), 'compare'))), flag = +argOpt(argv, '--flag', 12);
  const spec = readJSON(specPath), renderer = argOpt(argv, '--renderer', 'Keynote');
  if (!['Keynote', 'PowerPoint'].includes(renderer)) throw new Error('--renderer must be Keynote or PowerPoint');
  W = +argOpt(argv, '--width', 1920);
  if (!Number.isInteger(W) || W < 48 || W > 7680) throw new Error('--width must be an integer from 48 to 7680');
  H = Math.max(27, Math.round(W * (spec.height || 1080) / (spec.width || 1920)));
  const objsPath = join(dirname(kdir), renderer.toLowerCase() + '-objects.json'), objs = exists(objsPath) ? readJSON(objsPath) : {};
  mkdirp(out);
  const rows = [], pairs = [];
  spec.slides.forEach((s, idx) => {
    const i = idx + 1, kpath = join(kdir, 's' + String(i).padStart(2, '0') + '.png');
    const ko = objs[String(i)] || [];
    const row = { slide: i, source_n: s.n || i, spec_elements: (s.elements || []).length };
    row[renderer.toLowerCase() + '_objects'] = ko.length;
    row[renderer.toLowerCase() + '_fonts'] = [...new Set(ko.map(o => o.font).filter(Boolean))].sort();
    if (!exists(kpath)) { rows.push(Object.assign(row, { score: null, flagged: true, why: renderer + ' exported no picture for this slide' })); return; }
    if (!s.ref || !exists(join(base, s.ref))) { rows.push(Object.assign(row, { score: null, flagged: renderer === 'PowerPoint', why: 'no source picture to compare with' })); return; }
    row.source_resolution = imageSize(join(base, s.ref));
    row.output_resolution = imageSize(kpath);
    row.low_resolution = [row.source_resolution, row.output_resolution].some(sz => sz.w < W || sz.h < H);
    row.aspect_mismatch = [row.source_resolution, row.output_resolution].some(sz => Math.abs(sz.h - sz.w * H / W) > 1.5);
    const ref = loadPixels(join(base, s.ref), W, H), key = loadPixels(kpath, W, H);
    const d = diffMap(blur(ref), blur(key)), st = stats(d);
    // side by side: source | Keynote | diff (red where they differ, the Keynote picture faded underneath)
    const SW = W * 3 + 16, side = new Uint8Array(SW * H * 3).fill(255), heat = new Uint8Array(W * H * 3);
    for (let p = 0; p < W * H; p++) {
      if (d[p] > 24) { heat[p * 3] = 230; heat[p * 3 + 1] = 0; heat[p * 3 + 2] = 0; }
      else for (let c = 0; c < 3; c++) heat[p * 3 + c] = 150 + (key.rgb[p * 3 + c] / 3 | 0);
    }
    paste(side, SW, ref.rgb, W, H, 0, 0); paste(side, SW, key.rgb, W, H, W + 8, 0); paste(side, SW, heat, W, H, 2 * W + 16, 0);
    const pic = join(out, 's' + String(i).padStart(2, '0') + '.png');
    savePixels({ w: SW, h: H, rgb: side }, pic);
    Object.assign(row, { score: Math.round(st.score * 100) / 100, worst: round1(st.worst), flagged: st.worst > flag || (renderer === 'PowerPoint' && (row.low_resolution || row.aspect_mismatch)), picture: pic });
    if (ko.length && row.spec_elements && ko.length < row.spec_elements * 0.8) {
      row.flagged = true; row.why = `${renderer} has ${ko.length} objects, the spec ${row.spec_elements}: something was dropped`;
    }
    if (row.flagged) pairs.push([i, join(base, s.ref), kpath]);
    rows.push(row);
  });
  let sheet = null;
  if (pairs.length) {
    const tw = 320, th = Math.max(1, Math.round(tw * H / W)), cols = Math.min(4, pairs.length), rws = Math.ceil(pairs.length / cols), SW = cols * (tw + 8), SH = rws * (2 * th + 30);
    const img = new Uint8Array(SW * SH * 3).fill(255);
    pairs.forEach(([i, r, k], n) => {
      const x = (n % cols) * (tw + 8), y = Math.floor(n / cols) * (2 * th + 30);
      paste(img, SW, loadPixels(r, tw, th).rgb, tw, th, x, y); paste(img, SW, loadPixels(k, tw, th).rgb, tw, th, x, y + th + 2);
    });
    sheet = join(out, 'flagged.png'); savePixels({ w: SW, h: SH, rgb: img }, sheet);
  }
  rows.sort((a, b) => (b.flagged - a.flagged) || ((b.worst || 0) - (a.worst || 0)));
  const fontsUsed = [...new Set(rows.flatMap(r => r.keynote_fonts || r.powerpoint_fonts || []))].sort();
  const report = { renderer, slides: rows.length, flagged: rows.filter(r => r.flagged).map(r => r.slide), threshold: flag,
    comparison_resolution: { w: W, h: H }, low_resolution_slides: rows.filter(r => r.low_resolution).map(r => r.slide),
    fonts_keynote_used: fontsUsed, fonts_missing: fontsUsed.filter(f => !fontLoadable(f)), flagged_sheet: sheet, rows };
  if (renderer === 'PowerPoint') { report.fonts_powerpoint_used = report.fonts_keynote_used; delete report.fonts_keynote_used; }
  writeJSON(join(out, 'report.json'), report);
  const summary = Object.assign({}, report); delete summary.rows;
  summary.worst_slides = rows.slice(0, 8).map(r => Object.assign({ slide: r.slide, worst: r.worst, score: r.score }, r.why ? { why: r.why } : {}));
  return JSON.stringify(summary, null, 1);
}
