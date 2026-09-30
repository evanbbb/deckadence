// Development-only integration checks. These do not simulate native Office fidelity.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mac = process.platform === 'darwin';
const scripts = path.join(root, 'google-slides-to-powerpoint/scripts');
const jxa = (script, args) => JSON.parse(execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', script, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
const xml = (file, entry) => execFileSync('/usr/bin/unzip', ['-p', file, entry], { encoding: 'utf8' });
const hash = p => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
test('browser size reader uses source page properties independently of XML attribute order',async()=>{
  const name=Buffer.from('ppt/presentation.xml'), data=Buffer.from('<p:presentation><p:sldSz cy="10287000" cx="18288000"/></p:presentation>');
  const local=Buffer.alloc(30), central=Buffer.alloc(46), end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(data.length,20); central.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,10); end.writeUInt32LE(local.length+name.length+data.length,16);
  const zip=Buffer.concat([local,name,data,central,name,end]);
  const code=fs.readFileSync(path.join(scripts,'read_source_size_inpage.js'),'utf8');
  async function read(response) {
    const window={}, context={window,location:{pathname:'/presentation/d/source/edit'},fetch:async()=>response,TextDecoder,DataView,Uint8Array};
    assert.equal(vm.runInNewContext(code,context),'started');
    for(let i=0;i<10 && window.__SOURCE_SIZE.status==='running';i++) await new Promise(setImmediate);
    return window.__SOURCE_SIZE;
  }
  const result=await read({ok:true,arrayBuffer:async()=>zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength)});
  assert.equal(result.status,'done'); assert.equal(result.result.widthIn,20); assert.equal(result.result.heightIn,11.25);
  const denied=await read({ok:false,status:403});
  assert.equal(denied.status,'error'); assert.match(denied.error,/HTTP 403/);
  const invalid=await read({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  assert.equal(invalid.status,'error'); assert.equal(invalid.result,undefined);
});
function fixture(work) {
  // GIF is retained byte-for-byte even with a crop and circular mask.
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  fs.writeFileSync(path.join(work, 'art.gif'), Buffer.concat([gif.subarray(0,-1), gif.subarray(19,-1), Buffer.from([0x3b])]));
  return { title: 'No redesign', width: 1600, height: 1200, slides: [{ n: 1, background: '#F0EEDD', elements: [
    { type: 'rect', x: 0, y: 0, w: 1600, h: 1200, gradient: { transform: [[1,0,0],[0,1,0]], stops: [
      { position: 0, color: { r: 1,g: 0,b: 0,a: 1 } }, { position: 1, color: { r: 0,g: 0,b: 1,a: 0.5 } }
    ] }, blur: {radius:16.3,grow:true}, shadows: [{ type: 'outer', blur: 8, x: 3, y: 4, color: '#123456', opacity: 0.4 }] },
    { type: 'text', x: 100, y: 200, w: 500, h: 100, paragraphs: [{ align: 'left', lineHeightPx: 48, spaceBefore: 12, runs: [
      { text: 'Exact & <words> Ω\vsecond line', font: 'Arial', style: 'Bold Italic', weight: 700, italic: true, size: 40, letterSpacing: 2, color: '#123456' }
    ] }] },
    { type: 'path', d: 'M10 20 L30 20 Q40 30 30 40 Z', fill: '#FFCC00' },
    { type: 'image', file: 'art.gif', x: 800, y: 100, w: 400, h: 300, crop: {l:0.1,t:0,r:0.2,b:0}, mask: 'ellipse', flipH: true, link:'https://example.com', imageEffects:{grayscale:true,duotone:['#FFFFFF','#000000'],saturation:-0.07,brightness:0.08} }
  ] }] };
}
test('PowerPoint package preserves source aspect, scaled typography, effects, exact text and original media', { skip: !mac }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'deckadence-pptx-'));
  try {
    const spec = path.join(work, 'spec.json'), out = path.join(work, 'pilot.pptx');
    fs.writeFileSync(spec, JSON.stringify(fixture(work)));
    const result = jxa(path.join(scripts, 'powerpoint/build_check.js'), [spec,out,'--width-in','10']);
    assert.equal(result.structural_valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.incomplete, false);
    assert.equal(result.native_render_verified, false);
    assert.equal(result.scale_points_per_pixel, 0.45);
    assert.match(xml(out,'ppt/presentation.xml'), /cx="9144000" cy="6858000"/);
    const slide = xml(out,'ppt/slides/slide1.xml');
    assert.match(slide, /sz="1800" i="1" b="1" spc="90"/);
    assert.match(slide, /typeface="Arial"/);
    assert.doesNotMatch(slide, /Arial-BoldItalicMT/);
    assert.match(slide, /<a:spcPts val="2160"/);
    assert.match(slide, /<a:spcPts val="540"/);
    assert.match(slide, /Exact &amp; &lt;words&gt; Ω/);
    assert.match(slide, /<a:br>/);
    assert.match(slide, /blurRad="45720" dist="28575"/);
    assert.match(slide, /<a:blur rad="93155" grow="1"/);
    assert.match(slide, /<a:srcRect l="10000" t="0" r="20000" b="0"/);
    assert.match(slide, /flipH="1"/);
    assert.match(slide, /prst="ellipse"/);
    assert.match(slide, /<a:grayscl\/><a:duotone><a:srgbClr val="FFFFFF"\/><a:srgbClr val="000000"\/><\/a:duotone>/);
    assert.match(slide, /<a:hsl hue="0" sat="93000" lum="100000"\/><a:lum bright="8000" contrast="0"\/>/);
    const media = execFileSync('/usr/bin/unzip', ['-p',out,'ppt/media/image1.gif']);
    assert.deepEqual(media, fs.readFileSync(path.join(work,'art.gif')));
    assert.equal(fs.existsSync(out+'.fixups.json'), false);
    const before = hash(out);
    assert.throws(() => jxa(path.join(scripts,'powerpoint/build_check.js'),[spec,out,'--width-in','10']), /output already exists/);
    assert.equal(hash(out), before);
    assert.throws(() => jxa(path.join(scripts,'powerpoint/build_check.js'),[spec,path.join(work,'bad-size.pptx')]), /confirm --width-in/);
  } finally { fs.rmSync(work,{recursive:true,force:true}); }
});
test('source size and temporary path aliases validate; resizing requires an explicit decision', {skip:!mac},()=>{
  const work=fs.mkdtempSync('/private/tmp/deckadence-source-size-');
  try {
    const s=fixture(work), spec=path.join(work,'spec.json'), build=path.join(scripts,'powerpoint/build_check.js');
    s.physicalSize={widthIn:20,heightIn:15};
    fs.writeFileSync(spec,JSON.stringify(s));
    const original=path.join(work,'original.pptx');
    jxa(build,[spec,original]);
    assert.match(xml(original,'ppt/presentation.xml'),/cx="18288000" cy="13716000"/);
    assert.throws(()=>jxa(build,[spec,path.join(work,'changed.pptx'),'--width-in','10']),/ask before resizing/);
    assert.equal(fs.existsSync(path.join(work,'changed.pptx')),false);
    const approved=path.join(work,'approved.pptx');
    jxa(build,[spec,approved,'--width-in','10','--resize-approved']);
    assert.match(xml(approved,'ppt/presentation.xml'),/cx="9144000" cy="6858000"/);
    s.physicalSize.heightIn=11.25;
    fs.writeFileSync(spec,JSON.stringify(s));
    assert.throws(()=>jxa(build,[spec,path.join(work,'bad-aspect.pptx')]),/physical size and extracted aspect disagree/);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('unresolved artwork blocks delivery, missing styles are reported, unsupported paths are rejected', { skip: !mac }, () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-pptx-gates-'));
  try {
    const s = fixture(work), spec=path.join(work,'spec.json'), build=path.join(scripts,'powerpoint/build_check.js');
    s.conversion={unresolved_artwork:[{id:'1:2',why:'blur'}]};
    fs.writeFileSync(spec,JSON.stringify(s));
    assert.throws(()=>jxa(build,[spec,path.join(work,'blocked.pptx'),'--width-in','10']),/unresolved source content/);
    const draft=jxa(build,[spec,path.join(work,'draft.pptx'),'--width-in','10','--draft']);
    assert.equal(draft.incomplete,true);
    delete s.conversion;
    s.slides[0].elements[1].paragraphs[0].runs[0].font='Definitely Missing Deckadence Font';
    fs.writeFileSync(spec,JSON.stringify(s));
    const missing=jxa(build,[spec,path.join(work,'missing.pptx'),'--width-in','10']);
    assert.equal(missing.incomplete,true);
    assert.equal(missing.unresolved_font_styles[0].family,'Definitely Missing Deckadence Font');
    assert.match(xml(path.join(work,'missing.pptx'),'ppt/slides/slide1.xml'), /typeface="Definitely Missing Deckadence Font"/);
    s.slides[0].elements[3].imageEffects={unimplemented:10};
    fs.writeFileSync(spec,JSON.stringify(s));
    assert.throws(()=>jxa(build,[spec,path.join(work,'bad-effect.pptx'),'--width-in','10']),/unsupported picture effect/);
    delete s.slides[0].elements[3].imageEffects;
    s.slides[0].elements[2].d='M10 20 A20 20 0 0 0 30 40 Z';
    fs.writeFileSync(spec,JSON.stringify(s));
    assert.throws(()=>jxa(build,[spec,path.join(work,'bad-path.pptx'),'--width-in','10']),/path needs editable reconstruction/);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('Google source dimensions are retained; video treatment requires a choice and uses its original poster', {skip:!mac},()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-google-pptx-'));
  try {
    fixture(work);
    fs.writeFileSync(path.join(work,'deck.json'),JSON.stringify({title:'Source',youtube:[{obj:'video',id:'abc',url:'https://example.com/video'}]}));
    fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify([{n:1,width:1920,height:1440,background:'#010203',texts:[],shapes:[],images:[
      {obj:'video',file:'art.gif',full:{x:100,y:200,w:300,h:200},vis:{x:100,y:200,w:300,h:200},type:'image/gif',z:4}
    ]}]));
    const convert=path.join(scripts,'slides_to_spec.js');
    assert.throws(()=>jxa(convert,[work,work,'--target','powerpoint']),/ask how to handle videos/);
    jxa(convert,[work,work,'--target','powerpoint','--videos','source-poster-link']);
    const s=JSON.parse(fs.readFileSync(path.join(work,'deck-spec.json')));
    assert.equal(s.width,1920); assert.equal(s.height,1440);
    assert.equal(s.slides[0].elements.length,1); // no invented play badge
    assert.equal(s.slides[0].elements[0].file,'art.gif');
    assert.equal(s.slides[0].elements[0].link,'https://example.com/video');
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('Google paragraph offsets preserve isolated punctuation; baseline metrics use the first line only', {skip:!mac},()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-baseline-'));
  try {
    const runs=(text,x,y,baseline)=>[{text,x,y,baseline,w:100,font:'Arial',size:40,weight:400,color:'#000000'}];
    fs.writeFileSync(path.join(work,'deck.json'),JSON.stringify({title:'Source'}));
    fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify([{n:1,width:1600,height:1200,background:'#FFFFFF',images:[],shapes:[],texts:[
      {obj:'title',z:1,paragraphs:[
        {text:'First',rect:{x:100,y:100,w:300,h:48},runs:runs('First',100,100,140)},
        {text:',',rect:{x:300,y:148,w:10,h:48},runs:runs(',',300,148,188)},
        {text:'Last',rect:{x:100,y:196,w:300,h:48},runs:runs('Last',100,196,236)}
      ]}
    ]}]));
    jxa(path.join(scripts,'slides_to_spec.js'),[work,work,'--target','powerpoint']);
    const spec=path.join(work,'deck-spec.json'), s=JSON.parse(fs.readFileSync(spec));
    const e=s.slides[0].elements[0];
    assert.equal(e.sourceBaselineY,140);
    assert.equal(e.paragraphs[1].marginLeft,200);
    const later=structuredClone(e);later.paragraphs=[{lineHeightPx:48,runs:[
      {text:'First\v',font:'Arial',weight:400,size:40},
      {text:'Second',font:'Definitely Missing Later Line Font',size:140}
    ]}];
    e.paragraphs[0].lineHeightPx=48;s.slides[0].elements.push(later);
    fs.writeFileSync(spec,JSON.stringify(s));
    const pptx=path.join(work,'offsets.pptx');
    jxa(path.join(scripts,'powerpoint/build_check.js'),[spec,pptx,'--width-in','10','--draft']);
    const sx=xml(pptx,'ppt/slides/slide1.xml');
    assert.match(sx,/<a:pPr algn="l" marL="1143000"/);
    const ys=[...sx.matchAll(/<a:off x="[0-9-]+" y="([0-9-]+)"/g)].map(m=>Number(m[1])).slice(-2);
    assert.equal(ys[0],ys[1]);assert.notEqual(ys[0],571500);
    const keynote=path.join(work,'keynote.pptx');
    jxa(path.join(root,'shared/keynote/build_pptx.js'),[spec,keynote]);
    const kx=xml(keynote,'ppt/slides/slide1.xml');
    assert.match(kx,/<a:off x="1270000" y="1270000"/);
    assert.doesNotMatch(kx,/marL="1143000"/);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('Figma mixed-size frames require normalization rather than silent padding', {skip:!mac},()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-figma-pptx-'));
  try {
    fs.writeFileSync(path.join(work,'frames.json'),JSON.stringify({frames:[{id:'1:1',w:1600,h:1200,els:[]},{id:'1:2',w:1920,h:1080,els:[]}]}));
    assert.throws(()=>jxa(path.join(root,'figma-to-powerpoint/scripts/figma_to_spec.js'),[work,'--target','powerpoint']),/mixed frame dimensions/);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('Figma unit conversion preserves aspect and variable axes remain explicitly unverified', {skip:!mac},()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-figma-axes-'));
  try {
    fs.writeFileSync(path.join(work,'frames.json'),JSON.stringify({frames:[{id:'1:1',w:1920,h:1080,bg:'#FFFFFF',els:[
      {k:'text',id:'1:2',x:20,y:20,w:500,h:100,ha:'LEFT',va:'TOP',segs:[
        {s:'Variable source',f:'Arial',st:'Bold',sz:40,axes:{wght:700,opsz:14}}
      ]}
    ]}]}));
    const convert=path.join(root,'figma-to-powerpoint/scripts/figma_to_spec.js');
    jxa(convert,[work,'--target','powerpoint','--pixels-per-inch','96']);
    const spec=path.join(work,'deck-spec.json'), s=JSON.parse(fs.readFileSync(spec));
    assert.equal(s.physicalSize.widthIn,20); assert.equal(s.physicalSize.heightIn,11.25);
    assert.deepEqual(s.slides[0].elements[0].paragraphs[0].runs[0].fontVariations,{wght:700,opsz:14});
    const out=path.join(work,'axes.pptx'),build=path.join(scripts,'powerpoint/build_check.js');
    const result=jxa(build,[spec,out]);
    assert.equal(result.incomplete,true);
    assert.deepEqual(result.unresolved_font_styles,[]);
    assert.deepEqual(result.unresolved_font_variations[0].axes,{opsz:14});
    assert.match(xml(out,'ppt/slides/slide1.xml'),/sz="3000"[^>]*b="1"/);
    assert.throws(()=>jxa(convert,[work,'--target','powerpoint','--pixels-per-inch','0']),/must be positive/);
    s.slides[0].elements[0].paragraphs[0].runs[0].fontVariations={opsz:'14'};
    fs.writeFileSync(spec,JSON.stringify(s));
    assert.throws(()=>jxa(build,[spec,path.join(work,'invalid.pptx')]),/finite numeric values/);
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
test('native checker rejects stale/missing renders and never equates synthetic PNGs with reviewed fidelity', {skip:!mac},()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'deckadence-render-check-'));
  try {
    const spec=path.join(work,'spec.json'),pptx=path.join(work,'pilot.pptx'),dir=path.join(work,'native');
    fs.mkdirSync(dir);
    fs.writeFileSync(spec,JSON.stringify(fixture(work)));
    jxa(path.join(scripts,'powerpoint/build_check.js'),[spec,pptx,'--width-in','10']);
    const m={renderer:'PowerPoint',version:'synthetic test only',platform:'fixture',pptx_sha1:'stale',slides:1};
    const manifest=path.join(dir,'render-manifest.json'),check=path.join(scripts,'powerpoint/check_render.js');
    fs.writeFileSync(manifest,JSON.stringify(m));
    assert.throws(()=>jxa(check,[spec,pptx,dir,'--width','48']),/manifest does not match/);
    m.pptx_sha1=hash(pptx);fs.writeFileSync(manifest,JSON.stringify(m));
    assert.throws(()=>jxa(check,[spec,pptx,dir,'--width','48']),/missing native slide/);
    // Absence of source reference must remain flagged even with an output image.
    const png=path.join(dir,'s01.png'),helper=path.join(work,'image.js');
    fs.writeFileSync(helper,`ObjC.import('Foundation');(0,eval)($.NSString.stringWithContentsOfFileEncodingError(${JSON.stringify(path.join(scripts,'powerpoint/lib.js'))},$.NSUTF8StringEncoding,null).js);function run(){savePixels({w:48,h:36,rgb:new Uint8Array(48*36*3).fill(255)},${JSON.stringify(png)});}`);
    execFileSync('/usr/bin/osascript',['-l','JavaScript',helper]);
    const result=jxa(check,[spec,pptx,dir,'--width','48']);
    assert.deepEqual(result.flagged,[1]);
    assert.equal(result.native_render_verified,false);
    assert.equal(result.visual_review_required,true);
    assert.equal(result.renderer,'PowerPoint');
  } finally {fs.rmSync(work,{recursive:true,force:true});}
});
