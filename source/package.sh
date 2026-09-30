#!/bin/sh
# Build the downloadable packages into skills/ at the top of the repo: one <skill>.zip per skill (a zip of the skill's
# folder, which any AI tool that reads SKILL.md folders can use). Copies shared code into the skills first (sync-shared.sh), so the packages always match shared/.
# Run after every change and commit skills/ with it: the README's download links point at those files.
#   sh source/package.sh
set -e
cd "$(dirname "$0")"
sh sync-shared.sh >/dev/null
OUT=../skills
rm -rf "$OUT" && mkdir -p "$OUT"
for skill in google-slides-to-figma google-slides-to-keynote figma-to-keynote google-slides-to-powerpoint figma-to-powerpoint; do
  zip -qr -X "$OUT/$skill.zip" "$skill" -x '*/__pycache__/*' '*.pyc' '*/.DS_Store'
  echo "skills/$skill.zip  ($(du -h "$OUT/$skill.zip" | cut -f1))"
done
