// Google Slides deck extractor. Run INSIDE a Google Slides editor tab (…/presentation/d/<id>/edit)
// with whatever browser tool is available (Claude in Chrome JS tool, gstack `browse eval`, Playwright evaluate, DevTools).
//
// It starts a background job and returns immediately. Poll `window.__EXTRACT.status` ('running' | 'done' | 'error')
// and `window.__EXTRACT.done / total`. When done it has:
//   window.__EXTRACT.files        [{name, size}]  — every extracted file (see layout below)
//   window.__EXTRACT_GET(i)       Promise<dataURL> for file i (pull files one by one, e.g. `browse js ... --out`)
//   window.__EXTRACT_ZIP()        Promise<string> — triggers ONE download "<deck>-extract.zip" into the user's Downloads
//   window.__EXTRACT_ZIP_DATAURL() Promise<dataURL> of the same ZIP (for tools that write a returned data URL to disk)
// Options (set before running): window.__EXTRACT_OPTS = { download: true, renders: true, refWidth: 1920, slides: [1,2,3] }
//   download: auto-download the ZIP when finished (default true — right for a user's own Chrome)
//   slides:   1-based slide numbers to extract (default all)
//
// File layout (same inside the ZIP):
//   deck.json                 {deckId, title, slideCount, youtube:[{id,url,obj,slide}], extractedAt}
//   manifest.json             [{n, page, notes, background, youtube:[obj], images:[...], texts:[...], shapes:[...]}]
//   ref/sNN.png               vector export rendered at 1920px wide; PNG fallback is flagged if smaller
//   media/sNN_K.<ext>         original image K of slide NN (png/jpg/gif/webp; up to 2048px long edge)
// All rects are normalized to 1920 pixels wide, preserving the source slide aspect ratio. images[].full = uncropped bounds, images[].vis = visible (cropped) area.
(() => {
  if (window.__EXTRACT && window.__EXTRACT.status === 'running') return 'already running: ' + window.__EXTRACT.done + '/' + window.__EXTRACT.total;
  const opts = Object.assign({ download: true, renders: true, refWidth: 1920, slides: null }, window.__EXTRACT_OPTS || {});
  const X = window.__EXTRACT = { status: 'running', done: 0, total: 0, files: [], warnings: [], error: null };
  const blobs = [];
  const add = (name, blob) => { blobs.push({ name, blob }); X.files.push({ name, size: blob.size }); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const deckId = location.pathname.split('/d/')[1].split('/')[0];
  const title = document.title.replace(/ - Google (Slides|Präsentationen|Presentaciones).*$/, '').trim();
  const pad = n => String(n).padStart(2, '0');
  const extOf = t => ({ 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[t] || 'bin';

  async function referenceImage(pid, n) {
    const width = Number(opts.refWidth);
    if (!Number.isInteger(width) || width < 48 || width > 7680) throw new Error('refWidth must be an integer from 48 to 7680');
    try {
      const response = await fetch('/presentation/d/' + deckId + '/export/svg?pageid=' + encodeURIComponent(pid));
      if (!response.ok) throw new Error('SVG export HTTP ' + response.status);
      let svg = await response.text();
      if (!/<svg\b/.test(svg)) throw new Error('invalid SVG export');
      // The Google editor enforces Trusted Types even for XML DOMParser.
      // Replace only image URI attributes in vendor-generated SVG text; no DOM injection.
      const images = svg.match(/<image\b[^>]*>/g) || [];
      const unescape = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n,16)));
      for (const tag of images) {
        let replacement = tag;
        for (const match of tag.matchAll(/(?:xlink:)?href=["']([^"']+)["']/g)) {
          const href = unescape(match[1]);
          if (href.startsWith('data:') || href.startsWith('#')) continue;
          const r = await fetch(new URL(href, response.url));
          if (!r.ok) throw new Error('SVG image HTTP ' + r.status);
          const imageBlob = await r.blob();
          const data = await new Promise((resolve, reject) => { const f = new FileReader(); f.onload = () => resolve(f.result); f.onerror = reject; f.readAsDataURL(imageBlob); });
          replacement = replacement.replace(match[0], match[0].replace(match[1], data));
        }
        svg = svg.replace(tag, replacement);
      }
      await document.fonts.ready;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('SVG render failed')); img.src = url; });
        const canvas = document.createElement('canvas'); canvas.width = width;
        const ratio = opts.sourceSize ? opts.sourceSize.heightIn / opts.sourceSize.widthIn : img.naturalHeight / img.naturalWidth;
        canvas.height = Math.round(width * ratio);
        if (!canvas.height) throw new Error('SVG has no dimensions');
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PNG encoding failed');
        return blob;
      } finally { URL.revokeObjectURL(url); }
    } catch (e) {
      X.warnings.push('render ' + n + ': high-resolution SVG unavailable (' + e.message + '); using PNG export');
      const r = await fetch('/presentation/d/' + deckId + '/export/png?pageid=' + encodeURIComponent(pid));
      if (!r.ok) throw new Error('PNG export HTTP ' + r.status);
      const blob = await r.blob(), bitmap = await createImageBitmap(blob);
      if (bitmap.width < width) X.warnings.push('render ' + n + ': source is only ' + bitmap.width + 'x' + bitmap.height + '; not upscaled');
      bitmap.close(); return blob;
    }
  }

  // The filmstrip (slide list) only renders thumbnails near the viewport, so scroll it top to bottom collecting ids.
  async function pageIds() {
    const seen = new Map();
    const collect = () => {
      for (const el of document.querySelectorAll('[id^="filmstrip-slide-"]')) {
        const m = el.id.match(/^filmstrip-slide-(\d+)-(.+)$/);
        if (m && !seen.has(+m[1])) seen.set(+m[1], m[2]);
      }
    };
    const fs = document.getElementById('filmstrip');
    const sc = (fs && [...fs.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 100)) || null;
    collect();
    if (sc) {
      sc.scrollTop = 0; await sleep(300); collect();
      for (let i = 0; i < 500 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2; i++) {
        sc.scrollTop += Math.max(100, sc.clientHeight * 0.7);
        await sleep(250); collect();
      }
      await sleep(400); collect();
      sc.scrollTop = 0;
    }
    const n = seen.size ? Math.max(...seen.keys()) + 1 : 0;
    if (seen.size !== n) X.warnings.push('slide list has gaps: found ' + seen.size + ' of ' + n);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  }

  function youtubeIds() {
    // Embedded YouTube videos are stored by their thumbnail URL (i.ytimg.com/vi/<id>/…), not by a youtube.com link.
    const h = document.documentElement.innerHTML;
    const ids = [...new Set((h.match(/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}/g) || []).map(s => s.slice(-11)))];
    return ids.map(id => {
      const i = h.indexOf('i.ytimg.com/vi/' + id);
      const m = h.slice(Math.max(0, i - 400), i).match(/"([A-Za-z0-9_]+)",\d+,\[/g);
      return { id, url: 'https://www.youtube.com/watch?v=' + id, obj: m ? m[m.length - 1].split('"')[1] : '', slide: null };
    });
  }

  async function waitForSlide(pid) {
    for (let t = 0; t < 40; t++) {
      await sleep(400);
      const pg = document.querySelector('[id="editor-' + pid + '"]');
      if (!pg) continue;
      const imgs = [...pg.querySelectorAll('image')];
      if (imgs.every(i => (i.getAttribute('href') || i.getAttribute('xlink:href') || '').startsWith('blob:') || i.getBoundingClientRect().width < 2)) { await sleep(600); return pg; }
    }
    return document.querySelector('[id="editor-' + pid + '"]');
  }

  function screenRect(el, bb) {
    const m = el.getScreenCTM();
    const pts = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  // The slide's own area. NOT pg.getBoundingClientRect(): that box grows to include anything that hangs off the
  // slide (a photo bleeding past the edge), which would shrink and shift every position on the slide.
  // The editor draws the slide background as its own element ("<pid>-bg", or the first path) at exactly slide size.
  function slideRect(pid, pg) {
    const bg = document.getElementById('editor-' + pid + '-bg') || pg.querySelector(':scope > path');
    const r = bg && bg.getBoundingClientRect();
    return r && r.width > 10 ? r : pg.getBoundingClientRect();
  }

  async function extractSlide(n, pid, pg) {
    const pr = slideRect(pid, pg);
    const s = 1920 / pr.width;
    const rel = r => ({ x: Math.round((r.x - pr.x) * s), y: Math.round((r.y - pr.y) * s), w: Math.round(r.width * s), h: Math.round(r.height * s) });
    const objOf = el => { const o = el.closest('[id^="editor-"]:not([id="editor-' + pid + '"])'); return o ? o.id.replace('editor-', '').replace(/-paragraph-\d+$/, '') : ''; };
    const slide = { n, page: pid, width: 1920, height: Math.round(opts.sourceSize ? 1920 * opts.sourceSize.heightIn / opts.sourceSize.widthIn : pr.height * s), notes: '', background: null, artwork: [], sourceErrors: [], youtube: [], images: [], texts: [], shapes: [] };
    // z: drawing order (document order = back to front), so the builder can stack images, shapes and text correctly
    const zOf = new Map(); { let i = 0; for (const e of pg.querySelectorAll('*')) zOf.set(e, i++); }
    const toSlide = (x, y) => ({ x: Math.round((x - pr.x) * s * 10) / 10, y: Math.round((y - pr.y) * s * 10) / 10 });

    // images
    let k = 0;
    for (const img of pg.querySelectorAll('image')) {
      const ir = img.getBoundingClientRect();
      if (ir.width < 2 || ir.height < 2) continue;
      const href = img.getAttribute('href') || img.getAttribute('xlink:href');
      const clipEl = img.hasAttribute('clip-path') ? img : (img.parentElement.hasAttribute('clip-path') ? img.parentElement : null);
      let vis = { x: ir.x, y: ir.y, width: ir.width, height: ir.height };
      if (clipEl) {
        const id = (clipEl.getAttribute('clip-path').match(/#([^)"']+)/) || [])[1];
        const shape = id && document.getElementById(id) && document.getElementById(id).firstElementChild;
        if (shape && shape.getBBox) {
          const cr = screenRect(clipEl, shape.getBBox());
          const x1 = Math.max(cr.x, ir.x), y1 = Math.max(cr.y, ir.y), x2 = Math.min(cr.x + cr.width, ir.x + ir.width), y2 = Math.min(cr.y + cr.height, ir.y + ir.height);
          if (x2 > x1 && y2 > y1) vis = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }
      }
      const rec = { k, obj: objOf(img), z: zOf.get(img), type: '', natW: 0, natH: 0, file: '', full: rel(ir), vis: rel(vis), opacity: +(getComputedStyle(img).opacity || 1) };
      // mirrored images (negative scale in the drawing transform)
      const im = img.getScreenCTM();
      if (im && im.a < 0) rec.flipH = true;
      if (im && im.d < 0) rec.flipV = true;
      // cropped to a shape (circle, rounded box, …): keep its outline so the picture can be masked the same way
      if (clipEl) {
        const cid = (clipEl.getAttribute('clip-path').match(/#([^)"']+)/) || [])[1];
        const shape = cid && document.getElementById(cid) && document.getElementById(cid).firstElementChild;
        if (shape && shape.tagName === 'path') { const poly = tracePath(shape, toSlide, clipEl.getScreenCTM()); if (poly) rec.mask = poly; }
        else if (shape && (shape.tagName === 'ellipse' || shape.tagName === 'circle')) {
          const b = screenRect(clipEl, shape.getBBox()), t = toSlide(b.x, b.y), e = toSlide(b.x + b.width, b.y + b.height);
          rec.mask = 'ellipse ' + [t.x, t.y, e.x - t.x, e.y - t.y].join(' ');
        }
      }
      try {
        const blob = await (await fetch(href)).blob();
        rec.type = blob.type;
        const bmp = await createImageBitmap(blob).catch(() => null);
        if (bmp) { rec.natW = bmp.width; rec.natH = bmp.height; }
        rec.file = 'media/s' + pad(n) + '_' + k + '.' + extOf(blob.type);
        add(rec.file, blob);
      } catch (e) { rec.type = 'ERR ' + e.message; X.warnings.push('slide ' + n + ' image ' + k + ': ' + e.message); }
      slide.images.push(rec); k++;
    }

    // text boxes: words are separate <text> nodes; group into paragraphs, paragraphs into boxes (one per slide object)
    const paras = new Map();
    for (const t of pg.querySelectorAll('text')) {
      const r = t.getBoundingClientRect();
      if (r.width < 1 || !t.textContent.trim()) continue;
      const holder = t.closest('[id*="-paragraph-"]');
      const key = holder ? holder.id : 'misc-' + objOf(t);
      const cs = getComputedStyle(t);
      const m = t.getScreenCTM();
      const fsUser = parseFloat(t.getAttribute('font-size') || cs.fontSize) || 0;
      const run = {
        text: t.textContent, r, z: zOf.get(t), x: Math.round((r.x - pr.x) * s), y: Math.round((r.y - pr.y) * s), w: Math.round(r.width * s),
        font: (t.getAttribute('font-family') || cs.fontFamily).replace(/^"?docs-/, '').replace(/"/g, ''),
        size: Math.round(fsUser * (m ? Math.hypot(m.a, m.b) : 1) * s * 10) / 10,
        weight: +(t.getAttribute('font-weight') || cs.fontWeight) || 400,
        italic: (t.getAttribute('font-style') || cs.fontStyle) === 'italic',
        color: t.getAttribute('fill') || cs.fill,
      };
      try {
        const p = t.getStartPositionOfChar(0);
        if (m) run.baseline = Math.round((m.b * p.x + m.d * p.y + m.f - pr.y) * s * 10) / 10;
      } catch (_) { /* Older editor SVGs may not expose character positions. */ }
      if (!paras.has(key)) paras.set(key, []);
      paras.get(key).push(run);
    }
    const boxes = new Map();
    for (const [key, runs] of paras) {
      const obj = key.replace(/^editor-/, '').replace(/-paragraph-\d+$/, '');
      const x1 = Math.min(...runs.map(r => r.r.x)), y1 = Math.min(...runs.map(r => r.r.y));
      const x2 = Math.max(...runs.map(r => r.r.x + r.r.width)), y2 = Math.max(...runs.map(r => r.r.y + r.r.height));
      const para = { text: runs.map(r => r.text).join(' ').replace(/\s+/g, ' ').trim(), rect: rel({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }),
        runs: runs.map(({ r, z, ...rest }) => rest), z: Math.min(...runs.map(r => r.z)) };
      if (!boxes.has(obj)) boxes.set(obj, []);
      boxes.get(obj).push(para);
    }
    for (const [obj, ps] of boxes) {
      const xs = ps.map(p => p.rect.x), ys = ps.map(p => p.rect.y);
      const x2 = Math.max(...ps.map(p => p.rect.x + p.rect.w)), y2 = Math.max(...ps.map(p => p.rect.y + p.rect.h));
      const first = ps[0].runs[0] || {};
      slide.texts.push({ obj, z: Math.min(...ps.map(p => p.z)), text: ps.map(p => p.text).join('\n'), rect: { x: Math.min(...xs), y: Math.min(...ys), w: x2 - Math.min(...xs), h: y2 - Math.min(...ys) },
        font: first.font, size: first.size, weight: first.weight, italic: first.italic, color: first.color, paragraphs: ps });
    }

    // filled shapes (backgrounds, boxes, lines). Best effort: bounding box + fill/stroke.
    for (const el of pg.querySelectorAll('path, rect, ellipse, circle, line, polygon')) {
      if (el.closest('clipPath, defs, text')) continue;
      const r = el.getBoundingClientRect();
      if (r.width * s < 4 && r.height * s < 4) continue;
      // The editor also draws invisible hit-areas / selection outlines: skip anything whose own or inherited opacity is 0,
      // and fills/strokes whose fill-opacity / stroke-opacity is 0.
      let op = 1, hidden = false;
      for (let e = el; e && e !== pg; e = e.parentElement) { const c = getComputedStyle(e); op *= +c.opacity; if (c.visibility === 'hidden' || c.display === 'none') hidden = true; }
      if (hidden || op < 0.01) continue;
      const cs = getComputedStyle(el);
      const fill = el.getAttribute('fill') || cs.fill, stroke = el.getAttribute('stroke') || cs.stroke;
      const fillOp = +(el.getAttribute('fill-opacity') ?? 1), strokeOp = +(el.getAttribute('stroke-opacity') ?? 1);
      const m = el.getScreenCTM(); const sw = (parseFloat(el.getAttribute('stroke-width') || cs.strokeWidth) || 0) * (m ? Math.hypot(m.a, m.b) : 1) * s;
      const hasFill = fill && fill !== 'none' && fillOp > 0.01 && !/rgba\(0, 0, 0, 0\)|transparent/.test(fill);
      const hasStroke = stroke && stroke !== 'none' && strokeOp > 0.01 && sw > 0 && sw < 60;
      if (!hasFill && !hasStroke) continue;
      const rec = { sourceId: pid + ':' + (objOf(el) || el.id || 'art-' + zOf.get(el)), obj: objOf(el), z: zOf.get(el), tag: el.tagName, rect: rel(r), fill: hasFill ? fill : null, fillOpacity: Math.round(fillOp * op * 100) / 100,
        stroke: hasStroke ? stroke : null, strokeWidth: hasStroke ? Math.round(sw * 10) / 10 : 0 };
      if (el.tagName === 'rect' && +el.getAttribute('rx')) rec.radius = +el.getAttribute('rx') * (m ? Math.hypot(m.a, m.b) : 1) * s;
      // Anything that isn't a plain rectangle (rounded boxes, arrows, blobs): trace its outline in slide coordinates
      if (el.tagName === 'path') { const poly = tracePath(el, toSlide); if (poly) rec.path = poly; }
      // full-slide fills: the last one in DOM order is on top, so it is the visible background
      if (rec.fill && rec.fillOpacity > 0.5 && rec.rect.w >= slide.width - 20 && rec.rect.h >= slide.height - 20) { slide.background = rec.fill; continue; }
      if (slide.shapes.length < 300) slide.shapes.push(rec);
      else if (!slide.sourceErrors.length) { slide.sourceErrors.push('shape limit reached; source extraction is incomplete'); X.warnings.push('slide ' + n + ': shape limit reached'); }
    }

    // Retain unsupported paint/compositing as reviewable reconstruction work.
    // A bounding-box approximation must not silently discard a paint server or effect.
    const artworkSeen = new Set();
    for (const el of pg.querySelectorAll('g, path, rect, ellipse, circle, polygon, image, text')) {
      if (el.closest('clipPath, defs')) continue;
      const cs = getComputedStyle(el), reasons = [];
      if (/url\(/.test(cs.fill || '') || /url\(/.test(cs.stroke || '')) reasons.push('gradient or pattern paint');
      if (cs.filter && cs.filter !== 'none') reasons.push('filter or shadow');
      if (opts.exactPaths && el.tagName === 'path' && !exactPath(el.getAttribute('d') || '', el.getScreenCTM(), toSlide)) reasons.push('sampled path needs editable reconstruction/check');
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') reasons.push('blend mode');
      if (el.tagName === 'g' && +cs.opacity < 0.999 && +cs.opacity > 0) reasons.push('group opacity');
      const m = el.getScreenCTM?.();
      if (['rect','ellipse','circle'].includes(el.tagName) && m && (Math.abs(m.b) > 0.001 || Math.abs(m.c) > 0.001)) reasons.push('transformed geometry');
      if (!reasons.length) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const obj = objOf(el), id = pid + ':' + (obj || el.id || 'art-' + zOf.get(el));
      if (artworkSeen.has(id)) continue;
      artworkSeen.add(id);
      const definitions = [cs.fill, cs.stroke, cs.filter].flatMap(v => { const id = (v || '').match(/#([^\)\"']+)/)?.[1]; const def = id ? document.getElementById(id) : null; return def ? [def.outerHTML] : []; });
      slide.artwork.push({ id, obj, why: reasons, rect: rel(r), z: zOf.get(el), source: el.outerHTML, definitions,
        computedStyle: {fill:cs.fill,stroke:cs.stroke,filter:cs.filter,mixBlendMode:cs.mixBlendMode,opacity:cs.opacity} });
      X.warnings.push('slide ' + n + ': artwork ' + id + ' needs editable reconstruction/check (' + reasons.join(', ') + ')');
    }

    // speaker notes (visible panel for the current slide; best effort)
    const notesEl = document.querySelector('#speakernotes-workspace, [id^="speakernotes"] .punch-viewer-speakernotes-text-body-scrollable, [id^="speakernotes"]');
    if (notesEl) slide.notes = notesEl.innerText.replace(/Click to add speaker notes/i, '').trim();
    return slide;
  }

  // Preserve native Bezier geometry, including relative and shorthand commands.
  // Arcs remain explicitly flagged for reconstruction rather than silently mangled.
  function exactPath(d, m, toSlide) {
    if (!m) return null;
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
    let at = 0, command = '', x = 0, y = 0, sx = 0, sy = 0, previous = '', control = null;
    const out = [], arity = {M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2};
    const point = (a,b) => { const p=toSlide(m.a*a+m.c*b+m.e,m.b*a+m.d*b+m.f); return p.x+' '+p.y; };
    while (at < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[at])) command = tokens[at++];
      const kind = command.toUpperCase(), relative = command !== kind;
      if (kind === 'Z') { out.push('Z'); x=sx; y=sy; previous='Z'; control=null; command=''; continue; }
      const n=arity[kind]; if (!n || at+n > tokens.length) return null;
      const values=tokens.slice(at,at+n).map(Number); if (!values.every(Number.isFinite)) return null;
      at+=n;
      const pair=i=>[values[i]+(relative?x:0),values[i+1]+(relative?y:0)];
      let end, curves=[];
      if (kind==='H') end=[values[0]+(relative?x:0),y];
      else if (kind==='V') end=[x,values[0]+(relative?y:0)];
      else if (kind==='C') { curves=[pair(0),pair(2)]; end=pair(4); }
      else if (kind==='S') { curves=[['C','S'].includes(previous)&&control?[2*x-control[0],2*y-control[1]]:[x,y],pair(0)]; end=pair(2); }
      else if (kind==='Q') { curves=[pair(0)]; end=pair(2); }
      else if (kind==='T') { curves=[['Q','T'].includes(previous)&&control?[2*x-control[0],2*y-control[1]]:[x,y]]; end=pair(0); }
      else end=pair(0);
      const outputKind=kind==='M'?'M':curves.length===2?'C':curves.length===1?'Q':'L';
      out.push(outputKind+' '+[...curves,end].map(p=>point(...p)).join(' '));
      if(kind==='M') { sx=end[0]; sy=end[1]; command=relative?'l':'L'; }
      previous=kind; control=curves.length?curves[curves.length-1]:null; [x,y]=end;
    }
    return out.length?out.join(' '):null;
  }

  // Outline of an SVG path as absolute "M x y L … Z" in slide px. Plain axis-aligned rectangles return null (drawn as boxes).
  // Curves are sampled into short straight segments, one sub-path at a time.
  // ctm: for shapes inside a <clipPath>, pass the clipped element's transform (the clip shape itself isn't drawn)
  function tracePath(el, toSlide, ctm) {
    const d = el.getAttribute('d') || '';
    const subs = d.match(/[Mm][^Mm]*/g) || [];
    if (!subs.length) return null;
    const plain = subs.length === 1 && !/[CcQqAaSsTt]/.test(d) && (d.match(/-?\d*\.?\d+(e-?\d+)?/g) || []).length <= 12;
    const m = ctm || el.getScreenCTM(); if (!m) return null;
    if (ctm && plain) return null;  // a rectangular crop is already handled by the crop itself
    if (opts.exactPaths) { const exact=exactPath(d,m,toSlide); if(exact) return exact; }
    const ns = 'http://www.w3.org/2000/svg', tmp = document.createElementNS(ns, 'path');
    el.parentNode.appendChild(tmp);
    const out = [];
    try {
      for (const sub of subs) {
        tmp.setAttribute('d', sub);
        const len = tmp.getTotalLength(); if (!(len > 0)) continue;
        const n = Math.max(8, Math.min(160, Math.round(len * Math.hypot(m.a, m.b) / 3)));
        const pts = [];
        for (let i = 0; i <= n; i++) { const p = tmp.getPointAtLength(len * i / n); const q = new DOMPoint(p.x, p.y).matrixTransform(m); const v = toSlide(q.x, q.y); pts.push(v.x + ' ' + v.y); }
        out.push('M ' + pts[0] + ' L ' + pts.slice(1).join(' L ') + (/[Zz]\s*$/.test(sub) ? ' Z' : ''));
      }
    } finally { tmp.remove(); }
    if (!out.length) return null;
    if (plain) {
      // four corners on the rectangle's own box: no need for an outline
      const r = el.getBoundingClientRect(), box = [toSlide(r.x, r.y), toSlide(r.x + r.width, r.y + r.height)];
      const nums = out.join(' ').match(/-?\d+(\.\d+)?/g).map(Number);
      const near = (v, a, b) => Math.min(Math.abs(v - a), Math.abs(v - b)) < 1.5;
      let onEdge = true;
      for (let i = 0; i + 1 < nums.length; i += 2) if (!near(nums[i], box[0].x, box[1].x) && !near(nums[i + 1], box[0].y, box[1].y)) { onEdge = false; break; }
      if (onEdge) return null;
    }
    return out.join(' ');
  }

  // table-based CRC32 + store-only ZIP (no compression) so no external library is needed
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function buildZip() {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    for (const { name, blob } of blobs) {
      const data = new Uint8Array(await blob.arrayBuffer()), nm = enc.encode(name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(lh, nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(ch, nm);
      offset += 30 + nm.length + data.length;
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, blobs.length, true); end.setUint16(10, blobs.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  window.__EXTRACT_GET = i => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blobs[i].blob); });
  // For tools that can write a returned data URL straight to disk (e.g. `browse js "window.__EXTRACT_ZIP_DATAURL()" --out deck.zip`).
  window.__EXTRACT_ZIP_DATAURL = async () => { const zip = await buildZip(); return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(zip); }); };
  window.__EXTRACT_ZIP = async () => {
    const zip = await buildZip();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = (title || deckId).replace(/[^\w.-]+/g, '_').slice(0, 80) + '-extract.zip';
    document.body.appendChild(a); a.click(); a.remove();
    return a.download + ' (' + Math.round(zip.size / 1e6) + ' MB)';
  };

  (async () => {
    try {
      const all = await pageIds();
      if (!all.length) throw new Error('No slides found — is this the Google Slides editor (/edit) and fully loaded?');
      const wanted = opts.slides ? opts.slides : all.map((_, i) => i + 1);
      X.total = wanted.length;
      const yt = youtubeIds();
      const manifest = [];
      for (const n of wanted) {
        const pid = all[n - 1];
        location.hash = 'slide=id.' + pid;
        const pg = await waitForSlide(pid);
        if (!pg) { X.warnings.push('slide ' + n + ' did not render'); X.done++; continue; }
        const slide = await extractSlide(n, pid, pg);
        for (const v of yt) if (v.obj && pg.querySelector('[id="editor-' + v.obj + '"]')) { v.slide = n; slide.youtube.push(v.obj); }
        if (opts.renders) {
          try { add('ref/s' + pad(n) + '.png', await referenceImage(pid, n)); }
          catch (e) { X.warnings.push('render ' + n + ': ' + e.message); }
        }
        manifest.push(slide);
        X.done++;
      }
      add('manifest.json', new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }));
      add('deck.json', new Blob([JSON.stringify({ deckId, title, url: location.origin + '/presentation/d/' + deckId + '/edit', slideCount: all.length, requestedSlides: wanted, physicalSize: opts.sourceSize || null, youtube: yt, warnings: X.warnings, extractedAt: new Date().toISOString() }, null, 1)], { type: 'application/json' }));
      X.status = 'done';
      if (opts.download) X.zip = await window.__EXTRACT_ZIP();
    } catch (e) { X.status = 'error'; X.error = e.message; }
  })();
  return 'started';
})()
