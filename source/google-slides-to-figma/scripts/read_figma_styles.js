// Read-only: list the Figma file's text styles, colour styles and colour variables in a compact form.
// Use as the code of one use_figma call; save the returned JSON as figma-styles.json and pass it to fonts_colors.py.
// Output is kept small because use_figma results are cut off around 20 kB.
const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const textStyles = (await figma.getLocalTextStylesAsync()).map(s => ({ name: s.name, family: s.fontName.family, style: s.fontName.style, size: s.fontSize }));
const paints = (await figma.getLocalPaintStylesAsync())
  .filter(s => s.paints.length && s.paints[0].type === 'SOLID')
  .map(s => ({ name: s.name, hex: toHex(s.paints[0].color) }));
const variables = [];
for (const col of await figma.variables.getLocalVariableCollectionsAsync()) {
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v || v.resolvedType !== 'COLOR') continue;
    let val = v.valuesByMode[col.defaultModeId];
    for (let i = 0; i < 5 && val && val.type === 'VARIABLE_ALIAS'; i++) {   // follow aliases to a real colour
      const t = await figma.variables.getVariableByIdAsync(val.id);
      val = t ? Object.values(t.valuesByMode)[0] : null;
    }
    if (val && 'r' in val) variables.push({ name: v.name, hex: toHex(val), collection: col.name });
  }
}
// Families in use by text styles, and which weights/styles each has installed (for nearest-weight matching)
const fams = [...new Set(textStyles.map(t => t.family))];
const all = await figma.listAvailableFontsAsync();
const familyStyles = Object.fromEntries(fams.map(f => [f, all.filter(x => x.fontName.family === f).map(x => x.fontName.style)]));
return { textStyles, paints, variables: variables.slice(0, 200), familyStyles };
