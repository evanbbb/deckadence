#!/usr/bin/env python3
"""Write ready-to-run use_figma scripts that rebuild slides verbatim (original layout, fonts, colours).

Usage:
  python3 make_verbatim_scripts.py <work-dir> <PAGE_ID> <cfg.json> [--slides 1-20,25] [--cols 8] [--mapping mapping.json]
  (--mapping: the fonts/colours mapping from fonts_colors.py, after the user confirmed or edited it.
   --font-map '{"Poppins":"DM Sans"}' still works for a quick font-only swap.)

Writes <work-dir>/build/verbatim_01.js, verbatim_02.js … each under ~45k characters.
Read each file and pass its full contents as the `code` of one use_figma call, in order. Each returns {created, imgs};
collect every imgs pair, then run upload_assets + upload.sh.
Slides are laid out in a grid, --cols per row (default 8), in deck order. Skipped slides leave no gap.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIMIT = 45000

def parse_slides(spec, n):
    if not spec: return list(range(1, n + 1))
    out = []
    for part in spec.split(','):
        if '-' in part: a, b = part.split('-'); out += list(range(int(a), int(b) + 1))
        elif part.strip(): out.append(int(part))
    return out

def slim(s):
    return {
        'n': s['n'], 'background': s.get('background'),
        'images': [{'upload': i.get('upload'), 'file': i.get('file'), 'manual': i.get('manual', False), 'manual_file': i.get('manual_file'), 'vis': i['vis']}
                   for i in s['images'] if i.get('file')],
        'texts': [{'text': t['text'], 'rect': t['rect'], 'font': t['font'], 'size': t['size'], 'weight': t['weight'], 'italic': t['italic'], 'color': t['color'],
                   'paragraphs': [{'text': p['text'], 'runs': p['runs'][:1]} for p in t.get('paragraphs', [])]} for t in s['texts']],
        'shapes': [{k: v for k, v in sh.items() if k in ('tag', 'rect', 'fill', 'fillOpacity', 'stroke', 'strokeWidth')} for sh in s['shapes']],
    }

def main():
    a = sys.argv[1:]
    if len(a) < 3: print(__doc__); sys.exit(1)
    work, page_id, cfg_path = a[0], a[1], a[2]
    slides_spec = a[a.index('--slides') + 1] if '--slides' in a else None
    cols = int(a[a.index('--cols') + 1]) if '--cols' in a else 8
    font_map = json.loads(a[a.index('--font-map') + 1]) if '--font-map' in a else {}
    color_map = None
    if '--mapping' in a:
        mp = json.load(open(a[a.index('--mapping') + 1]))
        font_map = {k: (v['to'] if isinstance(v, dict) else v) for k, v in mp.get('fonts', {}).items()} | font_map
        color_map = {k: {'to': v.get('to'), 'toHex': v.get('toHex'), 'variants': v.get('variants', [])} for k, v in mp.get('colors', {}).items()}
    manifest = {s['n']: s for s in json.load(open(os.path.join(work, 'manifest.json')))}
    cfg = json.load(open(cfg_path))
    helpers = open(os.path.join(HERE, 'figma_helpers.js')).read()
    head = (f"const PAGE_ID = {json.dumps(page_id)};\nconst CFG = {json.dumps(cfg)};\n" + helpers +
            f"\nconst OPTS = {{fontMap: {json.dumps(font_map)}, colorMap: {json.dumps(color_map)}}};\n")
    wanted = [n for n in parse_slides(slides_spec, max(manifest)) if n in manifest]
    os.makedirs(os.path.join(work, 'build'), exist_ok=True)
    batches, cur = [], []
    for idx, n in enumerate(wanted):
        call = f"await verbatimSlide({idx % cols}, {idx // cols}, {json.dumps(slim(manifest[n]), ensure_ascii=False)}, OPTS);\n"
        if cur and len(head) + sum(map(len, cur)) + len(call) + 40 > LIMIT:
            batches.append(cur); cur = []
        cur.append(call)
    if cur: batches.append(cur)
    paths = []
    for k, b in enumerate(batches, 1):
        p = os.path.join(work, 'build', f'verbatim_{k:02d}.js')
        open(p, 'w').write(head + ''.join(b) + "return { created, imgs };\n")
        paths.append(p)
    print(json.dumps({'scripts': paths, 'slides': len(wanted)}, indent=1))

if __name__ == '__main__':
    main()
