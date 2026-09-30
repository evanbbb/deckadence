// Compare PNGs exported by PowerPoint, tied to this exact PPTX by a manifest.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);
function run(argv) {
  if (argv.length < 3) throw new Error('usage: check_render.js <spec.json> <pptx> <native-render-dir> [--width 1920]');
  const spec = abspath(argv[0]), pptx = abspath(argv[1]), pngs = abspath(argv[2]), m = readJSON(join(pngs, 'render-manifest.json'));
  const n = readJSON(spec).slides.length;
  if (m.renderer !== 'PowerPoint' || !m.version || m.pptx_sha1.toLowerCase() !== sha1(pptx).toLowerCase() || m.slides !== n) throw new Error('native render manifest does not match this PowerPoint file');
  for (let i = 1; i <= n; i++) if (!exists(join(pngs, 's' + String(i).padStart(2, '0') + '.png'))) throw new Error('missing native slide ' + i);
  const script = join(dirname(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a))), 'compare.js');
  const r = sh('/usr/bin/osascript -l JavaScript ' + q(script) + ' ' + [spec, pngs, '--renderer', 'PowerPoint', '--width', argOpt(argv, '--width', '1920')].map(q).join(' '));
  if (r.code) throw new Error(r.err);
  return JSON.stringify({ ...JSON.parse(r.out), native_render_present: true, native_environment: { version: m.version, platform: m.platform },
    visual_review_required: true, native_render_verified: false }, null, 1);
}
