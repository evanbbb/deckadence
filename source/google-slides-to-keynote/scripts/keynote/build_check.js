// Build a Keynote file from a deck spec and check it against the source, in one go.
//
//   osascript -l JavaScript build_check.js <deck-spec.json> <out.key> [--font-map '{"A":"B"}'] [--app com.apple.Keynote] [--no-offsets]
//
// Steps: build_pptx.js -> to_keynote.js -> fix_text_offsets.js --write -> (if anything moved) build and convert again
// -> compare.js. The hand-over .pptx is written next to the spec. Prints one JSON summary; the side-by-side pictures,
// flagged.png and report.json are in <out>-check/compare/.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);

var HERE = dirname(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)));
function step(script, args) {
  const r = sh('/usr/bin/osascript -l JavaScript ' + q(join(HERE, script)) + ' ' + args.map(q).join(' '));
  let out = {}; try { out = JSON.parse(r.out); } catch (e) { out = { raw: r.out.slice(-2000) }; }
  if (r.code !== 0) {
    $.NSFileHandle.fileHandleWithStandardOutput.writeData($(JSON.stringify({ failed: script, exit: r.code, output: out, error: r.err.slice(-2000) }, null, 1) + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
    $.exit(r.code || 1);
  }
  return out;
}

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript build_check.js <deck-spec.json> <out.key> [--font-map JSON] [--app BUNDLE_ID] [--no-offsets]';
  const spec = abspath(argv[0]), out = abspath(argv[1]);
  const fm = argv.includes('--font-map') ? ['--font-map', argOpt(argv, '--font-map')] : [];
  const app = argv.includes('--app') ? ['--app', argOpt(argv, '--app')] : [];
  const pptx = join(dirname(spec), stem(out) + '.pptx'), pngs = out.replace(/\.key$/, '') + '-check/keynote';
  const built = step('build_pptx.js', [spec, pptx, ...fm]);
  let conv = step('to_keynote.js', [pptx, out, ...app]);
  let moved = { moved: 0 };
  if (!argv.includes('--no-offsets')) {
    moved = step('fix_text_offsets.js', [spec, pngs, '--write']);
    if (moved.moved) { step('build_pptx.js', [spec, pptx, ...fm]); conv = step('to_keynote.js', [pptx, out, ...app]); }
  }
  const report = step('compare.js', [spec, pngs]);
  return JSON.stringify({ key: out, slides: conv.slides, movies: conv.movies, fonts_fixed: conv.fonts_fixed, skipped_elements: built.skipped,
    fonts_not_installed: built.fonts_not_installed, text_boxes_lined_up: moved.moved, flagged: report.flagged, fonts_missing: report.fonts_missing,
    flagged_sheet: report.flagged_sheet, worst_slides: report.worst_slides, compare_dir: join(dirname(pngs), 'compare') }, null, 1);
}
