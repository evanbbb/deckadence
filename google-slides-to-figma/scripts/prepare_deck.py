#!/usr/bin/env python3
"""Unpack and prepare a deck extracted by extract_deck_inpage.js.

Usage:
  python3 prepare_deck.py <extract.zip | extracted-folder> <work-dir>
          [--originals <folder>] [--oversize shrink|placeholder] [--limit-mb 10]

Does:
  1. unzips into <work-dir> (manifest.json, deck.json, ref/, media/)
  2. crops images whose visible area on the slide is smaller than the image  -> media/sNN_K_crop.<ext>
  3. every file over --limit-mb (the Figma MCP upload limit, 10 MB):
       - the untouched original is copied to --originals (default <work-dir>/full-size originals)
       - --oversize shrink (default): GIFs -> animated copy under the limit (every frame + frame rate kept; fewer colours
         first, then smaller), PNG/JPG -> high-quality JPEG at the same size. Falls back to placeholder if it can't.
       - --oversize placeholder: nothing uploaded; the image is marked "manual" so the build leaves a labelled
         drop-zone saying which file to drag in by hand (Figma accepts up to 50 MB when dragged in)
  4. looks up YouTube titles, writes contact sheets ref/sheet-1.png, sheet-2.png … (6x5 slides each)
  5. writes text.txt (all slide text, one line per slide, for proofreading) and report.json

ffmpeg is found in this order, none needing admin rights:
  a) `ffmpeg` on the PATH (e.g. Homebrew)
  b) the copy bundled with the Python package imageio-ffmpeg — install for this user only with:
       python3 -m pip install --user imageio-ffmpeg
Without ffmpeg: crops and contact sheets still work if Pillow is installed; oversize files become placeholders.
"""
import json, os, shutil, subprocess, sys, urllib.request, zipfile

def find_ffmpeg():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe, 'system'
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe(), 'imageio-ffmpeg'
    except Exception:
        return None, None

FFMPEG, FFMPEG_SOURCE = find_ffmpeg()

def ff(*args):
    return subprocess.run([FFMPEG, '-loglevel', 'error', '-y', *args], capture_output=True, text=True)

def gif_width(path):
    with open(path, 'rb') as fh:
        head = fh.read(10)
    return int.from_bytes(head[6:8], 'little') if head[:3] == b'GIF' else 640

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
    src, work = args[0], args[1]
    originals = opt('--originals') or opt('--gif-archive') or os.path.join(work, 'full-size originals')
    mode = opt('--oversize', 'shrink')
    limit_b = int(float(opt('--limit-mb', 10)) * 1_000_000) - 150_000  # small safety margin
    os.makedirs(work, exist_ok=True)
    if src.endswith('.zip'):
        with zipfile.ZipFile(src) as z:
            z.extractall(work)
    elif os.path.abspath(src) != os.path.abspath(work):
        shutil.copytree(src, work, dirs_exist_ok=True)

    manifest = json.load(open(os.path.join(work, 'manifest.json')))
    deck = json.load(open(os.path.join(work, 'deck.json')))
    report = {'title': deck.get('title'), 'slides': len(manifest), 'images': 0, 'ffmpeg': FFMPEG_SOURCE or 'not found',
              'gifs': [], 'crops': [], 'oversize': [], 'manual_uploads': [], 'youtube': deck.get('youtube', []),
              'warnings': deck.get('warnings', [])}
    try:
        from PIL import Image  # noqa
        pil = True
    except Exception:
        pil = False
    deck_name = (deck.get('title') or 'deck')[:40].strip().replace('/', '-')

    for s in manifest:
        for i in s['images']:
            report['images'] += 1
            f = i.get('file')
            if not f or not os.path.exists(os.path.join(work, f)):
                continue
            path = os.path.join(work, f)
            i['upload'] = f  # the file to upload (may be replaced below)
            i['manual'] = False
            if i['type'] == 'image/gif':
                report['gifs'].append({'slide': s['n'], 'file': f, 'bytes': os.path.getsize(path)})
            # 2. crop to the visible area (not GIFs: cropping would re-encode every frame)
            full, vis = i['full'], i['vis']
            if full != vis and i['natW'] and i['type'] in ('image/png', 'image/jpeg', 'image/webp'):
                W, H = i['natW'], i['natH']
                cx = round((vis['x'] - full['x']) / full['w'] * W); cy = round((vis['y'] - full['y']) / full['h'] * H)
                cw = round(vis['w'] / full['w'] * W); ch = round(vis['h'] / full['h'] * H)
                root, ext = os.path.splitext(f)
                out = root + '_crop' + ext
                if pil:
                    from PIL import Image
                    Image.open(path).crop((cx, cy, cx + cw, cy + ch)).save(os.path.join(work, out))
                elif FFMPEG:
                    ff('-i', path, '-vf', f'crop={cw}:{ch}:{cx}:{cy}', os.path.join(work, out))
                if os.path.exists(os.path.join(work, out)):
                    i['upload'] = out; path = os.path.join(work, out)
                    report['crops'].append(out)
            # 3. oversize handling
            size = os.path.getsize(path)
            if size > limit_b:
                entry = {'slide': s['n'], 'file': i['upload'], 'bytes': size}
                os.makedirs(originals, exist_ok=True)
                keep = os.path.join(originals, f"{deck_name} - slide {s['n']:02d}{'' if i['k'] == 0 else ' (' + str(i['k'] + 1) + ')'}{os.path.splitext(path)[1]}")
                shutil.copy2(path, keep); entry['original_saved_to'] = keep
                root = os.path.splitext(i['upload'])[0]
                small = None
                if mode == 'shrink':
                    if i['type'] == 'image/gif':
                        small = shrink_gif(path, os.path.join(work, root + '_small.gif'), limit_b)
                    else:
                        out = os.path.join(work, root + '_small.jpg')
                        if pil:
                            from PIL import Image
                            Image.open(path).convert('RGB').save(out, quality=92)
                        elif FFMPEG:
                            ff('-i', path, '-q:v', '2', out)
                        small = out if os.path.exists(out) and os.path.getsize(out) <= limit_b else None
                if small:
                    i['upload'] = os.path.relpath(small, work); entry['uploaded_as'] = i['upload']; entry['small_bytes'] = os.path.getsize(small)
                else:
                    # leave a labelled drop-zone in Figma; the person drags the original in by hand
                    i['manual'] = True; i['upload'] = None; i['manual_file'] = os.path.basename(keep)
                    entry['placeholder'] = True
                    if mode == 'shrink': entry['why'] = 'no ffmpeg found' if not FFMPEG else 'could not get it under the limit'
                    report['manual_uploads'].append({'slide': s['n'], 'drag_in': keep})
                report['oversize'].append(entry)

    # 4. YouTube titles
    for v in report['youtube']:
        try:
            v['title'] = json.load(urllib.request.urlopen('https://www.youtube.com/oembed?format=json&url=' + v['url'], timeout=10))['title']
        except Exception:
            v['title'] = ''
    # contact sheets
    refs = sorted(x for x in os.listdir(os.path.join(work, 'ref')) if x.startswith('s') and x.endswith('.png'))
    sheets = []
    for start in range(0, len(refs), 30):
        chunk = refs[start:start + 30]
        out = os.path.join(work, 'ref', f'sheet-{start // 30 + 1}.png')
        if pil:
            from PIL import Image, ImageDraw
            tw, th, pad = 320, 180, 6
            sheet = Image.new('RGB', (6 * (tw + pad), ((len(chunk) + 5) // 6) * (th + pad)), 'white')
            for k, name in enumerate(chunk):
                im = Image.open(os.path.join(work, 'ref', name)).convert('RGB').resize((tw, th))
                ImageDraw.Draw(im).rectangle((0, 0, 34, 20), fill='white'); ImageDraw.Draw(im).text((4, 4), name[1:3], fill='red')
                sheet.paste(im, ((k % 6) * (tw + pad), (k // 6) * (th + pad)))
            sheet.save(out)
        elif FFMPEG:
            lst = os.path.join(work, 'ref', '_list.txt')
            open(lst, 'w').write(''.join(f"file '{os.path.join(work, 'ref', n)}'\n" for n in chunk))
            ff('-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'scale=320:180,tile=6x5:padding=6', '-frames:v', '1', out)
            os.remove(lst)
        if os.path.exists(out): sheets.append(out)
    report['sheets'] = sheets or 'none (no Pillow or ffmpeg): look at the ref/sNN.png renders directly'

    # 5. text for proofreading
    with open(os.path.join(work, 'text.txt'), 'w') as fh:
        for s in manifest:
            t = ' | '.join(x['text'].replace('\n', ' / ') for x in s['texts'])
            fh.write(f"{s['n']}: {t}\n")
            if s.get('notes'): fh.write(f"   notes: {s['notes']}\n")
    json.dump(manifest, open(os.path.join(work, 'manifest.json'), 'w'), indent=1)
    json.dump(report, open(os.path.join(work, 'report.json'), 'w'), indent=1)
    print(json.dumps({k: (v if k not in ('crops',) else len(v)) for k, v in report.items()}, indent=1))

def shrink_gif(src, dst, limit_b):
    """Re-encode an animated GIF under limit_b bytes. Keeps every frame and the frame rate; lowers colours first, then width."""
    if not FFMPEG:
        return None
    width = gif_width(src)
    for w in [width, int(width * 0.9), int(width * 0.8), int(width * 0.7), int(width * 0.6), int(width * 0.5), int(width * 0.4)]:
        for colors in [256, 160, 96, 64, 40, 32]:
            vf = f"scale={w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle"
            ff('-i', src, '-vf', vf, dst)
            if os.path.exists(dst) and os.path.getsize(dst) <= limit_b:
                return dst
    return None

if __name__ == '__main__':
    main()
