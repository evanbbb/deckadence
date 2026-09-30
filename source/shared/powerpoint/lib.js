// Shared helpers for the Keynote builder scripts. Everything here uses only what ships with macOS:
// JavaScript for Automation (osascript -l JavaScript), Foundation/AppKit/ImageIO, and /usr/bin tools (zip, unzip, sips,
// curl, shasum). No Python, no packages to install, no admin rights.
//
// Each script loads this file first:   eval(libSource())   (see the two-line loader at the top of every script)
ObjC.import('Foundation'); ObjC.import('AppKit'); ObjC.import('ImageIO'); ObjC.import('CoreGraphics');

var FM = $.NSFileManager.defaultManager;
var exists = p => FM.fileExistsAtPath(p);
var isDir = p => { const d = Ref(); return FM.fileExistsAtPathIsDirectory(p, d) && d[0]; };
var readText = p => { const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null); if (s.isNil()) throw new Error('cannot read ' + p); return s.js; };
var writeText = (p, s) => { mkdirp(dirname(p)); if (!$(s).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null)) throw new Error('cannot write ' + p); };
var readJSON = p => JSON.parse(readText(p));
var writeJSON = (p, v) => writeText(p, JSON.stringify(v, null, 1));
var mkdirp = p => { if (p && !exists(p)) FM.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(p, true, $(), null); };
var rmrf = p => { if (exists(p)) FM.removeItemAtPathError(p, null); };
var listDir = p => exists(p) ? ObjC.deepUnwrap(FM.contentsOfDirectoryAtPathError(p, null)) || [] : [];
var copyFile = (a, b) => { mkdirp(dirname(b)); rmrf(b); if (!FM.copyItemAtPathToPathError(a, b, null)) throw new Error('cannot copy ' + a); };
var moveFile = (a, b) => { mkdirp(dirname(b)); rmrf(b); if (!FM.moveItemAtPathToPathError(a, b, null)) throw new Error('cannot move ' + a); };
var dirname = p => p.replace(/\/[^/]*$/, '') || '/';
var basename = p => p.replace(/^.*\//, '');
var stem = p => basename(p).replace(/\.[^.]*$/, '');
var extname = p => (basename(p).match(/\.[^.]*$/) || [''])[0].toLowerCase();
var join = (...a) => a.filter(Boolean).join('/').replace(/\/+/g, '/');
var abspath = p => p.startsWith('/') ? p : (p.startsWith('~') ? $(p).stringByExpandingTildeInPath.js : join($.NSFileManager.defaultManager.currentDirectoryPath.js, p));
var relpath = (p, base) => p.startsWith(base + '/') ? p.slice(base.length + 1) : p;
var fileSize = p => ObjC.unwrap(FM.attributesOfItemAtPathError(p, null).fileSize) || 0;
var q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";   // shell quoting

// Run a shell command; returns {code, out, err}. (doShellScript turns newlines into \r, so use NSTask.)
function sh(cmd) {
  const t = $.NSTask.alloc.init, o = $.NSPipe.pipe, e = $.NSPipe.pipe;
  t.launchPath = '/bin/sh'; t.arguments = ['-c', cmd]; t.standardOutput = o; t.standardError = e;
  t.launch;
  const out = $.NSString.alloc.initWithDataEncoding(o.fileHandleForReading.readDataToEndOfFile, $.NSUTF8StringEncoding).js;
  const err = $.NSString.alloc.initWithDataEncoding(e.fileHandleForReading.readDataToEndOfFile, $.NSUTF8StringEncoding).js;
  t.waitUntilExit;
  return { code: t.terminationStatus, out, err };
}
function shOK(cmd) { const r = sh(cmd); if (r.code !== 0) throw new Error(cmd.slice(0, 80) + ': ' + (r.err || r.out).slice(0, 500)); return r.out; }
var sleep = s => $.NSThread.sleepForTimeInterval(s);
var argOpt = (argv, name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
var round1 = v => Math.round(v * 10) / 10;

// ---- colours ----
function parseColor(c) {
  if (!c) return null;
  c = String(c).trim();
  let m = c.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]].map(v => Math.max(0, Math.min(255, Math.round(v))));
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  if (!/^[0-9a-f]{6}/i.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
}
var hex6 = c => { const v = parseColor(c); return v ? v.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase() : null; };

// ---- fonts (NSFontManager: families and their faces) ----
// Ask for families by name: fonts from a font service (Adobe Fonts) load fine but are missing from the full list.
function fontFaces(family) {
  const m = ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableMembersOfFontFamily(family));
  return (m || []).map(x => ({ ps: x[0], style: x[1], weight: x[2], traits: x[3] }));
}
var fontLoadable = ps => !$.NSFont.fontWithNameSize(ps, 12).isNil();
var allFontFamilies = () => ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies) || [];

// ---- images ----
function imageSize(path) {
  const src = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(path), null);
  const img = src && $.CGImageSourceCreateImageAtIndex(src, 0, null);
  if (!img) return null;
  return { w: $.CGImageGetWidth(img), h: $.CGImageGetHeight(img), frames: +$.CGImageSourceGetCount(src) };
}

// base64 <-> bytes (JavaScriptCore in osascript has no atob/btoa)
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var B64I = (() => { const t = new Uint8Array(256); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();
function b64decode(s) {
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const n = Math.floor(s.length * 3 / 4), out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 3 < s.length + 3 && o < n; i += 4) {
    const a = B64I[s.charCodeAt(i)], b = B64I[s.charCodeAt(i + 1)], c = B64I[s.charCodeAt(i + 2)] || 0, d = B64I[s.charCodeAt(i + 3)] || 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = v >> 16 & 255; if (o < n) out[o++] = v >> 8 & 255; if (o < n) out[o++] = v & 255;
  }
  return out;
}
function b64encode(u8) {
  const parts = []; let chunk = '';
  for (let i = 0; i < u8.length; i += 3) {
    const v = (u8[i] << 16) | ((u8[i + 1] || 0) << 8) | (u8[i + 2] || 0);
    chunk += B64[v >> 18 & 63] + B64[v >> 12 & 63] + (i + 1 < u8.length ? B64[v >> 6 & 63] : '=') + (i + 2 < u8.length ? B64[v & 63] : '=');
    if (chunk.length > 65536) { parts.push(chunk); chunk = ''; }
  }
  parts.push(chunk); return parts.join('');
}

// Load a picture as sRGB pixels at W x H, flattened on white: {w, h, rgb: Uint8Array(w*h*3)}.
// Drawing into an sRGB context converts colour profiles (Keynote exports Display P3).
function cgImage(path) {
  const src = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(path), null);
  const img = src && $.CGImageSourceCreateImageAtIndex(src, 0, null);
  if (!img) throw new Error('cannot open image ' + path);
  return img;
}
function loadPixels(path, W, H) {
  const cg = cgImage(path);
  if (!W) { W = $.CGImageGetWidth(cg); H = $.CGImageGetHeight(cg); }
  const cs = $.CGColorSpaceCreateWithName($.kCGColorSpaceSRGB);
  const ctx = $.CGBitmapContextCreate(null, W, H, 8, W * 4, cs, 1 /* premultiplied last */);
  $.CGContextSetRGBFillColor(ctx, 1, 1, 1, 1); $.CGContextFillRect(ctx, $.CGRectMake(0, 0, W, H));
  $.CGContextSetInterpolationQuality(ctx, 3);
  $.CGContextDrawImage(ctx, $.CGRectMake(0, 0, W, H), cg);
  const rep = $.NSBitmapImageRep.alloc.initWithCGImage($.CGBitmapContextCreateImage(ctx));
  const bmp = b64decode(rep.representationUsingTypeProperties($.NSBitmapImageFileTypeBMP, $.NSDictionary.dictionary).base64EncodedStringWithOptions(0).js);
  const off = bmp[10] | bmp[11] << 8 | bmp[12] << 16 | bmp[13] << 24;
  const bw = bmp[18] | bmp[19] << 8 | bmp[20] << 16 | bmp[21] << 24;
  let bh = bmp[22] | bmp[23] << 8 | bmp[24] << 16 | bmp[25] << 24;
  const bpp = bmp[28] | bmp[29] << 8, topDown = bh < 0; bh = Math.abs(bh);
  const Bpp = bpp / 8, stride = Math.ceil(bw * Bpp / 4) * 4, rgb = new Uint8Array(bw * bh * 3);
  for (let y = 0; y < bh; y++) {
    const row = off + (topDown ? y : bh - 1 - y) * stride;
    for (let x = 0; x < bw; x++) { const s = row + x * Bpp, d = (y * bw + x) * 3; rgb[d] = bmp[s + 2]; rgb[d + 1] = bmp[s + 1]; rgb[d + 2] = bmp[s]; }
  }
  return { w: bw, h: bh, rgb };
}
// Write {w, h, rgb} (or rgba with .a) as a PNG.
function savePixels(px, path) {
  const w = px.w, h = px.h, stride = w * 4, head = 54, size = head + stride * h, b = new Uint8Array(size);
  const set32 = (o, v) => { b[o] = v & 255; b[o + 1] = v >> 8 & 255; b[o + 2] = v >> 16 & 255; b[o + 3] = v >> 24 & 255; };
  b[0] = 66; b[1] = 77; set32(2, size); set32(10, head); set32(14, 40); set32(18, w); set32(22, h); b[26] = 1; b[28] = 32; set32(34, stride * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 3, d = head + (h - 1 - y) * stride + x * 4;
    b[d] = px.rgb[s + 2]; b[d + 1] = px.rgb[s + 1]; b[d + 2] = px.rgb[s]; b[d + 3] = 255;
  }
  const data = $.NSData.alloc.initWithBase64EncodedStringOptions(b64encode(b), 0);
  const rep = $.NSBitmapImageRep.imageRepWithData(data);
  mkdirp(dirname(path));
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary).writeToFileAtomically(path, true);
}
function grayOf(px) { const g = new Float32Array(px.w * px.h); for (let i = 0; i < g.length; i++) g[i] = 0.299 * px.rgb[i * 3] + 0.587 * px.rgb[i * 3 + 1] + 0.114 * px.rgb[i * 3 + 2]; return g; }

// Crop / mirror / mask an animated GIF frame by frame with ImageIO, keeping every frame, its timing and the loop.
// crop: {x, y, w, h} in the GIF's pixels; flipH/flipV; mask: 'ellipse' | {r} (rounded box) | [[x,y]…] (outline, GIF px).
function editGif(src, dst, o) {
  const s = $.CGImageSourceCreateWithURL($.NSURL.fileURLWithPath(src), null), n = $.CGImageSourceGetCount(s);
  const out = $.CGImageDestinationCreateWithURL($.NSURL.fileURLWithPath(dst), $('com.compuserve.gif'), n, null);
  $.CGImageDestinationSetProperties(out, $.CGImageSourceCopyProperties(s, null));
  for (let i = 0; i < n; i++) {
    let img = $.CGImageSourceCreateImageAtIndex(s, i, null);
    const W = $.CGImageGetWidth(img), H = $.CGImageGetHeight(img);
    const c = o.crop || { x: 0, y: 0, w: W, h: H };
    if (o.crop) img = $.CGImageCreateWithImageInRect(img, $.CGRectMake(c.x, c.y, c.w, c.h));
    const w = Math.round(c.w), h = Math.round(c.h);
    const ctx = $.CGBitmapContextCreate(null, w, h, 8, 0, $.CGColorSpaceCreateDeviceRGB(), 1);
    if (o.mask) {
      if (o.mask === 'ellipse') $.CGContextAddEllipseInRect(ctx, $.CGRectMake(0, 0, w, h));
      else if (Array.isArray(o.mask)) { o.mask.forEach(([x, y], k) => k ? $.CGContextAddLineToPoint(ctx, x, h - y) : $.CGContextMoveToPoint(ctx, x, h - y)); $.CGContextClosePath(ctx); }
      else { const p = $.CGPathCreateWithRoundedRect($.CGRectMake(0, 0, w, h), Math.min(o.mask.r, w / 2), Math.min(o.mask.r, h / 2), null); $.CGContextAddPath(ctx, p); }
      $.CGContextClip(ctx);
    }
    $.CGContextTranslateCTM(ctx, o.flipH ? w : 0, o.flipV ? h : 0);
    $.CGContextScaleCTM(ctx, o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    $.CGContextDrawImage(ctx, $.CGRectMake(0, 0, w, h), img);
    $.CGImageDestinationAddImage(out, $.CGBitmapContextCreateImage(ctx), $.CGImageSourceCopyPropertiesAtIndex(s, i, null));
  }
  if (!$.CGImageDestinationFinalize(out)) throw new Error('could not write ' + dst);
  return n;
}
// Crop a still picture to a PNG (for cut-outs from a slide picture). box in the picture's pixels.
function cropImage(src, dst, box) {
  const cg = $.CGImageCreateWithImageInRect(cgImage(src), $.CGRectMake(box.x, box.y, box.w, box.h));
  const rep = $.NSBitmapImageRep.alloc.initWithCGImage(cg);
  mkdirp(dirname(dst));
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary).writeToFileAtomically(dst, true);
}
function sha1(path) {
  const r = sh('/usr/bin/shasum -a 1 ' + q(path));
  if (r.code === 0) return r.out.split(/\s/)[0];
  return shOK('/usr/bin/openssl dgst -sha1 -r ' + q(path)).split(/\s/)[0];
}
