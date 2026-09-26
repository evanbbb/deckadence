// Find-and-replace text on ONE Figma page without losing styling (colour highlights, links, fonts stay intact).
// Use as the code of a use_figma call. Edit PAGE_ID and FIXES, run once per page (pages can run in parallel calls).
//
// FIXES rows: [find, replace, caseInsensitive?, notFollowedBy?]
//   caseInsensitive: 1 to also match "SEPERATE IT" / "Seperate it" — the replacement copies the match's capitalisation
//   notFollowedBy:   skip a match if the text right after it starts with this (e.g. don't add "sees" twice)
// Returns how many replacements each row made. A row with 0 usually means the builder already reworded that text:
// search for it before assuming anything.
const PAGE_ID = '123:45';
const FIXES = [
  ['seperate', 'separate', 1],
  ['a exterior', 'an exterior'],
];
const page = await figma.getNodeByIdAsync(PAGE_ID); await figma.setCurrentPageAsync(page);
const texts = page.findAllWithCriteria({ types: ['TEXT'] }); const res = [];
for (const [a, b, ci, nf] of FIXES) {
  let n = 0;
  for (const t of texts) {
    let s = t.characters;
    const find = from => ci ? s.toLowerCase().indexOf(a.toLowerCase(), from) : s.indexOf(a, from);
    let i = find(0);
    while (i >= 0) {
      if (nf && s.substr(i + a.length, nf.length) === nf) { i = find(i + a.length); continue; }
      for (const f of t.getRangeAllFontNames(0, s.length)) await figma.loadFontAsync(f);
      let rep = b;
      if (ci) { const o = s.substr(i, a.length); rep = o === o.toUpperCase() && o !== o.toLowerCase() ? b.toUpperCase() : (o[0] === o[0].toUpperCase() ? b[0].toUpperCase() + b.slice(1) : b[0].toLowerCase() + b.slice(1)); }
      // insert after the old text using its style, then delete the old text: keeps the run's formatting
      t.insertCharacters(i + a.length, rep, 'BEFORE'); t.deleteCharacters(i, i + a.length);
      n++; s = t.characters; i = find(i + rep.length);
    }
  }
  res.push(a + ' → ' + n);
}
return res;
