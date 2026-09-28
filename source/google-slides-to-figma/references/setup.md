# Setup help (for people new to this)

Only walk the user through the parts that are actually missing. Give one step at a time, in plain words, and check it worked before moving on. When the user needs to run a command themselves, give it to them ready to paste into Terminal (or tell them how their AI tool runs shell commands for them).

## Figma connection (the Figma MCP)

**How to tell it's working:** the Figma `whoami` tool returns their name and plans. If there's no Figma tool at all, or it says they're not authenticated, set it up. It's Figma's own server (`https://mcp.figma.com/mcp`); signing in happens in the browser.

**Claude Code**
1. Type `/plugin`, find **Figma** in the official marketplace, and install it. (Or: `claude mcp add --transport http figma https://mcp.figma.com/mcp`.)
2. Type `/mcp`, pick **figma**, choose **Authenticate**. A browser window opens; they sign in to Figma and click **Allow**.

**Codex**
1. In Terminal: `codex mcp add figma --url https://mcp.figma.com/mcp`
2. Then `codex mcp login figma`. A browser window opens; they sign in to Figma and click **Allow**.
3. Restart Codex.

**Other AI tools:** add an MCP server named `figma` with the URL `https://mcp.figma.com/mcp` (streamable HTTP) in the tool's MCP settings, then sign in when asked.

**Things that commonly go wrong**
- *"No access" to the file:* they need access to the Figma file. This skill builds pages in it, so they need edit access. Ask them to open the link in Figma and check they can edit it (or ask the file's owner to share it with edit rights).
- *Several plans (a personal team and a company org):* only matters when creating a *new* file. Ask which one to use.
- *Rate limits:* if Figma says it's rate-limited, slow down (fewer parallel calls) and try again after a pause.

## Getting into the Google Slides deck

The deck has to be opened by a browser that's **signed in to the Google account that can see it**. Pick the first option that's available:

### Option A — the user's own Chrome, through a browser tool (easiest for most people)
If your AI tool can control the user's Chrome (a browser extension or built-in browser control), use the tab that has the deck open: ask *"Is the deck open in Chrome? Which tab?"*. No extra sign-in.
- Run `scripts/extract_deck_inpage.js` in the tab with the tool's run-JavaScript command. The ZIP lands in their Downloads folder. Chrome may ask once to allow the download; tell them to click **Allow**.

### Option B — a headless browser tool (gstack `browse`, Playwright MCP, …)
These start their own browser that is **not** signed in.
1. Open a visible window (gstack: `browse connect`, then `browse goto <deck edit URL>`; Playwright: launch non-headless).
2. Ask the user to sign in to Google in that window and tell you when the deck is showing.
3. Keep that same session for everything that follows. With gstack the session is tied to the current folder: **don't `cd` elsewhere** or a second, signed-out browser starts and replaces the signed-in one.
4. Don't use cookie importing from their real browser unless they ask. On macOS it triggers a Keychain password prompt, and retrying stacks up several prompts.
5. Afterwards, offer to delete saved browser state (it contains their Google cookies).

### Option C — paste into Chrome's console (works for anyone, no installs)
1. Copy the script to their clipboard for them: `pbcopy < <skill-folder>/scripts/extract_deck_inpage.js` (Mac).
2. They open the deck in Chrome (the normal editor, not present mode), press **⌥⌘J** (Mac) or **Ctrl+Shift+J** (Windows) to open the Console.
3. If Chrome warns about pasting, they type `allow pasting` and press Enter.
4. They paste and press Enter. It prints `'started'`. The slides flick through by themselves; they shouldn't click around until a ZIP appears in Downloads (a few minutes for big decks). They can type `__EXTRACT.done` to see progress.
5. They tell you when the ZIP is there.

### Not enough on its own: the Google Drive connector
It can read a deck's text and list a folder (useful for finding decks by name), but it can't get images or layout, and its export fails for decks over 10 MB. Use it to find files, not to extract them.

## Local tools

- `python3`: normally present on a Mac. Check with `python3 --version`.
- `ffmpeg`: makes GIF stand-in stills, shrinks images over the 10 MB upload limit and makes contact sheets. **Most people can get it without admin rights:**
  1. Already installed? `ffmpeg -version` (for example from Homebrew). Use it.
  2. Otherwise: `python3 -m pip install --user imageio-ffmpeg`. This downloads a complete, private ffmpeg into the user's own Python folder, with no admin password and no system changes. `prepare_deck.py` finds it automatically; its summary says `"ffmpeg": "imageio-ffmpeg"`.
  3. If that's blocked too (a locked-down work laptop, no access to PyPI): skip ffmpeg. Everything still works except shrinking. Files over 10 MB get a dashed "Drag in by hand" box in Figma, and the originals are saved in a folder for the user to drag in (Figma accepts up to 50 MB by hand).
- On a Mac, the very first `python3` may offer to install Apple's Command Line Tools, which can need an admin password. If they can't, skip `prepare_deck.py`: unzip the extract yourself and build from `manifest.json` (no crops; anything over 10 MB becomes a drop-zone). For GIFs, copy them to a folder yourself, get each hash with `shasum -a 1 <file>` (built into macOS), and write `gifs.json` by hand so `place_gifs.js` still works.
