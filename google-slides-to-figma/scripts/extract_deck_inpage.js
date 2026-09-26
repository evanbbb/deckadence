// Google Slides deck extractor. Run INSIDE a Google Slides editor tab (…/presentation/d/<id>/edit)
// with whatever browser tool is available (Claude in Chrome JS tool, gstack `browse eval`, Playwright evaluate, DevTools).
//
// It starts a background job and returns immediately. Poll `window.__EXTRACT.status` ('running' | 'done' | 'error')
// and `window.__EXTRACT.done / total`. When done it has:
//   window.__EXTRACT.files        [{name, size}]  — every extracted file (see layout below)
//   window.__EXTRACT_GET(i)       Promise<dataURL> for file i (pull files one by one, e.g. `browse js ... --out`)
//   window.__EXTRACT_ZIP()        Promise<string> — triggers ONE download "<deck>-extract.zip" into the user's Downloads
//   window.__EXTRACT_ZIP_DATAURL() Promise<dataURL> of the same ZIP (for tools that write a returned data URL to disk)
// Options (set before running): window.__EXTRACT_OPTS = { download: true, renders: true, slides: [1,2,3] }
//   download: auto-download the ZIP when finished (default true — right for a user's own Chrome)
//   slides:   1-based slide numbers to extract (default all)
//
// File layout (same inside the ZIP):
//   deck.json                 {deckId, title, slideCount, youtube:[{id,url,obj,slide}], extractedAt}
//   manifest.json             [{n, page, notes, background, youtube:[obj], images:[...], texts:[...], shapes:[...]}]
//   ref/sNN.png               960x540 render of each slide (what it looks like in Slides)
//   media/sNN_K.<ext>         original image K of slide NN (png/jpg/gif/webp; up to 2048px long edge)
// All rects are in 1920x1080 slide coordinates. images[].full = uncropped bounds, images[].vis = visible (cropped) area.
(() => {
  if (window.__EXTRACT && window.__EXTRACT.status === 'running') return 'already running: ' + window.__EXTRACT.done + '/' + window.__EXTRACT.total;
  const opts = Object.assign({ download: true, renders: true, slides: null }, window.__EXTRACT_OPTS || {});
  const X = window.__EXTRACT = { status: 'running', done: 0, total: 0, files: [], warnings: [], error: null };
  const blobs = [];
  const add = (name, blob) => { blobs.push({ name, blob }); X.files.push({ name, size: blob.size }); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const deckId = location.pathname.split('/d/')[1].split('/')[0];
  const title = document.title.replace(/ - Google (Slides|Präsentationen|Presentaciones).*$/, '').trim();
  const pad = n => String(n).padStart(2, '0');
  const extOf = t => ({ 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[t] || 'bin';

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

  async function extractSlide(n, pid, pg) {
    const pr = pg.getBoundingClientRect();
    const s = 1920 / pr.width;
    const rel = r => ({ x: Math.round((r.x - pr.x) * s), y: Math.round((r.y - pr.y) * s), w: Math.round(r.width * s), h: Math.round(r.height * s) });
    const objOf = el => { const o = el.closest('[id^="editor-"]:not([id="editor-' + pid + '"])'); return o ? o.id.replace('editor-', '').replace(/-paragraph-\d+$/, '') : ''; };
    const slide = { n, page: pid, notes: '', background: null, youtube: [], images: [], texts: [], shapes: [] };

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
      const rec = { k, obj: objOf(img), type: '', natW: 0, natH: 0, file: '', full: rel(ir), vis: rel(vis), opacity: +(getComputedStyle(img).opacity || 1) };
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
        text: t.textContent, r,
        font: (t.getAttribute('font-family') || cs.fontFamily).replace(/^"?docs-/, '').replace(/"/g, ''),
        size: Math.round(fsUser * (m ? Math.hypot(m.a, m.b) : 1) * s * 10) / 10,
        weight: +(t.getAttribute('font-weight') || cs.fontWeight) || 400,
        italic: (t.getAttribute('font-style') || cs.fontStyle) === 'italic',
        color: t.getAttribute('fill') || cs.fill,
      };
      if (!paras.has(key)) paras.set(key, []);
      paras.get(key).push(run);
    }
    const boxes = new Map();
    for (const [key, runs] of paras) {
      const obj = key.replace(/^editor-/, '').replace(/-paragraph-\d+$/, '');
      const x1 = Math.min(...runs.map(r => r.r.x)), y1 = Math.min(...runs.map(r => r.r.y));
      const x2 = Math.max(...runs.map(r => r.r.x + r.r.width)), y2 = Math.max(...runs.map(r => r.r.y + r.r.height));
      const para = { text: runs.map(r => r.text).join(' ').replace(/\s+/g, ' ').trim(), rect: rel({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }),
        runs: runs.map(({ r, ...rest }) => rest) };
      if (!boxes.has(obj)) boxes.set(obj, []);
      boxes.get(obj).push(para);
    }
    for (const [obj, ps] of boxes) {
      const xs = ps.map(p => p.rect.x), ys = ps.map(p => p.rect.y);
      const x2 = Math.max(...ps.map(p => p.rect.x + p.rect.w)), y2 = Math.max(...ps.map(p => p.rect.y + p.rect.h));
      const first = ps[0].runs[0] || {};
      slide.texts.push({ obj, text: ps.map(p => p.text).join('\n'), rect: { x: Math.min(...xs), y: Math.min(...ys), w: x2 - Math.min(...xs), h: y2 - Math.min(...ys) },
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
      const rec = { obj: objOf(el), tag: el.tagName, rect: rel(r), fill: hasFill ? fill : null, fillOpacity: Math.round(fillOp * op * 100) / 100,
        stroke: hasStroke ? stroke : null, strokeWidth: hasStroke ? Math.round(sw * 10) / 10 : 0 };
      // full-slide fills: the last one in DOM order is on top, so it is the visible background
      if (rec.fill && rec.fillOpacity > 0.5 && rec.rect.w >= 1900 && rec.rect.h >= 1060) { slide.background = rec.fill; continue; }
      if (slide.shapes.length < 300) slide.shapes.push(rec);
    }

    // speaker notes (visible panel for the current slide; best effort)
    const notesEl = document.querySelector('#speakernotes-workspace, [id^="speakernotes"] .punch-viewer-speakernotes-text-body-scrollable, [id^="speakernotes"]');
    if (notesEl) slide.notes = notesEl.innerText.replace(/Click to add speaker notes/i, '').trim();
    return slide;
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
          try { add('ref/s' + pad(n) + '.png', await (await fetch('/presentation/d/' + deckId + '/export/png?pageid=' + pid)).blob()); }
          catch (e) { X.warnings.push('render ' + n + ': ' + e.message); }
        }
        manifest.push(slide);
        X.done++;
      }
      add('manifest.json', new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }));
      add('deck.json', new Blob([JSON.stringify({ deckId, title, url: location.origin + '/presentation/d/' + deckId + '/edit', slideCount: all.length, youtube: yt, warnings: X.warnings, extractedAt: new Date().toISOString() }, null, 1)], { type: 'application/json' }));
      X.status = 'done';
      if (opts.download) X.zip = await window.__EXTRACT_ZIP();
    } catch (e) { X.status = 'error'; X.error = e.message; }
  })();
  return 'started';
})()
