// Development checks: node --test source/tests/fidelity.test.js
// Production converters still use only macOS built-in tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const paint = { type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
  { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
] };
const solid = { type: 'SOLID', color: { r: 1, g: 0, b: 0 } };
function node(id, type, more = {}) {
  return { id, type, name: id, visible: true, opacity: 1, width: 1920, height: 1080,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]], absoluteRenderBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    fills: [solid], strokes: [], effects: [], ...more };
}
async function read(frame) {
  const figma = { mixed: Symbol('mixed'), getNodeByIdAsync: async () => frame };
  return new AsyncFunction('figma', 'FRAME_IDS', fs.readFileSync(path.join(root, 'figma-to-keynote/scripts/read_figma_frames.js'), 'utf8'))(figma, [frame.id]);
}
function text() {
  return { k: 'text', id: '1:9', x: 10, y: 10, w: 200, h: 40, ha: 'LEFT', va: 'TOP',
    segs: [{ s: 'Keep me editable', f: 'Helvetica', st: 'Regular', sz: 24 }] };
}
test('gradient backgrounds retain their stops and editable foreground text', async () => {
  const child = node('1:9', 'TEXT', { getStyledTextSegments: () => [{ characters: 'Keep me editable', fontName: { family: 'Helvetica', style: 'Regular', variationSettings: {wght:400,opsz:14} },
    fontSize: 24, fills: [solid], textDecoration: 'NONE', lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, textCase: 'ORIGINAL' }] });
  const output = await read(node('1:1', 'FRAME', { fills: [paint], children: [child] }));
  assert.equal(output.frames[0].els[0].k, 'gradient');
  assert.deepEqual(output.frames[0].els[0].paint.gradientStops, paint.gradientStops);
  assert.equal(output.frames[0].els[1].k, 'text');
  assert.deepEqual(output.frames[0].els[1].segs[0].axes, {wght:400,opsz:14});
  assert.equal(output.warnings.length, 0);
});
test('complex background is flagged without replacing it with a solid colour or flattening its text', async () => {
  const result = await read(node('1:1', 'FRAME', { fills: [{ ...paint, type: 'GRADIENT_RADIAL' }], children: [node('1:2', 'RECTANGLE')] }));
  assert.equal(result.frames[0].els[0].background, true);
  assert.equal(result.frames[0].els[0].k, 'raster');
  assert.equal(result.frames[0].els[1].k, 'box');
});
test('simple shadows retain their parameters; spread shadows are flagged for reconstruction', async () => {
  const shadow = { type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.4 }, offset: { x: 8, y: 12 }, radius: 16, spread: 0, blendMode: 'NORMAL' };
  const result = await read(node('1:1', 'FRAME', { children: [node('1:2', 'RECTANGLE', { effects: [shadow] }), node('1:3', 'RECTANGLE', { effects: [{ ...shadow, spread: 4 }] })] }));
  assert.deepEqual(result.frames[0].els[0].shadows[0], { type: 'outer', color: '#000000', opacity: 0.4, blur: 16, x: 8, y: 12 });
  assert.equal(result.frames[0].els[1].k, 'raster');
  assert.equal(result.frames[0].els[1].source.effects[0].spread, 4);
});
test('background helper creates only isolated artwork and cleans up an export setup failure', async () => {
  const frame = node('1:1', 'FRAME', { fills: [paint], children: [], x: 0, y: 0 });
  const page = { type: 'PAGE', children: [frame] }; frame.parent = page;
  let temp, removed = false;
  const figma = { getNodeByIdAsync: async () => frame, setCurrentPageAsync: async () => {}, createRectangle: () => {
    temp = { id: 'temp:1', resize(w, h) { this.width = w; this.height = h; }, remove() { removed = true; } }; page.children.push(temp); return temp;
  } };
  const fn = new AsyncFunction('figma', 'FRAME_ID', fs.readFileSync(path.join(root, 'figma-to-keynote/scripts/create_background_artwork.js'), 'utf8'));
  const result = await fn(figma, frame.id);
  assert.deepEqual(result.createdNodeIds, ['temp:1']);
  assert.equal(temp.fills, frame.fills);
  assert.equal(temp.children, undefined);
  assert.deepEqual(frame.fills, [paint]);
  figma.createRectangle = () => ({ resize() { throw new Error('export setup failed'); }, remove() { removed = true; } });
  await assert.rejects(fn(figma, frame.id), /export setup failed/);
  assert.equal(removed, true);
});

const mac = process.platform === 'darwin';
function jxa(script, args) { return execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', path.join(root, script), ...args], { encoding: 'utf8' }); }
test('converter tries rebuilds first and flattens only explicitly selected isolated backgrounds', { skip: !mac }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'deckadence-fidelity-'));
  try {
    const frame = { id: '1:1', name: 'Background', w: 1920, h: 1080, bg: '#FFFFFF', els: [
      { k: 'raster', id: '1:1', background: true, x: 0, y: 0, w: 1920, h: 1080, why: 'complex background', source: { fills: [paint] } }, text()
    ] };
    fs.writeFileSync(path.join(work, 'frames.json'), JSON.stringify({ frames: [frame] }));
    const convert = (...args) => JSON.parse(jxa('figma-to-keynote/scripts/figma_to_spec.js', [work, ...args]));
    const spec = () => JSON.parse(fs.readFileSync(path.join(work, 'deck-spec.json'), 'utf8'));
    let result = convert();
    assert.equal(result.incomplete, true);
    assert.equal(result.flattened_artwork.length, 0);
    assert.equal(spec().slides[0].elements[0].type, 'text');
    fs.writeFileSync(path.join(work, 'rebuilds.json'), JSON.stringify({ '1:1:background': [{ type: 'rect', x: 0, y: 0, w: 1920, h: 1080,
      gradient: { transform: paint.gradientTransform, stops: paint.gradientStops }, shadows: [{ type: 'outer', color: '#000000', opacity: 0.4, blur: 8, x: 4, y: 6 }] }] }));
    result = convert();
    assert.equal(result.incomplete, false);
    assert.equal(spec().slides[0].elements[0].type, 'rect');
    assert.equal(spec().slides[0].elements[1].type, 'text');
    result = convert('--approved-rasters', '1:1:background');
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.missing_rasters, ['1:1:background']);
    // An isolated background is required even when a whole-slide reference exists.
    const helper = path.join(work, 'fixture.js');
    fs.writeFileSync(helper, "ObjC.import('Foundation');(0,eval)($.NSString.stringWithContentsOfFileEncodingError(" + JSON.stringify(path.join(root, 'shared/keynote/lib.js')) + ",$.NSUTF8StringEncoding,null).js);function run(argv){savePixels({w:2,h:2,rgb:new Uint8Array(12).fill(128)},argv[0]);}");
    execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', helper, path.join(work, 'raster/1-1-background.png')]);
    result = convert('--approved-rasters', '1:1:background');
    assert.equal(result.incomplete, false);
    assert.equal(result.flattened_artwork.length, 1);
    assert.equal(spec().slides[0].elements[0].file, 'raster/1-1-background.png');
    assert.equal(spec().slides[0].elements[1].paragraphs[0].runs[0].text, 'Keep me editable');
    // Build a real package and inspect its slide content, independent of the reader.
    const pptx = path.join(work, 'native.pptx');
    convert();
    const output = JSON.parse(jxa('shared/keynote/build_pptx.js', [path.join(work, 'deck-spec.json'), pptx]));
    assert.deepEqual(output.skipped, []);
    const xml = execFileSync('/usr/bin/unzip', ['-p', pptx, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
    assert.match(xml, /<a:gradFill/);
    assert.match(xml, /<a:outerShdw/);
    assert.match(xml, /Keep me editable/);
    assert.doesNotMatch(xml, /<p:pic>/);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});
test('Full HD comparison flags a small local defect and checks the final pixels', { skip: !mac }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'deckadence-compare-'));
  try {
    const helper = path.join(work, 'fixture.js');
    fs.writeFileSync(helper, "ObjC.import('Foundation');(0,eval)($.NSString.stringWithContentsOfFileEncodingError(" + JSON.stringify(path.join(root, 'shared/keynote/lib.js')) + ",$.NSUTF8StringEncoding,null).js);function run(argv){const w=1920,h=1080,rgb=new Uint8Array(w*h*3).fill(255);savePixels({w,h,rgb},join(argv[0],'ref.png'));for(let y=h-32;y<h;y++)for(let x=w-32;x<w;x++){let i=(y*w+x)*3;rgb[i]=rgb[i+1]=rgb[i+2]=0;}savePixels({w,h,rgb},join(argv[0],'keynote/s01.png'));}");
    execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', helper, work]);
    const specPath = path.join(work, 'deck-spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ width: 1920, height: 1080, slides: [{ ref: 'ref.png', elements: [] }] }));
    const result = JSON.parse(jxa('shared/keynote/compare.js', [specPath, path.join(work, 'keynote')]));
    assert.deepEqual(result.comparison_resolution, { w: 1920, h: 1080 });
    assert.deepEqual(result.flagged, [1]);
    assert.deepEqual(result.low_resolution_slides, []);
    // Non-widescreen comparisons preserve aspect ratio and report undersized sources.
    fs.writeFileSync(specPath, JSON.stringify({ width: 4, height: 3, slides: [{ ref: 'ref.png', elements: [] }] }));
    const portrait = JSON.parse(jxa('shared/keynote/compare.js', [specPath, path.join(work, 'keynote'), '--width', '1920']));
    assert.equal(portrait.comparison_resolution.h, 1440);
    assert.deepEqual(portrait.low_resolution_slides, [1]);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('Google native paths preserve Bezier curves, relative coordinates and shorthand controls',()=>{
  const source=fs.readFileSync(path.join(root,'shared/google-slides/extract_deck_inpage.js'),'utf8');
  const fn=source.match(/  function exactPath\(d, m, toSlide\) \{[\s\S]*?\n  \}/)[0];
  const convert=new Function(fn+'\nreturn exactPath;')();
  const m={a:2,b:0,c:0,d:3,e:10,f:20}, toSlide=(x,y)=>({x,y});
  assert.equal(convert('m1 2 c1 2 3 4 5 6 s7 8 9 10 q1 2 3 4 t5 6 h2 v3 z',m,toSlide),
    'M 12 26 C 14 32 18 38 22 44 C 26 50 36 68 40 74 Q 42 80 46 86 Q 50 92 56 104 L 60 104 L 60 113 Z');
  assert.equal(convert('M1e1 -2e0 L20 30',m,toSlide),'M 30 14 L 50 110');
  assert.equal(convert('M0 0 A10 20 0 0 1 30 40',m,toSlide),null);
  assert.equal(convert('M0 0 C1 2',m,toSlide),null);
});
test('Google reference export renders the vector source at Full HD and embeds external images', async () => {
  const source = fs.readFileSync(path.join(root, 'shared/google-slides/extract_deck_inpage.js'), 'utf8');
  const fn = source.match(/  async function referenceImage\(pid, n\) \{[\s\S]*?\n  \}/)[0];
  const X = { warnings: [] }, image = { attributes: { href: 'https://example.com/image.png' },
    getAttribute(name) { return this.attributes[name]; }, getAttributeNS() { return null; }, setAttribute(name, value) { this.attributes[name] = value; }, setAttributeNS(ns, name, value) { this.attributes[name] = value; } };
  const doc = { documentElement: { localName: 'svg' }, querySelector: () => null, querySelectorAll: () => [image] };
  let drawn, closed = false, embeddedSvg;
  const document = { fonts: { ready: Promise.resolve() }, createElement: () => {
    const canvas = { getContext: () => ({ drawImage(...args) { drawn = args.slice(1); } }), toBlob(cb) { cb(new Blob(['rendered PNG'])); } }; return canvas;
  } };
  class URLMock extends URL { static createObjectURL(blob) { embeddedSvg = blob; return 'blob:reference'; } static revokeObjectURL() { closed = true; } }
  class ImageMock { naturalWidth = 960; naturalHeight = 539.5; set src(value) { queueMicrotask(() => this.onload()); } }
  class FileReaderMock { readAsDataURL(blob) { assert.ok(blob instanceof Blob); this.result = 'data:image/png;base64,aW1hZ2U='; queueMicrotask(() => this.onload()); } }
  const names = ['opts', 'deckId', 'X', 'fetch', 'DOMParser', 'FileReader', 'document', 'URL', 'XMLSerializer', 'Image', 'Blob', 'createImageBitmap'];
  const run = new AsyncFunction(...names, fn + '\nreturn referenceImage("slide1", 1);');
  const result = await run({ refWidth: 1920,sourceSize:{widthIn:20,heightIn:11.25} }, 'deck1', X,
    async url => ({ ok: true, url: new URL(String(url), 'https://docs.google.com').href, text: async () => '<svg><image xlink:href="https://example.com/image.png?x=1&amp;y=2"/></svg>', blob: async () => new Blob(['image']) }),
    class { parseFromString() { throw new Error('TrustedHTML assignment required'); } }, FileReaderMock, document, URLMock,
    class { serializeToString() { assert.match(image.attributes.href, /^data:/); return '<svg/>'; } }, ImageMock, Blob,
    () => { throw new Error('Should not use bitmap fallback'); });
  assert.ok(result instanceof Blob);
  assert.match(await embeddedSvg.text(), /xlink:href="data:image\/png;base64,aW1hZ2U="/);
  assert.deepEqual(drawn, [0, 0, 1920, 1080]);
  assert.equal(closed, true);
  assert.deepEqual(X.warnings, []);
});
test('Google reference fallback reports small PNGs without enlarging them', async () => {
  const source = fs.readFileSync(path.join(root, 'shared/google-slides/extract_deck_inpage.js'), 'utf8');
  const fn = source.match(/  async function referenceImage\(pid, n\) \{[\s\S]*?\n  \}/)[0];
  const X = { warnings: [] }, original = new Blob(['original PNG']);
  let closed = false;
  const run = new AsyncFunction('opts', 'deckId', 'X', 'fetch', 'createImageBitmap', fn + '\nreturn referenceImage("slide1", 1);');
  const result = await run({ refWidth: 1920 }, 'deck1', X,
    async url => url.includes('/svg?') ? { ok: false, status: 503 } : { ok: true, blob: async () => original },
    async blob => { assert.equal(blob, original); return { width: 960, height: 540, close() { closed = true; } }; });
  assert.equal(result, original);
  assert.equal(closed, true);
  assert.equal(X.warnings.length, 2);
  assert.match(X.warnings[1], /960x540/);
});
