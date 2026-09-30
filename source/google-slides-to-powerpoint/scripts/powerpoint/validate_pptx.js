// Structural checks only. This does not establish PowerPoint rendering fidelity.
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);
function run(argv) {
  if (!argv.length) throw new Error('usage: validate_pptx.js <file.pptx> [--spec deck-spec.json]');
  const pptx = abspath(argv[0]);
  let tmp = pptx + '.validate';
  if (exists(tmp)) throw new Error('validation folder exists; use another output name');
  const entries = shOK('/usr/bin/unzip -Z1 ' + q(pptx)).trim().split('\n');
  if (entries.some(p => p.startsWith('/') || p.split('/').includes('..') || p.includes('\\'))) throw new Error('unsafe ZIP entry');
  shOK('/usr/bin/unzip -tq ' + q(pptx));
  mkdirp(tmp);
  // Foundation resolves /private/tmp to /tmp only when the folder exists.
  // Normalize the created root as well as its relationship targets.
  tmp = ObjC.unwrap($(tmp).stringByStandardizingPath);
  try {
    shOK('/usr/bin/unzip -q ' + q(pptx) + ' -d ' + q(tmp));
    const errors = [];
    for (const e of entries.filter(p => /\.(xml|rels)$/.test(p))) {
      const result = sh('/usr/bin/xmllint --nonet --noout ' + q(join(tmp, e)));
      if (result.code) errors.push(e + ': ' + result.err);
      if (!e.endsWith('.rels')) continue;
      const dir = e === '_rels/.rels' ? tmp : dirname(dirname(join(tmp, e)));
      for (const tag of readText(join(tmp, e)).match(/<Relationship\s[^>]*>/g) || []) {
        if (/TargetMode="External"/.test(tag)) continue;
        const m = tag.match(/Target="([^"]+)"/); if (!m) { errors.push(e + ': missing target'); continue; }
        const target = decodeURIComponent(m[1].replace(/&amp;/g, '&'));
        const path = ObjC.unwrap($(target.startsWith('/') ? tmp + target : join(dir, target)).stringByStandardizingPath);
        if (!path.startsWith(tmp + '/') || !exists(path)) errors.push(e + ': missing internal target ' + target);
      }
    }
    const slides = entries.filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length;
    const presentation = readText(join(tmp, 'ppt/presentation.xml'));
    if ((presentation.match(/<p:sldId /g) || []).length !== slides) errors.push('slide relationship count differs');
    const dims = presentation.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
    if (!dims || [Number(dims[1]), Number(dims[2])].some(n => n < 914400 || n > 51206400)) errors.push('slide dimensions outside PowerPoint limits');
    const specArg = argOpt(argv, '--spec', null);
    if (specArg) {
      const spec = readJSON(abspath(specArg));
      if (slides !== spec.slides.length) errors.push('slide count differs from spec');
      spec.slides.forEach((s, i) => {
        const xml = readText(join(tmp, 'ppt/slides/slide' + (i + 1) + '.xml'));
        const expected = (s.elements || []).length;
        const actual = (xml.match(/<p:(sp|pic)>/g) || []).length;
        if (expected !== actual) errors.push('slide ' + (i + 1) + ': object count differs (' + expected + '/' + actual + ')');
      });
    }
    return JSON.stringify({ pptx, slides, structural_valid: !errors.length, native_render_verified: false, errors }, null, 1);
  } finally { rmrf(tmp); }
}
