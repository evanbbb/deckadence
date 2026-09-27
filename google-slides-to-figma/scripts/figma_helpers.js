// Figma helpers for building slides with the use_figma tool (Figma Plugin API).
// Paste this whole file at the top of every build script, AFTER defining PAGE_ID and CFG:
//
//   const PAGE_ID = '123:45';               // the lesson's page (create pages in a separate call)
//   const CFG = {
//     // Local text style NAMES in the Figma file for each role. Leave a role out (or the whole object empty) to use fallbacks.
//     textStyles: { h1:'Header 1', h2:'Header 2', h3:'Header 3', h5:'Header 5', b1:'Body 1', b2:'Body 2', bL:'Body Large', lab:'Label 1', code:'code' },
//     // Fallback font + sizes when a text style is missing (always used in verbatim mode for unknown fonts)
//     font: { family:'Inter', regular:'Regular', bold:'Bold', italic:'Italic' },
//     sizes: { h1:200, h2:96, h3:60, h5:32, b1:40, b2:32, bL:60, lab:24, code:28 },
//     // Colour roles: paint style NAME or hex. bg* are slide backgrounds.
//     colors: { bgTitle:'#000000', bgSection:'#E5E5E5', bgContent:'#FFFFFF', text:'#000000', textOnDark:'#FFFFFF', muted:'#9A9A9A', accent:'#2F5BFF' },
//     label: 'Course name',                   // small running label top-left of content slides; null for none
//     grid: { w:1920, h:1080, stepX:2070, stepY:1480 },
//   };
//
// Every helper returns the node it made. At the end of each script: return { created, imgs };
// `imgs` is a list of [nodeId, mediaFile] pairs to feed upload_assets (nodeIds in the same order) + upload.sh.

const _TS = {}; for (const s of await figma.getLocalTextStylesAsync()) _TS[s.name] = s;
const _PS = {}; for (const s of await figma.getLocalPaintStylesAsync()) _PS[s.name] = s;
const _FONTS = new Set((await figma.listAvailableFontsAsync()).map(f => f.fontName.family + '|' + f.fontName.style));
for (const s of Object.values(_TS)) { try { await figma.loadFontAsync(s.fontName); } catch (e) {} }
const F = CFG.font || { family: 'Inter', regular: 'Regular', bold: 'Bold', italic: 'Italic' };
for (const st of [F.regular, F.bold, F.italic]) { try { await figma.loadFontAsync({ family: F.family, style: st }); } catch (e) {} }
const page = await figma.getNodeByIdAsync(PAGE_ID);
await figma.setCurrentPageAsync(page);
const created = [], imgs = [];
const G = Object.assign({ w: 1920, h: 1080, stepX: 2070, stepY: 1480 }, CFG.grid || {});

function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 }; }
function cssToRgb(c) { if (!c) return null; if (c[0] === '#') return hexToRgb(c); const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/); return m ? { r: m[1] / 255, g: m[2] / 255, b: m[3] / 255 } : null; }
// apply a colour role, paint-style name, or raw colour to a node's fills (or strokes)
async function paint(node, role, prop = 'fills') {
  const v = (CFG.colors || {})[role] || role;
  if (_PS[v]) { prop === 'fills' ? await node.setFillStyleIdAsync(_PS[v].id) : await node.setStrokeStyleIdAsync(_PS[v].id); return; }
  const rgb = cssToRgb(v); if (rgb) node[prop] = [{ type: 'SOLID', color: rgb }];
}

// A slide frame at grid column c, row r. bg = colour role (bgTitle | bgSection | bgContent) or colour.
async function frame(name, c, r, bg = 'bgContent') {
  const f = figma.createFrame(); f.name = name; f.resize(G.w, G.h); f.x = c * G.stepX; f.y = r * G.stepY;
  await paint(f, bg); f.clipsContent = true; page.appendChild(f); created.push(f.id); return f;
}

// Text in a role (h1,h2,h3,h5,b1,b2,bL,lab,code). o: {h, ha, va, color, accent:[substrings], list:[[firstLine,lastLine]], link:url, links:[[substring,url]]}
async function text(p, name, chars, role, x, y, w, o = {}) {
  const t = figma.createText(); p.appendChild(t);
  const styleName = (CFG.textStyles || {})[role];
  if (styleName && _TS[styleName]) await t.setTextStyleIdAsync(_TS[styleName].id);
  else { t.fontName = { family: F.family, style: /^h/.test(role) && role !== 'h1' ? F.bold : F.regular }; t.fontSize = (CFG.sizes || {})[role] || 40; }
  t.characters = chars; t.name = name; t.x = x; t.y = y;
  if (o.h) { t.textAutoResize = 'NONE'; t.resize(w, o.h); } else { t.textAutoResize = 'HEIGHT'; t.resize(w, t.height); }
  await paint(t, o.color || 'text');
  if (o.ha) t.textAlignHorizontal = o.ha; if (o.va) t.textAlignVertical = o.va;
  for (const b of o.accent || []) { const i = chars.indexOf(b); if (i >= 0) { const v = (CFG.colors || {}).accent; if (_PS[v]) await t.setRangeFillStyleIdAsync(i, i + b.length, _PS[v].id); else t.setRangeFills(i, i + b.length, [{ type: 'SOLID', color: cssToRgb(v) }]); } }
  for (const [a, b] of o.list || []) { const i = chars.indexOf(a), j = chars.indexOf(b) + b.length; if (i >= 0 && j > i) t.setRangeListOptions(i, j, { type: 'UNORDERED' }); }
  for (const [s, u] of (o.links || []).concat(o.link ? [[o.link, o.link]] : [])) { const i = chars.indexOf(s); if (i >= 0) t.setRangeHyperlink(i, i + s.length, { type: 'URL', value: u }); }
  return t;
}
async function label(p) { return CFG.label ? text(p, 'heading label', CFG.label, 'lab', 60, 60, 600, { color: 'muted' }) : null; }
async function outline(p, name, x, y, w, h) { const r = figma.createRectangle(); p.appendChild(r); r.name = name; r.x = x; r.y = y; r.resize(w, h); r.fills = []; await paint(r, 'muted', 'strokes'); r.strokeWeight = 2; r.strokeAlign = 'INSIDE'; return r; }

// Image placeholder (grey) named after its media file; filled later by upload_assets + upload.sh.
function img(p, file, x, y, w, h) { const r = figma.createRectangle(); p.appendChild(r); r.name = file; r.x = Math.round(x); r.y = Math.round(y); r.resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); r.fills = [{ type: 'SOLID', color: { r: .93, g: .93, b: .93 } }]; imgs.push([r.id, file]); return r; }
// Fit an image of natural size nw x nh inside a box, centred, keeping its aspect ratio.
function imgFit(p, file, nw, nh, bx, by, bw, bh) { const s = Math.min(bw / nw, bh / nh); return img(p, file, bx + (bw - nw * s) / 2, by + (bh - nh * s) / 2, nw * s, nh * s); }

// Drop-zone for a file too big for the MCP upload (prepare_deck.py marked it "manual"): a dashed box that says which
// file to drag in by hand. Named "DRAG IN: <file>" so it's easy to find with Figma's layer search.
async function dropZone(p, fileName, x, y, w, h) {
  const z = figma.createFrame(); p.appendChild(z); z.name = 'DRAG IN: ' + fileName;
  z.layoutMode = 'VERTICAL'; z.primaryAxisSizingMode = 'FIXED'; z.counterAxisSizingMode = 'FIXED';
  z.primaryAxisAlignItems = 'CENTER'; z.counterAxisAlignItems = 'CENTER'; z.paddingLeft = z.paddingRight = 16;
  z.x = Math.round(x); z.y = Math.round(y); z.resize(Math.max(40, Math.round(w)), Math.max(40, Math.round(h)));
  z.fills = [{ type: 'SOLID', color: { r: .96, g: .96, b: .96 } }]; z.strokes = [{ type: 'SOLID', color: { r: .6, g: .6, b: .6 } }];
  z.strokeWeight = 3; z.dashPattern = [16, 10]; z.strokeAlign = 'INSIDE';
  const t = figma.createText(); z.appendChild(t); t.fontName = { family: F.family, style: F.regular };
  t.fontSize = Math.max(12, Math.min(28, Math.round(w / 18))); t.characters = 'Drag in by hand:\n' + fileName;
  t.textAlignHorizontal = 'CENTER'; t.fills = [{ type: 'SOLID', color: { r: .35, g: .35, b: .35 } }];
  t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT';
  return z;
}
// GIF slot: shows a still first frame for now (uploaded like any image). Named "GIF: <file to drag in>" so that
// place_gifs.js can swap in the playing GIF after the person drags the GIF folder onto the page.
// (Figma only plays GIFs that were dragged in by hand; MCP uploads stay on the first frame.)
function gifSlot(p, im, x, y, w, h) {
  const r = figma.createRectangle(); p.appendChild(r); r.name = 'GIF: ' + im.gif.drag;
  r.x = Math.round(x); r.y = Math.round(y); r.resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  r.fills = [{ type: 'SOLID', color: { r: .93, g: .93, b: .93 } }]; if (im.upload) imgs.push([r.id, im.upload]); return r;
}
// Place a manifest image: a GIF slot, a normal placeholder (uploaded later) or, if marked manual, a drop-zone.
async function media(p, im, x, y, w, h) { return im.gif ? gifSlot(p, im, x, y, w, h) : im.manual ? dropZone(p, im.manual_file || im.file, x, y, w, h) : img(p, im.upload || im.file, x, y, w, h); }
// Same, fitted into a box keeping the aspect ratio (uses the visible size on the slide as the ratio).
async function mediaFit(p, im, bx, by, bw, bh) { const nw = im.vis ? im.vis.w : im.natW, nh = im.vis ? im.vis.h : im.natH; const s = Math.min(bw / nw, bh / nh); return media(p, im, bx + (bw - nw * s) / 2, by + (bh - nh * s) / 2, nw * s, nh * s); }

// ---- template-mode building blocks ----
async function title(c, r, t, sub, name = 'Title') { const f = await frame(name, c, r, 'bgTitle'); const tt = await text(f, 'Slides Title', t, 'h1', 60, 0, 1800, { color: 'textOnDark' }); tt.y = 871 - tt.height; if (sub) await text(f, 'sub header', sub, 'h3', 60, 954, 1800, { color: 'textOnDark' }); return f; }
async function section(c, r, t, pre) { const f = await frame('Section — ' + t, c, r, 'bgSection'); await label(f); let y = 140; if (pre) { await text(f, 'Section Pre', pre, 'h2', 60, 140, 1800, { color: 'accent' }); y = 266; } await text(f, 'Section Header', t, 'h1', 60, y, 1800); return f; }
async function statement(c, r, name, s, o = {}) { const f = await frame(name, c, r, 'bgSection'); await label(f); await text(f, 'statement', s, 'h2', 60, 60, 1800, Object.assign({ h: 960, ha: 'CENTER', va: 'CENTER' }, o)); return f; }
async function bigHead(c, r, name, head, body, o = {}) { const f = await frame(name, c, r); await label(f); const h = await text(f, 'heading', head, 'h2', 60, 150, 888); if (body) await text(f, 'body', body, 'bL', 60, h.y + h.height + 40, 1040, o); return f; }
async function leftHeadRightBox(c, r, name, head, body, o = {}) { const f = await frame(name, c, r); await label(f); const h = await text(f, 'heading', head, 'h3', 60, 150, 584); if (body) await text(f, 'body', body, 'b1', 60, h.y + h.height + 40, 584, o); await outline(f, 'media box', 668, 60, 1192, 960); return f; }
async function wide(c, r, name, head, box = true) { const f = await frame(name, c, r); await label(f); await text(f, 'heading', head, 'h3', 60, 150, 1800); if (box) await outline(f, 'wide box', 60, 280, 1800, 740); return f; }
async function arrow(p, x1, y1, x2, y2) { const v = figma.createVector(); p.appendChild(v); const mx = Math.min(x1, x2), my = Math.min(y1, y2); await v.setVectorNetworkAsync({ vertices: [{ x: x1 - mx, y: y1 - my, strokeCap: 'NONE' }, { x: x2 - mx, y: y2 - my, strokeCap: 'ARROW_LINES' }], segments: [{ start: 0, end: 1 }], regions: [] }); v.x = mx; v.y = my; await paint(v, 'text', 'strokes'); v.strokeWeight = 3; v.name = 'Arrow'; return v; }
// YouTube: HD thumbnail placeholder + play badge + clickable link under it
async function youtube(p, thumbFile, url, x, y, w) { const h = w * 9 / 16; img(p, thumbFile, x, y, w, h); const b = figma.createEllipse(); p.appendChild(b); b.name = 'play'; b.resize(120, 120); b.x = x + w / 2 - 60; b.y = y + h / 2 - 60; b.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.6 }]; const tri = figma.createPolygon(); p.appendChild(tri); tri.name = 'play icon'; tri.pointCount = 3; tri.resize(48, 48); tri.rotation = -90; tri.x = x + w / 2 - 16; tri.y = y + h / 2 - 24; tri.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]; await text(p, 'video link', url, 'lab', x, y + h + 16, w, { color: 'muted', link: url }); }

// ---- verbatim mode: rebuild one slide from its manifest entry, at the original positions ----
// Weight of a font style name: "Semi Bold" / "SemiBold" / "Black Italic" / "9pt Regular" …
function _styleWeight(st) {
  const s = st.toLowerCase().replace(/[\s_-]/g, '');
  const table = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['book', 400], ['regular', 400], ['normal', 400],
    ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['bold', 700], ['black', 900], ['heavy', 900]];
  for (const [k, w] of table) if (s.includes(k)) return w;
  return s.includes('italic') ? 400 : null;
}
// Best installed style of `family` for a CSS weight + italic: exact if possible, else the NEAREST weight
// (e.g. Inter Black 900 -> DM Sans Black; a family without Black -> its ExtraBold/Bold). Falls back to CFG.font.
async function _font(family, weight, italic) {
  const want = weight || 400;
  const styles = [...(_FONTS)].filter(k => k.startsWith(family + '|')).map(k => k.slice(family.length + 1))
    .filter(st => !/^\d+pt /i.test(st))   // skip optical-size variants like "9pt Regular"
    .map(st => ({ st, w: _styleWeight(st), it: /italic|oblique/i.test(st) })).filter(x => x.w);
  if (styles.length) {
    const pick = styles.sort((a, b) => (Math.abs(a.w - want) + (a.it !== !!italic) * 1000) - (Math.abs(b.w - want) + (b.it !== !!italic) * 1000) || b.w - a.w)[0];
    await figma.loadFontAsync({ family, style: pick.st }); return { family, style: pick.st };
  }
  const st = want >= 600 ? F.bold : (italic ? F.italic : F.regular); await figma.loadFontAsync({ family: F.family, style: st }); return { family: F.family, style: st };
}
// Colour mapping from fonts_colors.py (mapping.colors): deck hex (or any of its grouped variants) -> paint style/variable name or hex.
let _CMAP = null;
function _normHex(c) { const rgb = cssToRgb(c); return rgb ? '#' + [rgb.r, rgb.g, rgb.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase() : null; }
// Returns a paint-style name that exists in this file, or a colour string.
function _colorTarget(css, colorMap) {
  if (!colorMap) return css;
  if (!_CMAP) {
    _CMAP = {};
    for (const [h, e] of Object.entries(colorMap)) {
      const t = typeof e === 'string' ? { to: e } : e;
      const target = _PS[t.to] ? t.to : (t.toHex || t.to);   // style missing in this file -> use its hex
      _CMAP[h.toUpperCase()] = target; for (const v of t.variants || []) _CMAP[v.toUpperCase()] = target;
    }
  }
  const h = _normHex(css); return (h && _CMAP[h]) || css;
}
// Apply a deck colour to a node, through the mapping: uses the Figma colour STYLE when mapped to one (stays linked),
// otherwise a plain colour.
async function applyColor(node, css, colorMap, prop = 'fills', opacity = 1) {
  const to = _colorTarget(css, colorMap);
  if (_PS[to] && opacity >= 0.99) { prop === 'fills' ? await node.setFillStyleIdAsync(_PS[to].id) : await node.setStrokeStyleIdAsync(_PS[to].id); return; }
  const rgb = _PS[to] ? _PS[to].paints[0].color : cssToRgb(to);
  if (rgb) node[prop] = [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity }];
}
// slide = manifest entry. opts (usually straight from mapping.json):
//   fontMap:  { 'Inter': 'DM Sans', … }  deck family -> Figma family (or {to:'DM Sans'} entries); weights go to the nearest available
//   colorMap: mapping.colors              deck colour -> Figma colour style name / hex
async function verbatimSlide(c, r, slide, opts = {}) {
  const fontTo = fam => { const e = (opts.fontMap || {})[fam]; return (e && (e.to || e)) || fam; };
  const f = await frame('Slide ' + slide.n, c, r, 'bgContent');
  await applyColor(f, slide.background || '#FFFFFF', opts.colorMap);
  for (const sh of slide.shapes || []) {
    if (!sh.fill && !sh.stroke) continue;
    const n = sh.tag === 'ellipse' || sh.tag === 'circle' ? figma.createEllipse() : figma.createRectangle();
    f.appendChild(n); n.name = 'shape ' + (sh.obj || ''); n.x = sh.rect.x; n.y = sh.rect.y; n.resize(Math.max(1, sh.rect.w), Math.max(1, sh.rect.h));
    n.fills = [];
    if (sh.fill) await applyColor(n, sh.fill, opts.colorMap, 'fills', sh.fillOpacity == null ? 1 : sh.fillOpacity);
    if (sh.stroke) { await applyColor(n, sh.stroke, opts.colorMap, 'strokes'); n.strokeWeight = sh.strokeWidth || 1; }
  }
  for (const im of slide.images || []) if (im.upload || im.file || im.manual) await media(f, im, im.vis.x, im.vis.y, im.vis.w, im.vis.h);
  for (const tb of slide.texts || []) {
    const t = figma.createText(); f.appendChild(t);
    t.fontName = await _font(fontTo(tb.font), tb.weight, tb.italic); t.fontSize = Math.max(1, tb.size || 24);
    t.characters = tb.text; t.name = tb.text.slice(0, 40);
    t.x = tb.rect.x; t.y = tb.rect.y; t.textAutoResize = 'HEIGHT'; t.resize(Math.max(20, tb.rect.w + 8), t.height);
    await applyColor(t, tb.color || '#000000', opts.colorMap);
    // mixed styling inside one box: style each paragraph from its first run (text = paragraphs joined by \n)
    let off = 0;
    for (const p of tb.paragraphs || []) {
      const run = (p.runs || [])[0]; const end = off + p.text.length;
      if (run && end > off && end <= t.characters.length) {
        t.setRangeFontName(off, end, await _font(fontTo(run.font), run.weight, run.italic));
        if (run.size) t.setRangeFontSize(off, end, run.size);
        const to = _colorTarget(run.color, opts.colorMap);
        if (_PS[to]) await t.setRangeFillStyleIdAsync(off, end, _PS[to].id);
        else { const rc = cssToRgb(to); if (rc) t.setRangeFills(off, end, [{ type: 'SOLID', color: rc }]); }
      }
      off = end + 1;
    }
  }
  return f;
}
