# Setup help (for people new to this)

Only walk the user through the parts that are actually missing. Give one step at a time, in plain words, and check it worked before moving on. When the user needs to run a command themselves, give it to them ready to paste into Terminal (or tell them how their AI tool runs shell commands for them).

## Nothing to install

The scripts use only what ships with macOS: `osascript` (JavaScript for Automation), `zip`, `unzip`, `sips`, `curl` and `shasum`. No Python, no packages, no admin password. If a script fails because one of those is missing, the Mac is unusually locked down: say so plainly.

## Keynote

- **Which Keynote:** Keynote Creator Studio (`/Applications/Keynote Creator Studio.app`, bundle id `com.apple.Keynote`) is the default. The older standalone Keynote (bundle id `com.apple.iWork.Keynote`) works too if it's up to date: pass `--app com.apple.iWork.Keynote`. If it's out of date it shows an "out of date" dialog and opens nothing.
- **Letting the AI control Keynote:** the first script that talks to Keynote makes macOS ask *"… wants access to control Keynote"*. They click **OK**. If they clicked Don't Allow earlier: System Settings → Privacy & Security → Automation → find their terminal (or the AI app) → turn on **Keynote Creator Studio**. Then try again. No admin password is needed.
- **AI tools that run commands in a sandbox** (Codex, for example) may block controlling other apps or writing outside the project folder. If Keynote never opens or `osascript` is refused, ask the user to allow it for this job: run the Keynote steps with the tool's permission to run outside the sandbox, or start the tool with a setting that allows it (see the tool's own help on sandbox or approval modes).
- **Dialogs block everything.** While Keynote shows a dialog (import error, warnings window, sign-in, update), scripts wait and then time out. Ask the user to read it out or send a screenshot, then click OK. Don't take screenshots of their screen yourself.
- **Folders:** Keynote is sandboxed. Keep work folders and output inside the user's home folder (Documents, Downloads), not `/tmp`.

## Getting into the Google Slides deck

The deck has to be opened by a browser that's **signed in to the Google account that can see it**. Pick the first option that's available:

### Option A — the user's own Chrome, through a browser tool
If your AI tool can control the user's Chrome (a browser extension or built-in browser control), use the tab that has the deck open: ask *"Is the deck open in Chrome? Which tab?"*. No extra sign-in. Run `scripts/extract_deck_inpage.js` in the tab with the tool's run-JavaScript command. The ZIP lands in their Downloads folder; Chrome may ask once to allow the download: they click **Allow**.

### Option B — a headless browser tool (Playwright, gstack `browse`, …)
These start their own browser that is **not** signed in.
1. Open a visible window and go to the deck's edit URL.
2. Ask the user to sign in to Google in that window and tell you when the deck is showing.
3. Keep that same browser session for everything that follows.
4. Don't import cookies from their real browser unless they ask: on macOS it triggers Keychain password prompts.
5. Afterwards, offer to delete the saved browser state (it contains their Google cookies).

### Option C — paste into Chrome's console (works for anyone, no installs)
1. Copy the script to their clipboard for them: `pbcopy < <skill-folder>/scripts/extract_deck_inpage.js`.
2. They open the deck in Chrome (the normal editor, not present mode) and press **⌥⌘J** to open the Console.
3. If Chrome warns about pasting, they type `allow pasting` and press Enter.
4. They paste and press Enter. It prints `'started'`. The slides flick through by themselves; they shouldn't click around until a ZIP appears in Downloads (a few minutes for big decks). They can type `__EXTRACT.done` to see progress.
5. They tell you when the ZIP is there.

### Not enough on its own: Google Drive tools
A Drive connector can find decks by name and read their text, but it can't get images or layout, and its export fails for decks over 10 MB. Use it to find files, not to extract them.
