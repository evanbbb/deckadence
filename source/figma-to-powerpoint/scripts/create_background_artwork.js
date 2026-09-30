// Run in use_figma ONLY after an editable background rebuild failed and the user approved flattening.
// Prefix with: const FRAME_ID = '1:2';
// Creates one temporary export rectangle using the source frame's fills, with no text or child artwork.
// Download its PNG with download_assets, then remove ONLY returned createdNodeIds in a follow-up call.
// Never hide, clone, move or change existing source nodes. Keep the returned ids until cleanup succeeds.
const source = await figma.getNodeByIdAsync(FRAME_ID);
if (!source || !('fills' in source) || !('children' in source)) throw new Error('Expected a slide frame');
let page = source.parent;
while (page && page.type !== 'PAGE') page = page.parent;
if (!page) throw new Error('Source frame has no page');
await figma.setCurrentPageAsync(page);
const temp = figma.createRectangle();
try {
  temp.name = 'Deckadence temporary background export ' + FRAME_ID;
  temp.resize(source.width, source.height);
  temp.x = Math.max(0, ...page.children.filter(n => n.id !== temp.id).map(n => n.x + n.width)) + 100;
  temp.y = source.y;
  temp.fills = source.fills;
  temp.strokes = [];
  temp.effects = (source.effects || []).filter(e => e.type.includes('SHADOW'));
  temp.opacity = source.opacity;
  for (const property of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) {
    if (property in source) temp[property] = source[property];
  }
  temp.exportSettings = [{ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }];
  const bounds = temp.absoluteRenderBounds;
  return { createdNodeIds: [temp.id], backgroundId: temp.id, sourceId: source.id,
    width: temp.width, height: temp.height,
    renderBounds: bounds ? [bounds.x - temp.x, bounds.y - temp.y, bounds.width, bounds.height] : [0, 0, temp.width, temp.height],
    filename: FRAME_ID.replace(/:/g, '-').replace(/;/g, '_') + '-background.png', cleanupRequired: true };
} catch (error) {
  temp.remove();
  throw error;
}
