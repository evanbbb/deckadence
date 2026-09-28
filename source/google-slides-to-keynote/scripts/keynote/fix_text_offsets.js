// Line up text boxes with the source picture, using Keynote's own render.
//
//   osascript -l JavaScript fix_text_offsets.js <deck-spec.json> <keynote-png-dir> [--write] [--max 48]
//
// Different apps put the first line of a text box at slightly different heights (the font's ascent, tight line
// spacing), so a box in the right place can still show its text a few pixels too high or low. For each text element
// this compares the source picture (`ref`) with Keynote's export inside the element's box and finds the shift that
// lines them up best: a coarse search at half size, then a 1 px refinement. It only moves a box when the difference
// drops by at least 25 %, and never more than half the text size (small text "moving" far is a false match).
// Without --write it prints what it would move. With --write it updates the spec (keeping <spec>.before-offsets.json).
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);

function half(g, w, h) {
  const W = w >> 1, H = h >> 1, o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = 2 * y * w + 2 * x; o[y * W + x] = (g[i] + g[i + 1] + g[i + w] + g[i + w + 1]) / 4; }
  return { g: o, w: W, h: H };
}
// mean |ref - key shifted by (dx, dy)| over the part of the box both pictures have
function shifted(R, K, w, h, x1, y1, x2, y2, dx, dy) {
  const ax1 = Math.max(x1, dx, 0), ay1 = Math.max(y1, dy, 0), ax2 = Math.min(x2, w + dx, w), ay2 = Math.min(y2, h + dy, h);
  if (ax2 - ax1 < 4 || ay2 - ay1 < 3) return null;
  let s = 0;
  for (let y = ay1; y < ay2; y++) { const r = y * w, k = (y - dy) * w - dx; for (let x = ax1; x < ax2; x++) s += Math.abs(R[r + x] - K[k + x]); }
  return s / ((ax2 - ax1) * (ay2 - ay1));
}
function detail(g, w, x1, y1, x2, y2) {  // mean edge strength (Laplacian): is there anything text-like to match?
  let s = 0, n = 0;
  for (let y = Math.max(1, y1); y < y2 - 1; y++) for (let x = Math.max(1, x1); x < x2 - 1; x++) {
    const i = y * w + x;
    s += Math.min(255, Math.abs(8 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w] - g[i - w - 1] - g[i - w + 1] - g[i + w - 1] - g[i + w + 1])); n++;
  }
  return n ? s / n : 0;
}
function bestShift(ref, key, w, h, box, limit, refH, keyH) {
  let [x, y, bw, bh] = box;
  const x1 = Math.max(0, x - 8), y1 = Math.max(0, y), x2 = Math.min(w, x + bw + 8), y2 = Math.min(h, y + bh);
  if (x2 - x1 < 8 || y2 - y1 < 6) return null;
  if (detail(ref, w, x1, y1, x2, y2) < 1.5) return null;
  const base = shifted(ref, key, w, h, x1, y1, x2, y2, 0, 0);
  // coarse: half size, every half-size pixel = 2 px
  const L = Math.ceil(limit / 2);
  let best = { d: shifted(refH.g, keyH.g, refH.w, refH.h, x1 >> 1, y1 >> 1, x2 >> 1, y2 >> 1, 0, 0), dx: 0, dy: 0 };
  for (let dy = -L; dy <= L; dy++) for (let dx = -2; dx <= 2; dx++) {
    const d = shifted(refH.g, keyH.g, refH.w, refH.h, x1 >> 1, y1 >> 1, x2 >> 1, y2 >> 1, dx, dy);
    if (d != null && d < best.d) best = { d, dx, dy };
  }
  // fine: full size around the coarse answer
  let fine = { d: base, dx: 0, dy: 0 };
  for (let dy = 2 * best.dy - 2; dy <= 2 * best.dy + 2; dy++) for (let dx = 2 * best.dx - 2; dx <= 2 * best.dx + 2; dx++) {
    if (Math.abs(dy) > limit) continue;
    const d = shifted(ref, key, w, h, x1, y1, x2, y2, dx, dy);
    if (d != null && d < fine.d) fine = { d, dx, dy };
  }
  if ((fine.dx === 0 && fine.dy === 0) || fine.d > base * 0.75) return null;
  // ref[p] matches key[p - (dx, dy)]: Keynote draws the text (dx, dy) short of the source, so move the box by (dx, dy)
  return { dx: fine.dx, dy: fine.dy, before: Math.round(base * 100) / 100, after: Math.round(fine.d * 100) / 100 };
}

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript fix_text_offsets.js <deck-spec.json> <keynote-png-dir> [--write] [--max 48]';
  const specPath = abspath(argv[0]), kdir = abspath(argv[1]), write = argv.includes('--write'), maxd = +argOpt(argv, '--max', 48);
  const spec = readJSON(specPath), base = dirname(specPath), w = spec.width || 1920, h = spec.height || 1080;
  const moves = [];
  spec.slides.forEach((s, idx) => {
    const kpath = join(kdir, 's' + String(idx + 1).padStart(2, '0') + '.png');
    if (!s.ref || !exists(kpath) || !exists(join(base, s.ref))) return;
    const texts = (s.elements || []).map((el, k) => [el, k]).filter(([el]) => el.type === 'text');
    if (!texts.length) return;
    const ref = grayOf(loadPixels(join(base, s.ref), w, h)), key = grayOf(loadPixels(kpath, w, h));
    const refH = half(ref, w, h), keyH = half(key, w, h);
    for (const [el, k] of texts) {
      const sizes = (el.paragraphs || []).flatMap(p => (p.runs || []).map(r => r.size || 0));
      const size = Math.max(24, ...sizes);
      const limit = Math.floor(Math.min(Math.max(maxd, size * 0.4), Math.max(4, size * 0.5)));
      const m = bestShift(ref, key, w, h, [el.x, el.y, el.w, el.h].map(Math.round), limit, refH, keyH);
      if (!m) continue;
      const first = ((el.paragraphs || [])[0] || {}).runs || [];
      moves.push(Object.assign({ slide: idx + 1, element: k, text: first.map(r => r.text || '').join('').slice(0, 30).replace(/\v/g, ' '), size }, m));
      if (write) { el.x = round1(el.x + m.dx); el.y = round1(el.y + m.dy); }
    }
  });
  if (write && moves.length) { copyFile(specPath, specPath.replace(/\.json$/, '') + '.before-offsets.json'); writeJSON(specPath, spec); }
  return JSON.stringify({ [write ? 'moved' : 'would_move']: moves.length, moves }, null, 1);
}
