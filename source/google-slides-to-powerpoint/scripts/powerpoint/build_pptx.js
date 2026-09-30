// Build a PPTX from a deck spec. Default profile targets Keynote import;
// --target powerpoint selects native Office typography and physical page scaling.
//
//   osascript -l JavaScript build_pptx.js <deck-spec.json> <out.pptx> [--font-map '{"Proxima Nova":"Helvetica Neue"}']
//
// Uses only macOS: the XML is written as text from pptx-template/, zipped with /usr/bin/zip. Animated GIFs that are
// cropped or masked are cut frame by frame with ImageIO; every other crop, mask and mirror is left to Keynote (it
// honours them on import for pictures, not for GIFs, which it turns into movies).
// Choices that keep Keynote's importer happy (each one found by testing, see keynote-gotchas.md):
//   1 px = 1 pt; no speaker notes (Keynote refuses the file); only the Blank layout; fonts as PostScript names;
//   italic runs listed in <out>.fixups.json for to_keynote.js to set again (the importer drops italic faces).
// Prints a JSON summary: slides, elements, skipped elements, fonts that aren't installed, italic fix-ups.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);

var TARGET = 'keynote', SCALE = 1;
var PT = 12700;                                  // EMU per point (1 slide px = 1 pt)
var E = v => Math.round((v || 0) * PT);
var HERE = dirname(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)));
var esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ---- fonts ----
var STYLE_WEIGHTS = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['book', 400], ['regular', 400],
  ['normal', 400], ['roman', 400], ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['heavy', 900],
  ['black', 900], ['bold', 700]];
function styleWeight(st) { const s = (st || '').toLowerCase().replace(/[\s_-]/g, ''); for (const [k, w] of STYLE_WEIGHTS) if (s.includes(k)) return w; return 400; }
const isItalicFace = f => /italic|oblique/i.test(f.style) || (f.traits & 1) === 1;
function exactPowerPointFace(faces, weight, italic, style) {
  const norm = v => v.toLowerCase().replace(/[\s_-]/g, '');
  return faces.find(f => styleWeight(f.style) === weight && isItalicFace(f) === italic && (!style || norm(f.style) === norm(style)));
}
function Fonts(spec, fontMap) {
  this.map = fontMap || {}; this.faces = {}; this.missing = {}; this.unresolved = []; this.variations = [];
  const fam = f => { const t = this.map[(f || '').trim()]; return (t && (t.to || t)) || (f || '').trim(); };
  this.family = fam;
  for (const s of spec.slides) for (const el of s.elements || []) if (el.type === 'text')
    for (const p of el.paragraphs || []) for (const r of p.runs || []) if (r.font) { const f = fam(r.font); if (!(f in this.faces)) this.faces[f] = fontFaces(f); }
}
// -> {name, italic}: the PostScript name of the nearest face (exact style name first), and whether that face is italic.
Fonts.prototype.resolve = function (family, weight, italic, style, variations) {
  const fam = this.family(family), faces = this.faces[fam] || [];
  if (TARGET === 'powerpoint') {
    const want = variations?.wght ?? (weight || styleWeight(style)), it = !!italic || /italic|oblique/i.test(style || '');
    // Office run styles can express an exact named weight. Other variable axes
    // remain unverified rather than silently disappearing from the source data.
    const axes = Object.fromEntries(Object.entries(variations || {}).filter(([axis]) => axis !== 'wght'));
    if (Object.keys(axes).length && !this.variations.some(f => f.family === fam && f.style === (style || '') && JSON.stringify(f.axes) === JSON.stringify(axes)))
      this.variations.push({ family: fam, style: style || '', axes, reason: 'variable font axes not represented by native run properties' });
    const exact = exactPowerPointFace(faces, want, it, style);
    if (!faces.length) this.missing[fam] = (this.missing[fam] || 0) + 1;
    if (!exact && !this.unresolved.some(f => f.family === fam && f.style === (style || '') && f.weight === want && f.italic === it))
      this.unresolved.push({ family: fam, style: style || '', weight: want, italic: it });
    // Regular/Bold use Office's family and independent style flags. Other weights
    // use the installed face's human display name, never a guessed nearest weight.
    if (exact && (!['regular', 'normal', 'roman', 'bold', 'italic', 'oblique', 'bolditalic', 'boldoblique'].includes(exact.style.toLowerCase().replace(/[\s_-]/g, '')) || ![400, 700].includes(want))) {
      const face = $.NSFont.fontWithNameSize(exact.ps, 12);
      return { name: ObjC.unwrap(face.displayName), italic: it, bold: false };
    }
    return { name: fam, italic: it, bold: want === 700 };
  }

  if (!faces.length) { this.missing[fam] = (this.missing[fam] || 0) + 1; return { name: fam, italic: !!italic, bold: (weight || 400) >= 600 }; }
  if (style) {
    const norm = v => v.toLowerCase().replace(/[\s-]/g, '');
    const exact = faces.find(f => norm(f.style) === norm(style));
    if (exact) return { name: exact.ps, italic: isItalicFace(exact) };
    weight = weight || styleWeight(style); italic = italic || /italic|oblique/i.test(style);
  }
  const want = weight || 400;
  // optical-size faces ("9pt Regular", DMSans18pt-…) only when nothing else fits
  const cost = f => Math.abs(styleWeight(f.style) - want) + (isItalicFace(f) === !!italic ? 0 : 1000) + (/\d+pt/.test(f.ps + ' ' + f.style) ? 0.5 : 0);
  const best = faces.slice().sort((a, b) => cost(a) - cost(b))[0];
  return { name: best.ps, italic: isItalicFace(best) };
};

// ---- XML pieces ----
function fillXml(color, opacity) {
  const h = hex6(color); if (!h) return '<a:noFill/>';
  const a = opacity != null && opacity < 0.999 ? `<a:alpha val="${Math.round(opacity * 100000)}"/>` : '';
  return `<a:solidFill><a:srgbClr val="${h}">${a}</a:srgbClr></a:solidFill>`;
}
// Figma's linear transform maps normalized shape coordinates to gradient space.
// Remap stops to the projection across the box so offset/short gradients keep their placement.
function gradientXml(el) {
  const g = el.gradient, [[a, c, tx]] = g.transform;
  const lo = tx + Math.min(0, a) + Math.min(0, c), hi = tx + Math.max(0, a) + Math.max(0, c);
  if (!Number.isFinite(lo + hi) || hi <= lo) throw new Error('invalid linear gradient transform');
  const stops = g.stops.slice().sort((x, y) => x.position - y.position);
  if (!stops.length) throw new Error('gradient has no stops');
  function at(t) {
    if (t <= stops[0].position) return stops[0].color;
    for (let i = 1; i < stops.length; i++) if (t <= stops[i].position) {
      const x = stops[i - 1], y = stops[i], f = (t - x.position) / (y.position - x.position);
      return { r: x.color.r + (y.color.r - x.color.r) * f, g: x.color.g + (y.color.g - x.color.g) * f,
        b: x.color.b + (y.color.b - x.color.b) * f, a: (x.color.a ?? 1) + ((y.color.a ?? 1) - (x.color.a ?? 1)) * f };
    }
    return stops[stops.length - 1].color;
  }
  const mapped = [{ position: lo, color: at(lo) }, ...stops.filter(s => s.position > lo && s.position < hi), { position: hi, color: at(hi) }];
  const gs = mapped.map(s => {
    const color = '#' + [s.color.r, s.color.g, s.color.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    return `<a:gs pos="${Math.round((s.position - lo) / (hi - lo) * 100000)}">` +
      fillXml(color, (s.color.a ?? 1) * (g.opacity ?? 1)).replace('<a:solidFill>', '').replace('</a:solidFill>', '') + '</a:gs>';
  }).join('');
  const angle = ((Math.atan2(c / el.h, a / el.w) * 180 / Math.PI + 360) % 360) * 60000;
  return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${Math.round(angle)}" scaled="0"/></a:gradFill>`;
}
function effectsXml(el) {
  const shadows = el.shadows || [];
  const blur = TARGET === 'powerpoint' && el.blur ? `<a:blur rad="${E(el.blur.radius)}" grow="${el.blur.grow === false ? 0 : 1}"/>` : '';
  return '<a:effectLst>' + blur + shadows.map(s => {
    if (!['inner', 'outer'].includes(s.type)) throw new Error('unsupported shadow');
    const tag = s.type === 'inner' ? 'innerShdw' : 'outerShdw';
    const angle = ((Math.atan2(s.y || 0, s.x || 0) * 180 / Math.PI + 360) % 360) * 60000;
    const attrs = s.type === 'outer' ? ' algn="ctr" rotWithShape="0"' : '';
    return `<a:${tag} blurRad="${E(s.blur || 0)}" dist="${E(Math.hypot(s.x || 0, s.y || 0))}" dir="${Math.round(angle)}"${attrs}>` +
      fillXml(s.color, s.opacity).replace('<a:solidFill>', '').replace('</a:solidFill>', '') + `</a:${tag}>`;
  }).join('') + '</a:effectLst>';
}
function lineXml(el) {
  return el.stroke && el.strokeWidth ? `<a:ln w="${E(el.strokeWidth)}">${fillXml(el.stroke)}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
}
function xfrm(x, y, w, h, rot, flipH, flipV) {
  let attrs = '';
  if (rot) attrs += ` rot="${Math.round((((rot % 360) + 360) % 360) * 60000)}"`;
  if (flipH) attrs += ' flipH="1"'; if (flipV) attrs += ' flipV="1"';
  return `<a:xfrm${attrs}><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(Math.max(TARGET === 'powerpoint' ? 0 : 0.5, w))}" cy="${E(Math.max(TARGET === 'powerpoint' ? 0 : 0.5, h))}"/></a:xfrm>`;
}
function prst(name, adj) {
  return `<a:prstGeom prst="${name}"><a:avLst>${adj != null ? `<a:gd name="adj" fmla="val ${Math.round(adj)}"/>` : ''}</a:avLst></a:prstGeom>`;
}
// SVG path data with absolute M L C Q Z only -> [[cmd, [[x,y]…]]…]
function parsePath(d) {
  const t = String(d).match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], need = { M: 1, L: 1, C: 3, Q: 2, Z: 0 }, out = [];
  let cmd = null;
  for (let i = 0; i < t.length;) {
    if (/^[A-Za-z]$/.test(t[i])) { cmd = t[i++].toUpperCase(); if (cmd === 'Z') { out.push(['Z', []]); continue; } }
    const n = need[cmd] || 1, pts = [];
    for (let k = 0; k < n; k++) pts.push([+t[i + 2 * k], +t[i + 2 * k + 1]]);
    out.push([cmd, pts]); i += 2 * n; if (cmd === 'M') cmd = 'L';
  }
  return out;
}
// custom geometry for an outline given in slide px; box = [x0, y0, w, h] it's drawn in
function custGeom(segs, box) {
  const [x0, y0, w, h] = box, tags = { M: 'moveTo', L: 'lnTo', C: 'cubicBezTo', Q: 'quadBezTo' };
  let path = '';
  for (const [cmd, pts] of segs) {
    if (cmd === 'Z') { path += '<a:close/>'; continue; }
    path += `<a:${tags[cmd]}>` + pts.map(([x, y]) => `<a:pt x="${E(x - x0)}" y="${E(y - y0)}"/>`).join('') + `</a:${tags[cmd]}>`;
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${E(w)}" h="${E(h)}">${path}</a:path></a:pathLst></a:custGeom>`;
}

function Slide(spec, fonts, pkg) {
  this.id = 1; this.xml = []; this.rels = []; this.fonts = fonts; this.pkg = pkg; this.textItems = 0; this.fix = [];
}
Slide.prototype.nextId = function () { return ++this.id; };
Slide.prototype.rel = function (type, target, external) {
  const id = 'rId' + (this.rels.length + 2);  // rId1 = the layout
  this.rels.push(`<Relationship Id="${id}" Type="${REL}/${type}" Target="${esc(target)}"${external ? ' TargetMode="External"' : ''}/>`);
  return id;
};
Slide.prototype.box = function (el) {
  const id = this.nextId(), ell = el.type === 'ellipse', r = el.radius || 0;
  const geom = ell ? prst('ellipse') : r ? prst('roundRect', Math.min(50000, r / Math.max(1, Math.min(el.w, el.h)) * 100000)) : prst('rect');
  this.xml.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el.x, el.y, el.w, el.h, el.rotation)}${geom}${el.gradient ? gradientXml(el) : el.fill ? fillXml(el.fill, el.fillOpacity) : '<a:noFill/>'}${lineXml(el)}${effectsXml(el)}</p:spPr></p:sp>`);
};
Slide.prototype.path = function (el) {
  const segs = parsePath(el.d), pts = segs.flatMap(s => s[1]);
  if (!pts.length) throw new Error('empty path');
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(0.5, Math.max(...xs) - x0), h = Math.max(0.5, Math.max(...ys) - y0), id = this.nextId();
  this.xml.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x0, y0, w, h)}${custGeom(segs, [x0, y0, w, h])}${el.fill ? fillXml(el.fill, el.fillOpacity) : '<a:noFill/>'}${lineXml(el)}${effectsXml(el)}</p:spPr></p:sp>`);
};
Slide.prototype.line = function (el) {
  const id = this.nextId(), x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
  this.xml.push(`<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(x, y, Math.abs(el.x2 - el.x1), Math.abs(el.y2 - el.y1), 0, el.x2 < el.x1, el.y2 < el.y1)}${prst('line')}<a:ln w="${E(el.strokeWidth || 1)}">${fillXml(el.stroke || '#000000')}</a:ln></p:spPr></p:cxnSp>`);
};
Slide.prototype.image = function (el, base) {
  let src = join(base, el.file);
  if (!exists(src)) throw new Error('missing ' + el.file);
  let ext = extname(src);
  if (!['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {  // WebP, TIFF, BMP…: Keynote needs PNG/JPEG/GIF
    const png = join(this.pkg.tmp, 'conv', stem(src) + '_' + this.pkg.media + '.png'); mkdirp(dirname(png));
    shOK(`/usr/bin/sips -s format png ${q(src)} --out ${q(png)}`); src = png; ext = '.png';
  }
  let crop = el.crop, mask = el.mask, flipH = el.flipH, flipV = el.flipV;
  const info = ext === '.gif' ? imageSize(src) : null;
  if (TARGET === 'keynote' && info && info.frames > 1 && (crop || mask)) {
    // Keynote turns GIFs into movies and ignores crops and masks on them: cut the GIF itself, frame by frame
    const c = crop || { l: 0, t: 0, r: 0, b: 0 };
    const cx = c.l * info.w, cy = c.t * info.h, cw = info.w * (1 - c.l - c.r), ch = info.h * (1 - c.t - c.b);
    let gm = null;
    if (mask === 'ellipse') gm = 'ellipse';
    else if (mask && mask.roundRect != null) gm = { r: mask.roundRect * cw / Math.max(1, el.w) };
    else if (mask && mask.path) gm = parsePath(mask.path).flatMap(s => s[1]).map(([x, y]) => [(x - el.x) / el.w * cw, (y - el.y) / el.h * ch]);
    const out = join(this.pkg.tmp, 'conv', stem(src) + '_' + this.pkg.media + '.gif'); mkdirp(dirname(out));
    editGif(src, out, { crop: { x: cx, y: cy, w: cw, h: ch }, mask: gm, flipH, flipV });
    src = out; crop = null; mask = null; flipH = flipV = false;
  }
  const name = 'image' + (++this.pkg.media) + (ext === '.jpeg' ? '.jpg' : ext);
  copyFile(src, join(this.pkg.tmp, 'ppt/media', name));
  this.pkg.exts.add(ext === '.jpeg' ? '.jpg' : ext);
  const rid = this.rel('image', '../media/' + name), id = this.nextId();
  const link = el.link ? `<a:hlinkClick r:id="${this.rel('hyperlink', el.link, true)}"/>` : '';
  const alpha = el.opacity != null && el.opacity < 0.999 ? `<a:alphaModFix amt="${Math.round(el.opacity * 100000)}"/>` : '';
  // Native picture effects retain the original bitmap and remain removable.
  // Reconstruction candidates still need comparison in the target renderer.
  let pictureEffects = '';
  if (TARGET === 'powerpoint' && el.imageEffects) {
    if (el.imageEffects.grayscale) pictureEffects += '<a:grayscl/>';
    if (el.imageEffects.duotone) pictureEffects += '<a:duotone>' + el.imageEffects.duotone.map(c => `<a:srgbClr val="${hex6(c)}"/>`).join('') + '</a:duotone>';
    if (el.imageEffects.saturation != null) pictureEffects += `<a:hsl hue="0" sat="${Math.round((1 + el.imageEffects.saturation) * 100000)}" lum="100000"/>`;
    if (el.imageEffects.brightness != null) pictureEffects += `<a:lum bright="${Math.round(el.imageEffects.brightness * 100000)}" contrast="0"/>`;
  }
  const src_rect = crop ? `<a:srcRect l="${Math.round(crop.l * 100000)}" t="${Math.round(crop.t * 100000)}" r="${Math.round(crop.r * 100000)}" b="${Math.round(crop.b * 100000)}"/>` : '';
  let geom = prst('rect');
  if (mask === 'ellipse') geom = prst('ellipse');
  else if (mask && mask.roundRect != null) geom = prst('roundRect', Math.min(50000, mask.roundRect / Math.max(1, Math.min(el.w, el.h)) * 100000));
  else if (mask && mask.path) geom = custGeom(parsePath(mask.path), [el.x, el.y, el.w, el.h]);
  this.xml.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${esc(basename(el.file))}">${link}</p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${alpha}${pictureEffects}</a:blip>${src_rect}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(el.x, el.y, el.w, el.h, el.rotation, flipH, flipV)}${geom}${effectsXml(el)}</p:spPr></p:pic>`);
};
var ALIGN = { left: 'l', center: 'ctr', right: 'r', justify: 'just' }, ANCHOR = { top: 't', middle: 'ctr', bottom: 'b' };
Slide.prototype.text = function (el) {
  const id = this.nextId(), ranges = [];
  let y = el.y;
  if (TARGET === 'powerpoint' && Number.isFinite(el.sourceBaselineY) && (!el.valign || el.valign === 'top') && !el.rotation) {
    const p = el.paragraphs?.[0], runs = [], metrics = [];
    for (const r of p?.runs || []) {
      if (r.text?.split('\v')[0]) runs.push(r);
      if (r.text?.includes('\v')) break;
    }
    for (const r of runs) {
      const faces = this.fonts.faces[this.fonts.family(r.font)] || [];
      const f = exactPowerPointFace(faces, r.fontVariations?.wght ?? (r.weight || styleWeight(r.style)), !!r.italic || /italic|oblique/i.test(r.style || ''), r.style);
      if (!f) { metrics.length = 0; break; }
      const font = $.NSFont.fontWithNameSize(f.ps, r.size || 24);
      metrics.push({a:Number(font.ascender),d:-Number(font.descender),size:r.size || 24});
    }
    if (metrics.length) {
      const a = Math.max(...metrics.map(m => m.a)), d = Math.max(...metrics.map(m => m.d));
      const lineHeight = p.lineHeightPx || Math.max(...metrics.map(m => m.size)) * (p.lineSpacing || 1.2);
      // Native Mac pilot: PowerPoint places the first baseline within the line
      // height according to the face's ascent/descent, rather than SVG's em box.
      // Retain the source baseline and derive the editable box origin; every
      // resulting deck still requires its own native comparison.
      if (a > 0 && a + d > 0) y = el.sourceBaselineY - lineHeight * a / (a + d);
    }
  }
  let pos = 0, paras = '';
  (el.paragraphs || []).forEach((p, i) => {
    if (i) pos += 1;   // paragraph end = one character in Keynote's text
    let ppr = `<a:pPr algn="${ALIGN[p.align] || 'l'}"${p.bullet ? ` marL="${E(1.2 * 24)}" indent="${-E(1.2 * 24)}"` : TARGET === 'powerpoint' && p.marginLeft != null ? ` marL="${E(p.marginLeft)}"` : ''}>`;
    if (p.lineHeightPx) ppr += `<a:lnSpc><a:spcPts val="${Math.round(p.lineHeightPx * SCALE * 100)}"/></a:lnSpc>`;
    else if (p.lineSpacing) ppr += `<a:lnSpc><a:spcPct val="${Math.round(p.lineSpacing * 100000)}"/></a:lnSpc>`;
    if (p.spaceBefore) ppr += `<a:spcBef><a:spcPts val="${Math.round(p.spaceBefore * SCALE * 100)}"/></a:spcBef>`;
    ppr += p.bullet ? '<a:buChar char="•"/>' : '<a:buNone/>';
    ppr += '</a:pPr>';
    const runs = (p.runs || []).filter(r => r.text);
    if (!runs.length) {
      const sz = Math.round(Math.max(1, ((p.runs || [])[0] || {}).size || 24) * SCALE * 100);
      paras += `<a:p>${ppr}<a:endParaRPr lang="en-US" sz="${sz}"/></a:p>`; return;
    }
    let body = '';
    for (const r of runs) {
      r.text.split('\v').forEach((piece, k) => {   // \v = a line break inside the paragraph (soft return)
        const f = this.fonts.resolve(r.font, r.weight, r.italic, r.style, r.fontVariations);
        const sz = Math.round((TARGET === 'powerpoint' ? (r.size || 24) * SCALE : Math.max(1, Math.min(4000, r.size || 24))) * 100);
        if (TARGET === 'powerpoint' && (sz < 100 || sz > 400000)) throw new Error('font size outside supported range; ask about physical slide size');
        let attrs = ` lang="en-US" sz="${sz}"`;
        if (f.italic) attrs += ' i="1"';                // match the face: Keynote obeys the flag over the name
        if (f.bold && (TARGET === 'powerpoint' || !f.italic)) attrs += ' b="1"';             // (only for fonts that aren't installed)
        if (r.underline) attrs += ' u="sng"';
        if (r.letterSpacing) attrs += ` spc="${Math.round(r.letterSpacing * SCALE * 100)}"`;
        const rpr = `<a:rPr${attrs}>${fillXml(r.color || '#000000', r.opacity)}<a:latin typeface="${esc(f.name)}"/><a:cs typeface="${esc(f.name)}"/>${r.link ? `<a:hlinkClick r:id="${this.rel('hyperlink', r.link, true)}"/>` : ''}</a:rPr>`;
        if (k) { body += `<a:br>${rpr}</a:br>`; pos += 1; }
        if (piece) {
          body += `<a:r>${rpr}<a:t>${esc(piece)}</a:t></a:r>`;
          if (TARGET === 'keynote' && f.italic) ranges.push([pos + 1, pos + piece.length, f.name]);
          pos += piece.length;
        }
      });
    }
    paras += `<a:p>${ppr}${body}</a:p>`;
  });
  this.xml.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el.x, y, el.w, el.h || 1, el.rotation)}${prst('rect')}<a:noFill/>${effectsXml(el)}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${ANCHOR[el.valign] || 't'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`);
  this.textItems += 1;
  const first = ((el.paragraphs || [])[0] || {}).runs || [];
  if (ranges.length) this.fix.push({ item: this.textItems, ranges, text: first.map(r => r.text || '').join('').slice(0, 24).replace(/\v/g, ' ') });
};
Slide.prototype.toXml = function (bg) {
  const bgx = bg && hex6(bg) ? `<p:bg><p:bgPr>${fillXml(bg)}<a:effectLst/></p:bgPr></p:bg>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld>${bgx}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.xml.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
};
Slide.prototype.relsXml = function () {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout7.xml"/>${this.rels.join('')}</Relationships>`;
};

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript build_pptx.js <deck-spec.json> <out.pptx> [--font-map JSON]';
  const specPath = abspath(argv[0]), out = abspath(argv[1]), base = dirname(specPath);
  const spec = readJSON(specPath);
  const fontMap = Object.assign({}, spec.fontMap || {}, JSON.parse(argOpt(argv, '--font-map', '{}')));
  const fonts = new Fonts(spec, fontMap);
  const W = spec.width || 1920, H = spec.height || 1080;
  TARGET = argOpt(argv, '--target', 'keynote');
  if (!['keynote', 'powerpoint'].includes(TARGET)) throw new Error('unknown target');
  SCALE = 1; PT = 12700;
  if (TARGET === 'powerpoint') {
    const inches = Number(argOpt(argv, '--width-in', spec.physicalSize?.widthIn ?? NaN));
    if (!Number.isFinite(inches) || inches < 1 || inches > 56 || inches * H / W < 1 || inches * H / W > 56)
      throw new Error('confirm --width-in; both slide dimensions must be 1–56 inches');
    if (spec.physicalSize && (Math.abs(inches - spec.physicalSize.widthIn) > 0.00001) && !argv.includes('--resize-approved')) throw new Error('source page size would change; ask before resizing');
    if (spec.physicalSize && Math.abs(spec.physicalSize.heightIn / spec.physicalSize.widthIn - H / W) > 2 / W) throw new Error('source physical size and extracted aspect disagree');
    SCALE = inches * 72 / W; PT *= SCALE;
    if (exists(out)) throw new Error('output already exists; choose a new file name');
    const pending = spec.conversion || {};
    if (!argv.includes('--draft') && ['unresolved_artwork', 'missing_images', 'missing_rasters', 'missing_slides', 'source_errors'].some(k => (pending[k] || []).length))
      throw new Error('unresolved source content; use --draft only for reconstruction review');
  }

  const tmp = out + '.parts'; rmrf(tmp);
  shOK(`/bin/cp -R ${q(join(HERE, 'pptx-template'))} ${q(tmp)}`); rmrf(join(tmp, 'README.md'));
  const pkg = { tmp, media: 0, exts: new Set() };
  const counts = { slides: 0, elements: 0, skipped: [] }, fix = [];
  spec.slides.forEach((s, i) => {
    const sl = new Slide(spec, fonts, pkg);
    for (const el of s.elements || []) {
      try {
        if (el.type === 'rect' || el.type === 'ellipse') sl.box(el);
        else if (el.type === 'path') sl.path(el);
        else if (el.type === 'line') sl.line(el);
        else if (el.type === 'image') sl.image(el, base);
        else if (el.type === 'text') sl.text(el);
        else { counts.skipped.push(`slide ${s.n || i + 1}: unknown type ${el.type}`); continue; }
        counts.elements++;
      } catch (e) { counts.skipped.push(`slide ${s.n || i + 1}: ${el.type} ${el.file || ''}: ${e.message}`); }
    }
    writeText(join(tmp, `ppt/slides/slide${i + 1}.xml`), sl.toXml(s.background));
    writeText(join(tmp, `ppt/slides/_rels/slide${i + 1}.xml.rels`), sl.relsXml());
    for (const f of sl.fix) fix.push(Object.assign({ slide: i + 1 }, f));
    counts.slides++;
  });
  const n = spec.slides.length;
  const pres = readText(join(tmp, 'ppt/presentation.xml')).replace('{{SLIDE_IDS}}', '<p:sldIdLst>' + spec.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${100 + i}"/>`).join('') + '</p:sldIdLst>')
    .replace('{{CX}}', E(W)).replace('{{CY}}', E(H));
  writeText(join(tmp, 'ppt/presentation.xml'), pres);
  const presRels = ['slideMaster|slideMasters/slideMaster1.xml|rId1', 'presProps|presProps.xml|rId3', 'viewProps|viewProps.xml|rId4', 'theme|theme/theme1.xml|rId5', 'tableStyles|tableStyles.xml|rId6']
    .map(x => x.split('|')).map(([t, target, id]) => `<Relationship Id="${id}" Type="${REL}/${t}" Target="${target}"/>`)
    .concat(spec.slides.map((_, i) => `<Relationship Id="rId${100 + i}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`));
  writeText(join(tmp, 'ppt/_rels/presentation.xml.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`);
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + [...pkg.exts].map(e => `<Default Extension="${e.slice(1)}" ContentType="${mime[e]}"/>`).join('')
    + `<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${CT}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT}.tableStyles+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout7.xml" ContentType="${CT}.slideLayout+xml"/>`
    + spec.slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}.slide+xml"/>`).join('') + '</Types>';
  writeText(join(tmp, '[Content_Types].xml'), types);
  rmrf(join(tmp, 'conv'));
  rmrf(out);
  shOK(`cd ${q(tmp)} && /usr/bin/zip -X -q -r ${q(out)} '[Content_Types].xml' _rels ppt`);
  rmrf(tmp);
  const fixPath = out + '.fixups.json';
  if (fix.length) writeJSON(fixPath, { fonts: fix }); else rmrf(fixPath);
  counts.target = TARGET; counts.scale_points_per_pixel = SCALE; counts.unresolved_font_styles = fonts.unresolved;
  counts.unresolved_font_variations = fonts.variations;
  counts.incomplete = counts.skipped.length > 0 || fonts.unresolved.length > 0 || fonts.variations.length > 0;
  counts.out = out; counts.fonts_not_installed = fonts.missing; counts.italic_fixups = fix.reduce((a, f) => a + f.ranges.length, 0);
  return JSON.stringify(counts, null, 1);
}
