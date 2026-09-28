#!/usr/bin/env python3
"""Summarise a deck's fonts and colours, and propose replacements from the Figma file's styles.

Usage:
  python3 fonts_colors.py <work-dir> [<figma-styles.json>] [--out mapping.json]

<work-dir>         a deck prepared by prepare_deck.py (reads manifest.json). Several decks: run once per deck, or pass
                   several work dirs separated by commas to get one shared mapping.
<figma-styles.json> what read_figma_styles.js returned (text styles, colour styles, colour variables). Optional:
                   without it you get the summary only.

Prints a plain-language table to show the user, and writes mapping.json:
  { "fonts":  { "<deck family>": {"to": "<figma family>", "why": "…"} },
    "colors": { "<deck hex>": {"to": "<paint style or variable name, or hex>", "toHex": "#…", "distance": 4.2,
                               "variants": ["#…"], "uses": {...}} },
    "notes": [...] }
Pass the (possibly user-edited) mapping.json to make_verbatim_scripts.py --mapping, and use it in template mode.

Fonts are mapped by FAMILY: every weight of the deck family moves to the new family, and at build time each weight
goes to the nearest weight the new family actually has (e.g. Inter Black -> DM Sans Bold if DM Sans has no Black).
Colours are matched by how close they look (CIE Lab distance); near-identical deck colours are grouped first.
"""
import json, math, os, re, sys
from collections import defaultdict

def norm_hex(c):
    if not c: return None
    c = c.strip()
    m = re.match(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)', c)
    if m: return '#%02X%02X%02X' % tuple(round(float(v)) for v in m.groups())
    if c.startswith('#'):
        h = c[1:]
        if len(h) == 3: h = ''.join(ch * 2 for ch in h)
        if len(h) >= 6: return '#' + h[:6].upper()
    return None

def lab(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = lambda u: u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = lin(r), lin(g), lin(b)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b)
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))

def dist(a, b):
    return math.dist(lab(a), lab(b))

def describe(hexc):
    L, A, B = lab(hexc)
    if L > 95 and abs(A) < 3 and abs(B) < 3: return 'white'
    if L < 8: return 'black'
    if abs(A) < 5 and abs(B) < 5: return 'light grey' if L > 70 else ('grey' if L > 35 else 'dark grey')
    chroma = math.hypot(A, B)
    hue = (math.degrees(math.atan2(B, A)) + 360) % 360
    names = [(20, 'pink'), (50, 'red'), (75, 'orange'), (105, 'yellow/gold'), (165, 'green'), (225, 'teal'), (295, 'blue'), (330, 'purple'), (361, 'pink')]  # CIE Lab hue angles
    name = next(n for h, n in names if hue < h)
    return ('light ' if L > 75 else 'dark ' if L < 35 else '') + ('greyish ' if chroma < 20 else '') + name

def role_of(size):
    return 'headings' if size >= 56 else ('body' if size >= 26 else 'small text')

def summarise(work_dirs):
    fonts = defaultdict(lambda: {'weights': defaultdict(int), 'roles': defaultdict(int), 'slides': set(), 'sample': ''})
    colors = defaultdict(lambda: {'uses': defaultdict(int), 'slides': set()})
    for wd in work_dirs:
        deck = os.path.basename(os.path.normpath(wd))
        for s in json.load(open(os.path.join(wd, 'manifest.json'))):
            key = deck + ':' + str(s['n'])
            if s.get('background'):
                h = norm_hex(s['background'])
                if h: colors[h]['uses']['slide background'] += 1; colors[h]['slides'].add(key)
            for t in s.get('texts', []):
                box_colors = set()
                for p in t.get('paragraphs') or [{'text': t['text'], 'runs': [t]}]:
                    for r in p.get('runs', []):
                        fam = r.get('font') or t.get('font')
                        if not fam: continue
                        f = fonts[fam]; w = int(r.get('weight') or 400)
                        f['weights'][w] += 1; f['roles'][role_of(r.get('size') or t.get('size') or 24)] += 1; f['slides'].add(key)
                        if not f['sample']: f['sample'] = (p['text'] or '')[:40]
                        h = norm_hex(r.get('color') or t.get('color'))
                        if h: box_colors.add(h)
                for h in box_colors:  # count text colours per text box, not per word
                    colors[h]['uses']['text'] += 1; colors[h]['slides'].add(key)
            for sh in s.get('shapes', []):
                for k, label in (('fill', 'shape fill'), ('stroke', 'outline')):
                    h = norm_hex(sh.get(k))
                    if h: colors[h]['uses'][label] += 1; colors[h]['slides'].add(key)
    # group near-identical colours (e.g. #1F6B4E / #206B4F / #1E6A4E) — anti-aliasing and copy-paste drift
    order = sorted(colors, key=lambda h: -len(colors[h]['slides']))
    groups = []
    for h in order:
        for g in groups:
            if dist(g['hex'], h) < 4:
                g['variants'].append(h)
                for u, n in colors[h]['uses'].items(): g['uses'][u] += n
                g['slides'] |= colors[h]['slides']
                break
        else:
            groups.append({'hex': h, 'variants': [], 'uses': defaultdict(int, colors[h]['uses']), 'slides': set(colors[h]['slides'])})
    return fonts, groups

def propose(fonts, groups, styles):
    mapping = {'fonts': {}, 'colors': {}, 'notes': []}
    ts = styles.get('textStyles', []) if styles else []
    targets = [{'name': p['name'], 'hex': norm_hex(p['hex'])} for p in (styles or {}).get('paints', []) if norm_hex(p.get('hex'))]
    targets += [{'name': v['name'], 'hex': norm_hex(v['hex'])} for v in (styles or {}).get('variables', []) if norm_hex(v.get('hex'))]
    file_families = []
    for t in sorted(ts, key=lambda t: -(t.get('size') or 0)):
        if t['family'] not in file_families: file_families.append(t['family'])
    big = [t['family'] for t in ts if (t.get('size') or 0) >= 56]
    body = [t['family'] for t in ts if 26 <= (t.get('size') or 0) < 56]
    common = lambda xs: max(set(xs), key=xs.count) if xs else None
    head_fam, body_fam = common(big) or (file_families[0] if file_families else None), common(body) or (file_families[0] if file_families else None)
    for fam, f in sorted(fonts.items(), key=lambda kv: -sum(kv[1]['roles'].values())):
        if not file_families:
            mapping['fonts'][fam] = {'to': fam, 'why': 'no text styles in the Figma file — keeping the deck font (Figma must have it installed)'}
        elif fam in file_families:
            mapping['fonts'][fam] = {'to': fam, 'why': 'already used by the Figma file'}
        else:
            main_role = max(f['roles'], key=f['roles'].get)
            to = head_fam if main_role == 'headings' else body_fam
            mapping['fonts'][fam] = {'to': to, 'why': f"mostly used for {main_role}; the Figma file uses {to} for {main_role}"}
    for g in groups:
        entry = {'variants': g['variants'], 'uses': dict(g['uses']), 'slides': len(g['slides']), 'looks': describe(g['hex'])}
        if targets:
            best = min(targets, key=lambda t: dist(t['hex'], g['hex']))
            d = dist(best['hex'], g['hex'])
            entry.update({'to': best['name'], 'toHex': best['hex'], 'distance': round(d, 1),
                          'match': 'same' if d < 3 else 'close' if d < 12 else 'loose' if d < 25 else 'no close match'})
            if d >= 25: entry.update({'to': g['hex'], 'toHex': g['hex']})  # keep original unless the user picks one
        else:
            entry.update({'to': g['hex'], 'toHex': g['hex'], 'match': 'kept (no colour styles in the Figma file)'})
        mapping['colors'][g['hex']] = entry
    if not targets: mapping['notes'].append('The Figma file has no colour styles or variables. Ask the user for brand colours (hex codes, or a page/frame in Figma that shows the palette), or keep the deck colours.')
    return mapping

def table(fonts, mapping):
    lines = ['FONTS (replaced by family; each weight goes to the nearest weight available)']
    for fam, f in sorted(fonts.items(), key=lambda kv: -sum(kv[1]['roles'].values())):
        m = mapping['fonts'].get(fam, {})
        roles = ', '.join(f'{r}' for r, _ in sorted(f['roles'].items(), key=lambda kv: -kv[1]))
        weights = '/'.join(str(w) for w in sorted(f['weights']))
        lines.append(f"  {fam:<22} weights {weights:<14} used for {roles:<28} on {len(f['slides']):>3} slides  ->  {m.get('to', '?')}   ({m.get('why', '')})")
    lines.append('COLOURS (most used first; near-identical shades grouped)')
    for h, c in list(mapping['colors'].items())[:14]:
        uses = ', '.join(f'{u} ×{n}' for u, n in sorted(c['uses'].items(), key=lambda kv: -kv[1]))
        tgt = f"{c['to']} {c.get('toHex', '')}" if c.get('to') != h else 'keep as is'
        lines.append(f"  {h} {c['looks']:<14} {uses:<52} ->  {tgt}  [{c.get('match', '')}]")
    if len(mapping['colors']) > 14: lines.append(f"  … {len(mapping['colors']) - 14} rarely used colours (kept unless mapped)")
    lines += mapping['notes']
    return '\n'.join(lines)

def main():
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    work_dirs = a[0].split(',')
    styles = json.load(open(a[1])) if len(a) > 1 and not a[1].startswith('--') else None
    out = a[a.index('--out') + 1] if '--out' in a else os.path.join(work_dirs[0], 'mapping.json')
    fonts, groups = summarise(work_dirs)
    mapping = propose(fonts, groups, styles)
    json.dump(mapping, open(out, 'w'), indent=1)
    print(table(fonts, mapping))
    print('\nwrote', out)

if __name__ == '__main__':
    main()
