// Build a direct PowerPoint file. Native visual checks are a separate step.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);
var HERE = dirname(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)));
function step(script, args) {
  const r = sh('/usr/bin/osascript -l JavaScript ' + q(join(HERE, script)) + ' ' + args.map(q).join(' '));
  if (r.code) throw new Error(script + ': ' + r.err + r.out);
  return JSON.parse(r.out);
}
function run(argv) {
  if (argv.length < 2) throw new Error('usage: build_check.js <spec.json> <new.pptx> [--width-in N] [--font-map JSON] [--draft]');
  const specPath = abspath(argv[0]), out = abspath(argv[1]), spec = readJSON(specPath);
  if (!spec.slides?.length || !Number.isFinite(spec.width) || !Number.isFinite(spec.height) || spec.width <= 0 || spec.height <= 0) throw new Error('explicit source dimensions and nonempty slides required');
  for (const s of spec.slides) for (const e of s.elements || []) {
    if (!['rect', 'ellipse', 'path', 'line', 'image', 'text'].includes(e.type)) throw new Error('unsupported element type: ' + e.type);
    if (e.type === 'image' && !exists(join(dirname(specPath), e.file))) throw new Error('missing image: ' + e.file);
    if (e.blur && (typeof e.blur !== 'object' || Object.keys(e.blur).some(k => !['radius','grow'].includes(k)) ||
        !Number.isFinite(e.blur.radius) || e.blur.radius < 0 || ('grow' in e.blur && typeof e.blur.grow !== 'boolean')))
      throw new Error('blur needs a nonnegative radius and optional boolean grow');
    for (const p of e.paragraphs || []) for (const r of p.runs || []) if (r.fontVariations &&
      (typeof r.fontVariations !== 'object' || Array.isArray(r.fontVariations) ||
       Object.entries(r.fontVariations).some(([axis, value]) => !/^[A-Za-z0-9]{4}$/.test(axis) || !Number.isFinite(value))))
      throw new Error('font variation axes must have four-character tags and finite numeric values');
    if (e.imageEffects) {
      const fx = e.imageEffects;
      if (e.type !== 'image' || Object.keys(fx).some(k => !['grayscale', 'duotone', 'saturation', 'brightness'].includes(k)) ||
          ('grayscale' in fx && typeof fx.grayscale !== 'boolean') ||
          ['saturation','brightness'].some(k => k in fx && (!Number.isFinite(fx[k]) || fx[k] < -1 || fx[k] > 1)) ||
          ('duotone' in fx && (!Array.isArray(fx.duotone) || fx.duotone.length !== 2 || fx.duotone.some(c => typeof c !== 'string' || !/^#?[0-9a-f]{6}$/i.test(c)))))
        throw new Error('unsupported picture effect; needs editable reconstruction');
    }
    if (e.type === 'path' && (e.d.match(/[A-Za-z]/g) || []).some(c => !'MLCQZeE'.includes(c))) throw new Error('path needs editable reconstruction: ' + e.d);
  }
  const args = [specPath, out, '--target', 'powerpoint', '--width-in', String(argOpt(argv, '--width-in', spec.physicalSize?.widthIn ?? ''))];
  if (argv.includes('--font-map')) args.push('--font-map', argOpt(argv, '--font-map'));
  if (argv.includes('--draft')) args.push('--draft');
  if (argv.includes('--resize-approved')) args.push('--resize-approved');
  const build = step('build_pptx.js', args), validation = step('validate_pptx.js', [out, '--spec', specPath]);
  return JSON.stringify({ ...build, ...validation, conversion: spec.conversion || {}, status: 'awaiting_native_render',
    incomplete: build.incomplete || !validation.structural_valid || ['unresolved_artwork', 'missing_images', 'missing_rasters', 'missing_slides', 'source_errors'].some(k => (spec.conversion?.[k] || []).length) }, null, 1);
}
