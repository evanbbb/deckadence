The fixed parts of the hand-over PowerPoint file: theme, one master, one Blank layout and the presentation settings.
build_pptx.js fills in `{{SLIDE_IDS}}`, `{{CX}}` and `{{CY}}` in ppt/presentation.xml and writes the slides, their
relationships, the media and [Content_Types].xml. Only the Blank layout is kept: Keynote warns about unused layouts
with placeholders. Don't add speaker-notes parts: Keynote refuses the whole file when they're there.
