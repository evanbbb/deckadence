# Setup help (for people new to this)

Only walk the user through the parts that are actually missing. Give one step at a time, in plain words, and check it worked before moving on. When the user needs to run a command themselves, give it to them ready to paste into Terminal (or tell them how their AI tool runs shell commands for them).

## Nothing to install

The scripts use only what ships with macOS: `osascript` (JavaScript for Automation), `zip`, `unzip`, `sips`, `curl` and `shasum`. No Python, no packages, no admin password. If a script fails because one of those is missing, the Mac is unusually locked down: say so plainly.

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
- *"No access" to the file:* they need access to the Figma file. This skill only reads it, but Figma's scripting tool (`use_figma`) may still want edit access: if view access fails, ask the file's owner for edit rights, or to duplicate the file into the user's own drafts.
- *Several plans (a personal team and a company org):* only matters for creating files, which this skill never does.
- *Rate limits:* if Figma says it's rate-limited, slow down (fewer parallel calls) and try again after a pause.

## Keynote

- **Which Keynote:** Keynote Creator Studio (`/Applications/Keynote Creator Studio.app`, bundle id `com.apple.Keynote`) is the default. The older standalone Keynote (bundle id `com.apple.iWork.Keynote`) works too if it's up to date: pass `--app com.apple.iWork.Keynote`. If it's out of date it shows an "out of date" dialog and opens nothing.
- **Letting the AI control Keynote:** the first script that talks to Keynote makes macOS ask *"… wants access to control Keynote"*. They click **OK**. If they clicked Don't Allow earlier: System Settings → Privacy & Security → Automation → find their terminal (or the AI app) → turn on **Keynote Creator Studio**. Then try again. No admin password is needed.
- **AI tools that run commands in a sandbox** (Codex, for example) may block controlling other apps or writing outside the project folder. If Keynote never opens or `osascript` is refused, ask the user to allow it for this job: run the Keynote steps with the tool's permission to run outside the sandbox, or start the tool with a setting that allows it (see the tool's own help on sandbox or approval modes).
- **Dialogs block everything.** While Keynote shows a dialog (import error, warnings window, sign-in, update), scripts wait and then time out. Ask the user to read it out or send a screenshot, then click OK. Don't take screenshots of their screen yourself.
- **Folders:** Keynote is sandboxed. Keep work folders and output inside the user's home folder (Documents, Downloads), not `/tmp`.
