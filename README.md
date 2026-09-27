# Google Slides → Figma

A Claude skill that moves Google Slides decks into a Figma design file, one Figma page per deck. It rebuilds every slide as a 1920×1080 frame with:

- real, editable text;
- the original images at full quality;
- animated GIFs that play, with one step from you (see [GIFs need your help](#gifs-need-your-help));
- YouTube videos as an HD thumbnail with a clickable link.

It was built while porting a course's lesson decks into Figma. It's written for designers, not developers: Claude asks a few plain questions, handles the technical steps, and explains any setup that's needed.

## What it does

1. **Asks** which decks, which Figma file, and how the slides should look:
   - **match your Figma template** (restyle into your text styles, colours and layouts);
   - **copy the slides as they are** (same layout, fonts and colours);
   - **a mix of both**.

   It also asks about spelling fixes, big GIFs and which boilerplate slides to leave out.
2. **Reads each deck** straight from the Google Slides tab. One script captures every slide into a single ZIP: a picture of each slide, all images and GIFs, text boxes with fonts and colours, shapes, speaker notes and YouTube links. This avoids the PowerPoint export, which breaks layouts, and Google Drive's 10 MB export limit.
3. **Agrees fonts and colours** using the deck's real lists. Fonts are swapped by family, and each weight goes to the nearest weight available. Colours are matched to your Figma colour styles by how close they look.
4. **Builds the Figma page(s)**, uploads the images, checks the result with screenshots, and fixes problems.
5. **Asks you to drag in the GIFs** (only if the deck has any). Claude tells you which folder and which page. You drag the whole folder in once and say when it's done. Claude moves each GIF into place, then asks you to check that they play.
6. **Reports:** what was built, what was left out, where the full-size originals are, and anything worth a second look.

## GIFs need your help

Figma only plays GIFs that a person drags in by hand. When a tool uploads a GIF, Figma keeps every frame but shows only the first one. The tool can't upload video instead, either. So Claude can't make GIFs play on its own.

What happens instead:
1. The build puts a still picture of each GIF's first frame where the GIF goes.
2. Claude saves the deck's GIFs in one folder and asks you to drag them all onto the Figma page in one go. They can land anywhere.
3. You tell Claude when they're in. Claude moves each GIF into its place and removes the extra copies. This works because Figma recognises a GIF by its contents, not by its name.
4. Claude asks you to check that the GIFs play. If you skip this step, the stills stay until you do it.

It's one drag per deck, not one per GIF.

## Install the skill

- **Claude desktop app or claude.ai:** upload `google-slides-to-figma.skill` (or the `.zip`) in Settings → Skills.
- **Claude Code:** copy the `google-slides-to-figma/` folder into `~/.claude/skills/`, then restart Claude Code.

Then ask something like *"Put my Google Slides deck into Figma"* with a deck link and a Figma link, or *"the deck I have open in Chrome"*.

## What you need

| Need | Why | If you don't have it |
|---|---|---|
| **Figma connection** (Figma MCP) with edit access to the file | To build the slides | The skill walks you through connecting it (`references/setup.md`) |
| **A browser Claude can use**, signed in to Google | To read the deck | Claude in Chrome is easiest. Or a headless browser you sign in to once. Or paste one script into Chrome's console. |
| **Python 3** | To prepare images | Usually already on a Mac |
| **ffmpeg** (optional) | To make GIF stand-in stills, shrink images over Figma's 10 MB upload limit, and make contact sheets | No admin rights needed: `python3 -m pip install --user imageio-ffmpeg`. Without it, big files get a dashed "drag in by hand" box in Figma. |

## Folder layout

```
google-slides-to-figma/              the skill (source)
  SKILL.md                           the instructions Claude follows
  references/
    setup.md                         connecting Figma and a browser, for non-technical users
    template-mode.md                 how to study a Figma design system and lay slides out in it
    gotchas.md                       lessons learned the hard way
  scripts/
    extract_deck_inpage.js           runs in the Google Slides tab; captures the whole deck into one ZIP
    prepare_deck.py                  unpacks the ZIP, crops images, handles files over 10 MB, contact sheets
    read_figma_styles.js             reads the Figma file's text styles, colour styles and colour variables
    fonts_colors.py                  lists the deck's fonts and colours, and proposes Figma replacements
    figma_helpers.js                 building blocks for the Figma build scripts (template and verbatim)
    make_verbatim_scripts.py         writes ready-to-run build scripts for "copy as they are"
    upload.sh                        uploads images into the placeholders in Figma
    place_gifs.js                    after you drag in the GIF folder, puts each playing GIF into its slot
    fix_text.js                      style-safe find-and-replace for the spelling pass
google-slides-to-figma.skill         packaged skill, ready to install
google-slides-to-figma.zip           the same package as a .zip, for email, Slack or drives
```

Not tracked in git (see `.gitignore`):
- images and GIFs, including `full-size-gifs/`;
- browser session state (`.gstack/`, which holds sign-in cookies);
- deck extracts and working folders.

## Updating the package

After editing anything in `google-slides-to-figma/`, rebuild the `.skill` file (a ZIP of that folder) and copy it to `.zip` so the two stay identical. With Anthropic's skill-creator skill:

```bash
python -m scripts.package_skill /path/to/google-slides-to-figma /path/to/output-folder
cp google-slides-to-figma.skill google-slides-to-figma.zip
```

## Known limits

- **GIFs need one drag per deck from you.** Figma only plays GIFs dragged in by hand. See [GIFs need your help](#gifs-need-your-help).
- **Figma's MCP upload cap:** images over 10 MB can't be uploaded by the tool. They're shrunk or left as drag-in drop-zones. You can drag in the full-size originals yourself (Figma accepts up to 50 MB).
- **"Copy as they are" is close, not pixel-perfect.** Charts, tables and complex shapes come across as simple boxes. Diagrams are rebuilt by hand in template mode.
- **Only Google Slides is supported,** read from its web editor. PowerPoint or Keynote files would need to be opened in Google Slides first.
