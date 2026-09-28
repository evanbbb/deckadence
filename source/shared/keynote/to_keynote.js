// Open a hand-over .pptx in Keynote, set again the fonts its importer gets wrong, save a real .key, and export every
// slide as a PNG for checking.
//
//   osascript -l JavaScript to_keynote.js <in.pptx> <out.key> [--png-dir <dir>] [--app com.apple.Keynote] [--wait 180]
//
// Defaults: PNGs go to <out>-check/keynote/ (s01.png, s02.png …); the app is Keynote Creator Studio (bundle id
// com.apple.Keynote); pass --app com.apple.iWork.Keynote for the older standalone Keynote.
// Also writes <png-dir>/../keynote-objects.json: what Keynote made of each slide (object kinds, the font of each text
// box), so a font Keynote swapped is caught even when it looks similar.
// The first run may make macOS ask whether the terminal may control Keynote. If Keynote shows a dialog ("can't be
// imported", a warnings window), the document never appears: after --wait seconds this prints what to ask the user
// and exits with status 2 (the JSON has "error" and "ask_user").
ObjC.import('Foundation');
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(ObjC.unwrap($.NSProcessInfo.processInfo.arguments).map(ObjC.unwrap).find(a => /\.js$/.test(a)).replace(/[^/]*$/, 'lib.js'), $.NSUTF8StringEncoding, null).js);

function fail(obj, code) { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(JSON.stringify(obj, null, 1) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); $.exit(code); }

function step(label, fn) { try { return fn(); } catch (e) { throw new Error(label + ': ' + e.message); } }

function run(argv) {
  if (argv.length < 2) return 'usage: osascript -l JavaScript to_keynote.js <in.pptx> <out.key> [--png-dir DIR] [--app BUNDLE_ID] [--wait SECONDS]';
  const src = abspath(argv[0]), out = abspath(argv[1]);
  const appId = argOpt(argv, '--app', 'com.apple.Keynote'), wait = +argOpt(argv, '--wait', 180);
  const check = out.replace(/\.key$/, '') + '-check';
  const pngDir = abspath(argOpt(argv, '--png-dir', join(check, 'keynote')));
  const name = stem(src);
  const KN = Application(appId);
  const names = () => { try { return KN.documents.name(); } catch (e) { return []; } };
  if (names().includes(name)) fail({ error: `Keynote already has a document called "${name}" open. Close it (or rename the .pptx) and run again.` }, 1);
  shOK(`/usr/bin/open -b ${q(appId)} ${q(src)}`);
  const t0 = Date.now();
  while (!names().includes(name)) {
    if (Date.now() - t0 > wait * 1000) fail({ error: 'Keynote did not open the file in time.', ask_user: 'Please look at Keynote. Is there a dialog (for example "can\'t be imported", or a sign-in or update prompt)? Tell me what it says, then click OK.' }, 2);
    sleep(2);
  }
  sleep(2);  // let the import settle (media are converted in the background)
  // refer to the document by id: saving as .key renames it ("deck" -> "deck.key")
  const docId = KN.documents.byName(name).id();
  const doc = () => KN.documents.byId(docId);

  // italic runs the importer turned upright (build_pptx.js lists them)
  let fixed = 0;
  const fixPath = src + '.fixups.json';
  if (exists(fixPath)) {
    // setting fonts on a character range is only dependable in AppleScript: write one and run it
    const lines = [];
    for (const f of readJSON(fixPath).fonts || [])
      for (const [a, b, font] of f.ranges)
        lines.push(`try\n set font of characters ${a} thru ${b} of object text of text item ${f.item} of slide ${f.slide} of d to "${font.replace(/"/g, '')}"\n set n to n + 1\nend try`);
    for (let k = 0; k < lines.length; k += 200) {
      const as = join(dirname(out), '.fixups-' + name + '.applescript');
      writeText(as, `with timeout of 600 seconds\ntell application id "${appId}"\n set d to document id "${docId}"\n set n to 0\n${lines.slice(k, k + 200).join('\n')}\n return n\nend tell\nend timeout`);
      const r = sh('/usr/bin/osascript ' + q(as)); rmrf(as);
      fixed += parseInt(r.out, 10) || 0;
    }
  }

  rmrf(out);
  const tmpPng = pngDir + '.tmp'; rmrf(tmpPng); rmrf(pngDir);
  mkdirp(dirname(pngDir));   // Keynote's export fails if the parent folder is missing
  step('save', () => KN.save(doc(), { in: Path(out) }));
  step('export', () => KN.export(doc(), { to: Path(tmpPng), as: 'slide images' }));   // PNG at slide size by default (its properties record won't convert from JavaScript)

  // what Keynote made of each slide
  const objects = {};
  const d = doc(), nSlides = d.slides.length;
  // (the mixed "iWork items" list doesn't convert to JavaScript: read each kind on its own)
  const KINDS = [['textItems', 'textitem'], ['shapes', 'shape'], ['images', 'image'], ['movies', 'movie'], ['lines', 'line'], ['groups', 'group'], ['tables', 'table'], ['charts', 'chart']];
  for (let i = 0; i < nSlides; i++) {
    const sl = d.slides[i], list = [];
    for (const [prop, kind] of KINDS) {
      let n = 0; try { n = sl[prop].length; } catch (e) {}
      for (let k = 0; k < n; k++) {
        let font = null, empty = false;
        if (kind === 'textitem' || kind === 'shape') { try { const t = sl[prop][k].objectText(); if (t) font = sl[prop][k].objectText.font(); else empty = kind === 'textitem'; } catch (e) {} }
        if (!empty) list.push({ kind, font });   // (hidden empty title/body placeholders count as text items)
      }
    }
    objects[i + 1] = list;
  }
  const size = `${d.width()} x ${d.height()}`;
  step('close', () => KN.close(doc(), { saving: 'no' }));

  // Keynote names exports "<folder>.001.png" … (sometimes inside a sub-folder): normalise to sNN.png
  mkdirp(pngDir);
  let exported = 0;
  const walk = dir => { for (const f of listDir(dir)) { const p = join(dir, f); if (isDir(p)) walk(p); else { const m = f.match(/(\d+)\.png$/); if (m) { moveFile(p, join(pngDir, 's' + String(+m[1]).padStart(2, '0') + '.png')); exported++; } } } };
  walk(tmpPng); rmrf(tmpPng);
  writeJSON(join(dirname(pngDir), 'keynote-objects.json'), objects);
  return JSON.stringify({ fonts_fixed: fixed, key: out, size, slides: nSlides, pngs: pngDir, exported,
    movies: Object.values(objects).reduce((a, l) => a + l.filter(o => o.kind === 'movie').length, 0) }, null, 1);
}
