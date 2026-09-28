// Installed fonts, for the Keynote builder. Run with: osascript -l JavaScript list_fonts.js …
//   (no arguments)       -> {"Family": [[postscriptName, styleName, weight(0-15), traits], …], …} for every listed family
//   --families A "B C" … -> the same, for just these families ([] = not available)
//   --check X Y …        -> {"X": true, "Y": false}  (can macOS load a font with this PostScript name?)
// Ask for families by name rather than trusting the full list: fonts activated by a font service (Adobe Fonts,
// Creative Cloud) load fine but are left out of the full list.
ObjC.import('AppKit');
function run(argv) {
  const fm = $.NSFontManager.sharedFontManager;
  const members = f => (ObjC.deepUnwrap(fm.availableMembersOfFontFamily(f)) || []).map(m => [m[0], m[1], m[2], m[3]]);
  const out = {};
  if (argv[0] === '--check') {
    for (const n of argv.slice(1)) out[n] = !$.NSFont.fontWithNameSize(n, 12).isNil();
  } else if (argv[0] === '--families') {
    for (const f of argv.slice(1)) out[f] = members(f);
  } else {
    for (const f of ObjC.deepUnwrap(fm.availableFontFamilies)) out[f] = members(f);
  }
  return JSON.stringify(out);
}
