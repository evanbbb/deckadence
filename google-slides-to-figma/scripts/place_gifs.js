// Put the playing GIFs into their slots on ONE Figma page. Use as the code of a use_figma call.
//
// Why: Figma only plays a GIF that a person dragged in by hand. A GIF uploaded through the MCP tool keeps its frames
// but shows only the first one. Once a GIF has been dragged into the file, though, any fill that uses its image hash
// plays, and the hash is simply the SHA-1 of the file. So:
//   1. the build leaves "GIF: <file>" slots (showing a still first frame);
//   2. the person drags every file from the GIF folder onto the page in one go (anywhere on the page);
//   3. this script points each slot at its GIF's hash and deletes the dropped copies.
// Safe to run again: slots that already play are left alone, and it lists any GIF not dragged in yet.
//
// Edit PAGE_ID and GIFS (paste <work-dir>/gifs.json: { "<file name>": "<sha1>" }).
const PAGE_ID = '123:45';
const GIFS = { 'Deck - slide 07.gif': '0123456789abcdef0123456789abcdef01234567' };

const page = await figma.getNodeByIdAsync(PAGE_ID); await figma.setCurrentPageAsync(page);
const hashOf = n => { const f = Array.isArray(n.fills) && n.fills.find(f => f.type === 'IMAGE'); return f ? f.imageHash : null; };
const want = new Set(Object.values(GIFS));
const slots = page.findAll(n => n.name.startsWith('GIF: ') && 'fills' in n);
const slotIds = new Set(slots.map(n => n.id));
// dropped copies: any other layer on this page whose image is one of this deck's GIFs
const dropped = page.findAll(n => !slotIds.has(n.id) && 'fills' in n && want.has(hashOf(n)));
const arrived = new Set(dropped.map(hashOf));

const placed = [], already = [], waiting = [], unknown = [];
for (const s of slots) {
  const file = s.name.slice(5), h = GIFS[file];
  if (!h) { unknown.push(s.name); continue; }
  if (hashOf(s) === h) { already.push(file); continue; }
  if (!arrived.has(h)) { waiting.push(file); continue; }
  s.fills = [{ type: 'IMAGE', imageHash: h, scaleMode: 'FILL' }];
  placed.push(s.id);
}
// the slots now carry the hash, so the dropped copies can go (the GIF stays in the file and keeps playing)
for (const n of dropped) n.remove();
return { placed: placed.length, alreadyPlaying: already.length, notDraggedInYet: [...new Set(waiting)], slotsNotInGifsJson: unknown, removedDroppedCopies: dropped.length, mutatedNodeIds: placed };
