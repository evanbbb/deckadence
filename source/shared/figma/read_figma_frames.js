// Read-only: describe slide frames for the Keynote builder. Run as one use_figma call (load figma-use first).
// Paste this whole file AFTER:  const FRAME_IDS = ['1:3', '1:45'];   (a few frames per call: results over ~20 kB get cut off)
// Returns { frames: [{ id, name, w, h, bg, els: [...] }], warnings: [...] }. figma_to_spec.js turns it into a deck spec.
//
// Element kinds (positions are relative to the frame, in px; rot = degrees clockwise around the element's centre):
//   {k:'box', shape:'rect'|'ellipse', x,y,w,h,rot, r, fill, fo, stroke, sw}      solid fills and strokes
//   {k:'img', x,y,w,h,rot, r, hash, mode, xf, fo}                                  an image fill (hash = SHA-1 of the file)
//   {k:'path', fill, fo, d}                                                        vector outline, already in frame
//                                                                                  coordinates (fill and stroke geometry,
//                                                                                  so arrowheads and stroke caps are exact)
//   {k:'text', x,y,w,h,rot, ha, va, ar, segs:[{s, f, st, sz, c, o, u, link, lh, ls, cs, list}]}   ar = textAutoResize
//   {k:'gradient', id, shape, x,y,w,h, paint}                                    editable linear-gradient candidate
//   {k:'raster', id, x,y,w,h, why, source}                                       needs an editable reconstruction; x,y,w,h
//                                                                                  = where its render lands (render bounds)
//   {k:'raster', id, x,y,w,h, why, from:'ref'}                                     blend modes and blurs depend on what's
//                                                                                  behind: an approved fallback may need a
//                                                                                  source crop; disclose any baked-in text
//   clip: [x,y,w,h] on any element = the visible area left by frames that clip their content
// Nothing in the file is changed.
const R = v => Math.round(v * 10) / 10;
const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const warnings = [];
const MAX_PATH = 12000;   // above this, flag the vector for a separate editable reconstruction attempt

function geom(node, frameT) {
  // node.absoluteTransform maps the node's own space to the page; express it relative to the frame
  const [[a, c, tx], [b, d, ty]] = node.absoluteTransform;
  const [[fa, , fx], [, , fy]] = frameT;   // slide frames are never rotated
  const w = node.width, h = node.height;
  const ox = tx - fx, oy = ty - fy;
  const cx = ox + a * w / 2 + c * h / 2, cy = oy + b * w / 2 + d * h / 2;
  let rot = Math.atan2(b, a) * 180 / Math.PI;
  if (Math.abs(rot) < 0.05) rot = 0;
  const g = { x: R(cx - w / 2), y: R(cy - h / 2), w: R(w), h: R(h) };
  if (rot) g.rot = R(rot);
  if (a * d - b * c < 0) g.flip = true;
  return g;
}
// Figma path data uses only absolute M L C Q Z commands: map every point into frame coordinates.
function toFrame(d, node, frameT) {
  const [[a, c, tx], [b, dd, ty]] = node.absoluteTransform, fx = frameT[0][2], fy = frameT[1][2];
  // Figma writes the letter stuck to the first number ("M111.7 0.7 L…"): split into letters and numbers
  const t = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], out = [];
  for (let i = 0; i < t.length;) {
    if (/^[A-Za-z]$/.test(t[i])) { out.push(t[i++]); continue; }
    const x = +t[i], y = +t[i + 1]; i += 2;
    out.push(R(a * x + c * y + tx - fx), R(b * x + dd * y + ty - fy));
  }
  return out.join(' ');
}
function renderBox(n, frameT) {
  const b = n.absoluteRenderBounds || n.absoluteBoundingBox, fx = frameT[0][2], fy = frameT[1][2];
  return b ? { x: R(b.x - fx), y: R(b.y - fy), w: R(b.width), h: R(b.height) } : null;
}
function raster(n, frameT, why, clip) {
  const fromRef = why.startsWith('ref:');
  return { k: 'raster', id: n.id, ...(renderBox(n, frameT) || {}), why: fromRef ? why.slice(4) : why, ...(fromRef ? { from: 'ref' } : {}), ...(clip ? { clip } : {}),
    source: { type: n.type, fills: n.fills === figma.mixed ? [] : n.fills, effects: n.effects || [] } };
}
function intersect(a, b) {
  if (!a) return b; if (!b) return a;
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  return [R(x1), R(y1), R(Math.max(0, x2 - x1)), R(Math.max(0, y2 - y1))];
}
const visiblePaints = ps => (ps === figma.mixed || !ps) ? [] : ps.filter(p => p.visible !== false && (p.opacity ?? 1) > 0.001);
const radius = n => ('cornerRadius' in n && n.cornerRadius !== figma.mixed) ? n.cornerRadius : ('topLeftRadius' in n ? Math.max(n.topLeftRadius, n.topRightRadius, n.bottomLeftRadius, n.bottomRightRadius) : 0);

function needsRaster(n) {
  if ('blendMode' in n && !['NORMAL', 'PASS_THROUGH'].includes(n.blendMode)) return 'ref:blend mode ' + n.blendMode;
  for (const p of visiblePaints(n.fills)) if (p.blendMode && p.blendMode !== 'NORMAL') return 'ref:fill blend mode ' + p.blendMode;
  if ('effects' in n && n.effects.some(e => e.visible !== false && (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR'))) return 'ref:blur';
  const shadows = (n.effects || []).filter(e => e.visible !== false && e.type.includes('SHADOW'));
  if (shadows.length > 1 || shadows.some(e => e.spread || (e.blendMode && e.blendMode !== 'NORMAL')) || (shadows.length && 'children' in n)) return 'complex shadow';
  if ('children' in n && n.children.some(ch => ch.isMask)) return 'mask';
  for (const p of visiblePaints(n.fills)) {
    if (p.type.startsWith('GRADIENT') && (p.type !== 'GRADIENT_LINEAR' || !['RECTANGLE', 'ELLIPSE', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type))) return 'gradient';
    if (p.type === 'IMAGE' && (p.scaleMode === 'TILE' || (p.rotation || 0) !== 0)) return 'image ' + p.scaleMode.toLowerCase();
    if (p.type === 'IMAGE' && p.filters && Object.values(p.filters).some(v => v)) return 'image filters';
    if (p.type === 'VIDEO') return 'video';
    if (p.type === 'PATTERN' || p.type === 'SHADER') return p.type.toLowerCase();
  }
  for (const p of visiblePaints(n.strokes)) if (p.type !== 'SOLID') return 'non-solid stroke';
  return null;
}

function shadowsOf(n) {
  return (n.effects || []).filter(e => e.visible !== false && e.type.includes('SHADOW')).map(e => ({
    type: e.type === 'INNER_SHADOW' ? 'inner' : 'outer', color: hex(e.color), opacity: e.color.a ?? 1,
    blur: e.radius, x: e.offset.x, y: e.offset.y
  }));
}

async function walkNode(n, frameT, clip, out, opacity) {
  if (!n.visible || ('opacity' in n && n.opacity < 0.001)) return;
  const op = opacity * ('opacity' in n ? n.opacity : 1);
  const g = geom(n, frameT);
  const why = needsRaster(n);
  if (why) { out.push(raster(n, frameT, why, clip)); return; }
  if (op < 0.999 && 'children' in n && n.children.length > 1) warnings.push(`${n.name}: group opacity ${R(op)} applied to each layer`);

  if (n.type === 'TEXT') {
    const segs = n.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'textDecoration', 'hyperlink', 'lineHeight', 'letterSpacing', 'textCase', 'listOptions']);
    out.push({ k: 'text', ...g, ha: n.textAlignHorizontal, va: n.textAlignVertical, ar: n.textAutoResize, ...(clip ? { clip } : {}),
      segs: segs.map(s => {
        const f = visiblePaints(s.fills).find(p => p.type === 'SOLID');
        return { s: s.characters, f: s.fontName.family, st: s.fontName.style, ...(s.fontName.variationSettings ? { axes: s.fontName.variationSettings } : {}), sz: s.fontSize, c: f ? hex(f.color) : '#000000',
          o: R((f ? (f.opacity ?? 1) : 1) * op * 100) / 100, u: s.textDecoration === 'UNDERLINE' || undefined,
          link: s.hyperlink && s.hyperlink.type === 'URL' ? s.hyperlink.value : undefined,
          lh: s.lineHeight.unit === 'AUTO' ? undefined : s.lineHeight, ls: s.letterSpacing.value ? s.letterSpacing : undefined,
          cs: s.textCase !== 'ORIGINAL' ? s.textCase : undefined, list: s.listOptions && s.listOptions.type !== 'NONE' ? s.listOptions.type : undefined };
      }) });
    return;
  }

  const isShape = ['RECTANGLE', 'ELLIPSE', 'FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET', 'SECTION'].includes(n.type);
  const isVector = ['VECTOR', 'LINE', 'STAR', 'POLYGON', 'BOOLEAN_OPERATION'].includes(n.type);
  const fills = visiblePaints(n.fills), strokes = visiblePaints(n.strokes);
  const sw = 'strokeWeight' in n && n.strokeWeight !== figma.mixed ? n.strokeWeight : ('strokeTopWeight' in n ? n.strokeTopWeight : 1);

  if (isVector) {
    if (fills.some(p => p.type === 'IMAGE')) { out.push(raster(n, frameT, 'image inside a vector', clip)); return; }
    const parts = [];
    for (const p of fills) for (const fg of n.fillGeometry) parts.push({ fill: hex(p.color), fo: R((p.opacity ?? 1) * op * 100) / 100, d: fg.data });
    if (strokes.length && sw > 0) for (const p of strokes) for (const sg of n.strokeGeometry) parts.push({ fill: hex(p.color), fo: R((p.opacity ?? 1) * op * 100) / 100, d: sg.data });
    if (parts.reduce((a, p) => a + p.d.length, 0) > MAX_PATH) { out.push(raster(n, frameT, 'complex vector', clip)); return; }
    for (const p of parts) out.push({ k: 'path', ...p, d: toFrame(p.d, n, frameT), ...(clip ? { clip } : {}) });
    return;
  }

  if (isShape) {
    const shape = n.type === 'ELLIPSE' ? 'ellipse' : 'rect';
    if (shape === 'ellipse' && n.arcData && (n.arcData.endingAngle - n.arcData.startingAngle < 6.28 || n.arcData.innerRadius > 0)) {
      out.push(raster(n, frameT, 'arc', clip)); return;
    }
    const r = radius(n);
    if (g.flip && fills.some(p => p.type === 'IMAGE')) { out.push(raster(n, frameT, 'mirrored image', clip)); return; }
    for (const p of fills) {
      if (p.type === 'SOLID') out.push({ k: 'box', shape, ...g, r, fill: hex(p.color), fo: R((p.opacity ?? 1) * op * 100) / 100, ...(clip ? { clip } : {}) });
      else if (p.type === 'GRADIENT_LINEAR') out.push({ k: 'gradient', shape, ...g, r, paint: p, fo: op, ...(clip ? { clip } : {}) });
      else if (p.type === 'IMAGE') out.push({ k: 'img', ...g, r, shape, hash: p.imageHash, mode: p.scaleMode, xf: p.imageTransform, fo: R((p.opacity ?? 1) * op * 100) / 100, ...(clip ? { clip } : {}) });
    }
    if (strokes.length && sw > 0) {
      const p = strokes[0];
      out.push({ k: 'box', shape, ...g, r, fill: null, stroke: hex(p.color), sw, fo: R((p.opacity ?? 1) * op * 100) / 100, ...(clip ? { clip } : {}) });
    }
  } else if (!['GROUP', 'BOOLEAN_OPERATION'].includes(n.type) && !('children' in n)) {
    out.push(raster(n, frameT, n.type.toLowerCase(), clip)); return;
  }

  if ('children' in n) {
    const childClip = ('clipsContent' in n && n.clipsContent && n.type !== 'GROUP') ? intersect(clip, g.rot ? null : [g.x, g.y, g.w, g.h]) : clip;
    for (const ch of n.children) await walk(ch, frameT, childClip, out, op);
  }
}

async function walk(n, frameT, clip, out, opacity) {
  const start = out.length;
  await walkNode(n, frameT, clip, out, opacity);
  const shadows = shadowsOf(n);
  // Child elements already carry their own ids. Preserve ids for review/rebuild decisions.
  for (let i = start; i < out.length; i++) if (!out[i].id) {
    out[i].id = n.id;
    if (shadows.length && out[i].k !== 'raster') { out[i].shadows = shadows; out[i].render = renderBox(n, frameT); }
  }
}

const frames = [];
for (const id of FRAME_IDS) {
  const f = await figma.getNodeByIdAsync(id);
  if (!f || !('children' in f)) { warnings.push(id + ': not found or not a frame'); continue; }
  const els = [];
  const fills = visiblePaints(f.fills);
  const frameShadows = shadowsOf(f);
  const bg = !frameShadows.length && fills.length === 1 && fills[0].type === 'SOLID' && (fills[0].opacity ?? 1) > 0.99 ? hex(fills[0].color) : null;
  // the frame's own fills (other than a plain background colour) become the bottom layers
  if (!bg) {
    const complexFrameShadow = frameShadows.length > 1 || (f.effects || []).some(e => e.visible !== false && e.type.includes('SHADOW') && (e.spread || (e.blendMode && e.blendMode !== 'NORMAL')));
    const why = complexFrameShadow || fills.some(p => (p.type.startsWith('GRADIENT') && p.type !== 'GRADIENT_LINEAR') || p.type === 'VIDEO' || p.type === 'PATTERN' || p.type === 'SHADER' ||
      (p.blendMode && p.blendMode !== 'NORMAL') || (p.type === 'IMAGE' && (p.scaleMode === 'TILE' || p.rotation || (p.filters && Object.values(p.filters).some(v => v))))) ? 'complex background' : null;
    if (why) {
      els.push({ k: 'raster', id: f.id, background: true, x: 0, y: 0, w: R(f.width), h: R(f.height), why,
        source: { type: f.type, fills, effects: f.effects || [] } });
    }
    else for (const p of fills) {
      if (p.type === 'SOLID') els.push({ k: 'box', id: f.id, background: true, shape: 'rect', x: 0, y: 0, w: R(f.width), h: R(f.height), rot: 0, r: 0, fill: hex(p.color), fo: p.opacity ?? 1 });
      else if (p.type === 'GRADIENT_LINEAR') els.push({ k: 'gradient', id: f.id, background: true, shape: 'rect', x: 0, y: 0, w: R(f.width), h: R(f.height), paint: p });
      else if (p.type === 'IMAGE') els.push({ k: 'img', id: f.id, background: true, x: 0, y: 0, w: R(f.width), h: R(f.height), rot: 0, r: 0, hash: p.imageHash, mode: p.scaleMode, xf: p.imageTransform, fo: p.opacity ?? 1 });
    }
  }
  if (frameShadows.length && els.length && els[0].k !== 'raster') els[0].shadows = frameShadows;
  const clip = f.clipsContent ? [0, 0, R(f.width), R(f.height)] : null;
  for (const ch of f.children) await walk(ch, f.absoluteTransform, clip, els, 1);
  // keep results small (use_figma output is cut off around 20 kB): drop clips that are just the frame itself, and defaults
  const whole = clip && clip.join();
  for (const e of els) {
    if (e.clip && e.clip.join() === whole) delete e.clip;
    if (e.fo === 1) delete e.fo;
    if (e.r === 0) delete e.r;
    if (e.segs) for (const sg of e.segs) { if (sg.o === 1) delete sg.o; if (sg.c === '#000000') delete sg.c; }
  }
  frames.push({ id: f.id, name: f.name, w: R(f.width), h: R(f.height), bg: bg || '#FFFFFF', els });
}
return { frames, warnings };
