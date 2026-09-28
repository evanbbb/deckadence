# Presentation converters

Skills for AI coding tools (Claude Code, Codex and others) that move slide decks between tools. Each one is a separate skill, so you can install only the one you need:

| Skill | From | To | What you get |
|---|---|---|---|
| [google-slides-to-figma](#google-slides--figma) | Google Slides | Figma design file | One Figma page per deck, 1920 × 1080 frames, editable text, full-quality images. Restyles into your Figma template, or copies the slides as they are. |
| [google-slides-to-keynote](#google-slides--keynote) | Google Slides | Keynote (`.key`) | A Keynote deck that looks like the original: editable text in the deck's fonts, shapes, images, GIFs that play. Every slide is checked against the original. |
| [figma-to-keynote](#figma--keynote) | Figma frames | Keynote (`.key`) | A Keynote deck from slide-sized Figma frames: editable text, shapes, arrows as editable shapes, images; effects Keynote can't do become exact pictures. Every slide is checked against Figma. |

They're written for designers, not developers. Your AI tool asks a few plain questions, does the technical steps, and explains any setup that's needed.

## Install a skill

The skills work with AI coding tools that run on your Mac, such as **Claude Code** and **Codex**. Each skill is a folder with a `SKILL.md` file and its scripts; installing means putting that folder where your AI tool looks for skills. Nothing is uploaded to any website.

**1. Download the one you want**

| Skill | Download |
|---|---|
| Google Slides → Figma | [google-slides-to-figma.zip](https://github.com/evanbbb/presentation-converters/raw/main/skills/google-slides-to-figma.zip) |
| Google Slides → Keynote | [google-slides-to-keynote.zip](https://github.com/evanbbb/presentation-converters/raw/main/skills/google-slides-to-keynote.zip) |
| Figma → Keynote | [figma-to-keynote.zip](https://github.com/evanbbb/presentation-converters/raw/main/skills/figma-to-keynote.zip) |

(All of them are in the [`skills`](skills) folder.)

**2. Unzip it into your AI tool's skills folder**

| AI tool | Skills folder | Paste this in Terminal (swap in the skill you want) |
|---|---|---|
| Claude Code | `~/.claude/skills` | `curl -sL https://github.com/evanbbb/presentation-converters/raw/main/skills/google-slides-to-keynote.zip -o /tmp/skill.zip && unzip -oq /tmp/skill.zip -d ~/.claude/skills` |
| Codex | `~/.agents/skills` | `curl -sL https://github.com/evanbbb/presentation-converters/raw/main/skills/google-slides-to-keynote.zip -o /tmp/skill.zip && unzip -oq /tmp/skill.zip -d ~/.agents/skills` |

Then restart the AI tool. To use a skill in just one project instead, unzip it into that project's `.claude/skills` (Claude Code) or `.agents/skills` (Codex) folder.

**Privacy:** the skills themselves upload nothing. They read from Google Slides or Figma and write files on your Mac. Your AI tool does send what it reads while working (slide text, pictures it looks at) to its own AI company, as it does for any task.

Then ask your AI tool something like:
- *"Put my Google Slides deck into Figma"* with a deck link and a Figma link;
- *"Turn this Google Slides deck into a Keynote file"* with a deck link, or *"the deck I have open in Chrome"*;
- *"Make a Keynote deck from these Figma frames"* with a figma.com/design link.

---

## Google Slides → Figma

It rebuilds every slide as a 1920 × 1080 Figma frame with:
- real, editable text;
- the original images at full quality;
- animated GIFs that play, with one step from you (see [GIFs need your help](#gifs-need-your-help));
- YouTube videos as an HD thumbnail with a clickable link.

**What it does**
1. **Asks** which decks, which Figma file, and how the slides should look: **match your Figma template** (your text styles, colours and layouts), **copy the slides as they are**, or **a mix**. It also asks about spelling fixes, big GIFs and which boilerplate slides to leave out.
2. **Reads each deck** straight from the Google Slides tab into one ZIP: a picture of each slide, all images and GIFs, text with fonts and colours, shapes, notes and YouTube links. This avoids the PowerPoint export, which breaks layouts, and Google Drive's 10 MB export limit.
3. **Agrees fonts and colours** using the deck's real lists: fonts swapped by family (each weight to the nearest weight available), colours matched to your Figma colour styles.
4. **Builds the Figma page(s)**, uploads the images, checks the result with screenshots, and fixes problems.
5. **Asks you to drag in the GIFs** (only if the deck has any).
6. **Reports** what was built, what was left out, and anything worth a second look.

### GIFs need your help

Figma only plays GIFs that a person drags in by hand. When a tool uploads a GIF, Figma keeps every frame but shows only the first one. So the AI puts a still of each GIF's first frame in place, saves the deck's GIFs in one folder, and asks you to drag the whole folder onto the Figma page in one go. It then moves each GIF into its place (Figma recognises a GIF by its contents, not its name) and asks you to check that they play. It's one drag per deck, not one per GIF.

**Needs:** the Figma connection (Figma MCP) with edit access to the file; a browser your AI can use, signed in to Google; Python 3; ffmpeg is optional (no admin rights needed: `python3 -m pip install --user imageio-ffmpeg`).

**Known limits:** GIFs need one drag per deck from you. Images over 10 MB (the Figma MCP upload cap) are shrunk or left as labelled drop-zones. "Copy as they are" is close, not pixel-perfect: charts, tables and complex shapes come across as simple boxes.

---

## Google Slides → Keynote

**What it does**
1. **Asks** which decks, where to save the `.key` files, and what to leave out. It always pilots on 10–15 varied slides first and shows you the result before doing the whole deck.
2. **Reads each deck** from the Google Slides tab (the same reader as the Figma skill): layout, text with fonts and where each line breaks, shapes and their outlines, images and the shape they're cropped to, GIFs, a picture of each slide.
3. **Asks about fonts, every time.** It lists the deck's fonts, says which aren't on your Mac, and proposes replacements. Nothing is swapped without your yes.
4. **Builds the Keynote file** with Keynote Creator Studio: fonts at the right weights (italics included), Google's own line breaks and line spacing, shapes, images mirrored and masked as on the slide (circles, rounded corners), GIFs as looping movies that play in Keynote, YouTube videos as a clickable thumbnail.
5. **Checks every slide** against Google's picture of it: side by side, with the differences in red, and fixes what doesn't match. Text boxes are lined up automatically.
6. **Reports** where the file is, what was left out, and any slide that still differs.

**Needs:** a Mac with Keynote Creator Studio (or an up-to-date standalone Keynote), and a way into the deck: a browser tool your AI can use, or pasting one script into Chrome's console. **Nothing to install and no admin rights:** everything runs on tools that ship with macOS. macOS asks once whether your terminal may control Keynote.

**Known limits:** speaker notes aren't copied. Links inside text aren't copied yet (a YouTube thumbnail keeps its link). Hyperlinked text shows in Keynote's link blue. Charts and tables come across as shapes and pictures. Google's own slide picture sometimes wraps a line differently from the editor, so one word can move between lines.

---

## Figma → Keynote

**What it does**
1. **Asks** which frames (a page or a selection), what order the slides go in (Figma has none), and where to save. It pilots on 5–10 frames first.
2. **Reads the frames** from Figma, read-only: text with every style (font, weight, italic, letter spacing, line height, case, links), boxes, image fills with their crop, and vector arrows and lines as outlines. It changes nothing in your file.
3. **Asks about fonts, every time**, including team fonts that exist in Figma but not on your Mac.
4. **Builds the Keynote file**: text, boxes and arrows stay editable; anything Keynote can't express (image filters, blurs, blend modes, gradients) is cut out of Figma's own picture of the slide, so it looks exactly the same.
5. **Checks every slide** against Figma's render and fixes what doesn't match.
6. **Reports** what became a picture and why, font replacements, and anything left out.

**Needs:** the Figma connection (Figma's MCP server, set up in your AI tool) with access to the file, and Keynote Creator Studio on a Mac. **Nothing to install and no admin rights.**

**Known limits:** shadows and prototype links aren't copied. A gradient frame background becomes one colour. Figma doesn't expose its line breaks, so a font drawn a touch wider or narrower in Keynote can move one word between lines. Text that sits on top of a picture cut from the slide is also baked into that picture (it looks right; moving the text later leaves a copy behind).

---

## For maintainers

### Rules for anyone changing these skills (people and AI agents)

These skills must work in **both Codex and Claude Code** (and other AI coding tools that read `SKILL.md` folders). Before you finish any change, check it against these rules:

1. **No Claude-specific tooling in the skills.** Don't name or rely on tools only one AI tool has: no `AskUserQuestion`, no Claude-only browser tools as the only route, no slash commands, no Claude plugin skills as a requirement. Write "ask the user" (each skill explains how) and describe tools generically ("a browser tool that can run JavaScript in a page", "the Figma MCP server"). MCP servers are fine: both tools support them.
2. **Nothing on Anthropic's or Claude's servers.** Don't publish anything to claude.ai (no skill uploads, no artifacts), and don't make the skills upload decks, pictures or results anywhere. They read from Google Slides or Figma and write files on the user's Mac.
3. **Nothing to install, no admin rights** (the Keynote skills). Scripts are JavaScript for Automation (`osascript -l JavaScript`) plus tools that ship with macOS. No Python, npm or Homebrew dependencies.
4. **Test in both tools.** Run a small pilot (10–15 slides) through Claude Code and through Codex (`codex exec` in a folder with the skill under `.agents/skills/`). Codex's sandbox blocks controlling Keynote by default: the skill must still get there by asking for permission, as `references/setup.md` explains.
5. **Test in small batches.** Pilot on 10–15 varied slides; re-test only affected slides after a fix; ask before running a whole deck.


The installable packages are in `skills/`. Everything else is in `source/`:

```
source/
  google-slides-to-figma/      skill: Google Slides → Figma
  google-slides-to-keynote/    skill: Google Slides → Keynote
  figma-to-keynote/            skill: Figma → Keynote
  shared/
    google-slides/             the Google Slides reader (used by both Google Slides skills)
    keynote/                   the Keynote builder and checker (used by both Keynote skills)
  sync-shared.sh               copies shared/ into each skill that uses it
  package.sh                   syncs, then builds skills/<skill>.zip
```

- **Edit shared code in `source/shared/`, never in a skill's copy.** Each skill must work on its own once installed, so shared files are copied in, not linked. Run `sh source/sync-shared.sh` after editing (`--check` reports stale copies and exits 1).
- **After any change, run `sh source/package.sh` and commit `skills/` with it.** The download links above point at those files.
- The Keynote skills' scripts are JavaScript for Automation (`osascript -l JavaScript`) plus `/usr/bin` tools, so they need nothing installed. Keep it that way: no Python or npm dependencies.
- The Keynote builder takes a neutral deck spec (`source/shared/keynote/deck-spec.md`). A new "… to Keynote" skill only needs a reader that writes that spec; building, italics, text alignment and checking come for free.
- Lessons learned: each skill's `references/gotchas.md`, plus `source/shared/keynote/keynote-gotchas.md` for Keynote.

Not tracked in git (see `.gitignore`): images and GIFs, browser session state (`.gstack/`, which holds sign-in cookies), deck extracts and working folders.
