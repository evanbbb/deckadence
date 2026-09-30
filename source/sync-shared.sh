#!/bin/sh
# Copy shared code into each skill that uses it. Each skill folder must work on its own once installed,
# so shared files are copied in, not linked. Edit the files in shared/, then run:  sh sync-shared.sh
# Run with --check to only report skills whose copies are out of date (exits 1 if any are).
set -e
cd "$(dirname "$0")"
CHECK=0; [ "$1" = "--check" ] && CHECK=1
STALE=0
copy() {  # copy <source file or folder> <destination folder>
  mkdir -p "$2"
  if [ -d "$1" ]; then same=$(diff -rq "$1" "$2/$(basename "$1")" >/dev/null 2>&1 && echo 1 || true); else same=$(cmp -s "$1" "$2/$(basename "$1")" && echo 1 || true); fi
  if [ -z "$same" ]; then
    if [ $CHECK = 1 ]; then echo "out of date: $2/$(basename "$1")"; STALE=1
    else rm -rf "$2/$(basename "$1")"; cp -R "$1" "$2/"; echo "updated: $2/$(basename "$1")"; fi
  fi
}
# Google Slides extractor: both skills that read Google Slides
for skill in google-slides-to-figma google-slides-to-keynote google-slides-to-powerpoint; do
  copy shared/google-slides/extract_deck_inpage.js "$skill/scripts"
done
for skill in google-slides-to-keynote google-slides-to-powerpoint; do
  copy shared/google-slides/slides_to_spec.js "$skill/scripts"
done
copy shared/google-slides/read_source_size_inpage.js google-slides-to-powerpoint/scripts
for skill in figma-to-keynote figma-to-powerpoint; do
  for file in shared/figma/*.js; do copy "$file" "$skill/scripts"; done
done
# Keynote builder: every skill that writes Keynote gets an exact copy of shared/keynote (files removed there go too)
for skill in google-slides-to-keynote figma-to-keynote; do
  dest="$skill/scripts/keynote"
  if ! diff -rq shared/keynote "$dest" >/dev/null 2>&1; then
    if [ $CHECK = 1 ]; then echo "out of date: $dest"; STALE=1
    else rm -rf "$dest"; mkdir -p "$skill/scripts"; cp -R shared/keynote "$dest"; echo "updated: $dest"; fi
  fi
done
# PowerPoint uses the same DrawingML writer, library and comparison engine;
# it bundles no Keynote automation and selects --target powerpoint explicitly.
for file in build_pptx.js lib.js list_fonts.js compare.js; do
  copy "shared/keynote/$file" shared/powerpoint
done
copy shared/keynote/pptx-template shared/powerpoint
for skill in google-slides-to-powerpoint figma-to-powerpoint; do
  for file in setup.md fidelity.md; do copy "shared/powerpoint/$file" "$skill/references"; done
  dest="$skill/scripts/powerpoint"
  if ! diff -rq shared/powerpoint "$dest" >/dev/null 2>&1; then
    if [ $CHECK = 1 ]; then echo "out of date: $dest"; STALE=1
    else rm -rf "$dest"; mkdir -p "$skill/scripts"; cp -R shared/powerpoint "$dest"; echo "updated: $dest"; fi
  fi
done
exit $STALE
