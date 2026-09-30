# Access and native rendering

Use the user's chosen browser and Figma connection. Do not install plugins, accept account terms or change unrelated assistant settings as part of conversion.

## Google Slides

The extractor needs JavaScript execution in a signed-in **editor** tab. Use an available browser tool; otherwise explain how the user can run the supplied file in the browser console and download its ZIP. Never request their password or cookies. Respect the browser tool's restrictions on JavaScript execution. If it cannot run extraction code, use another user-authorized method rather than evading those restrictions.

## Figma Design

Check the Figma MCP connection (`whoami`, then metadata). This implementation needs `use_figma` for the reader and `download_assets` for source renders and images. Read the environment's `figma-use` guide before each applicable call. Some Figma connections expose only read tools; explain what capability is missing and ask the user to connect the needed supported integration. A REST token or third-party PowerPoint export plugin is not silently requested or installed. Do not claim the bundled reader works through tools that cannot execute it.

## PowerPoint

Check installed applications and connected document sessions. Use the user's intended PowerPoint version/platform; fonts and effects can render differently across systems. Ask for a native environment when none is available. Creating a PPTX and passing XML checks cannot prove visual fidelity.

Confirm that PowerPoint can edit and export, as well as open files. If it shows “Activate Microsoft 365 to Create and Edit” or another licensing restriction, ask the user to activate their licensed account. A slide visible in View Only mode does not establish editability or provide a native export. Do not purchase a license or start a trial on their behalf.

Check source font families with `list_fonts.js --families "Family" ...`. A sandboxed font catalogue can hide user-installed fonts. If source families appear missing but are installed in the native app, use the environment's authorized read-only catalogue access before asking about replacements. A genuinely missing family, unresolved exact style or unsupported variable axis still requires the user's choice; never approximate it silently.

- **Windows desktop PowerPoint:** the bundled `scripts/powerpoint/export_powerpoint.ps1` uses Microsoft's native [Slide.Export](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.slide.export) and opens the deck [read-only](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.presentations.open). Run it on the authorized Windows machine:

  ```powershell
  .\export_powerpoint.ps1 -Pptx "C:\chosen\pilot.pptx" -Out "C:\chosen\pilot-renders" -Width 1920
  ```

  It writes `s01.png`, `s02.png`, etc., and `render-manifest.json`. Bring the entire render folder back to the local work folder using a user-authorized transfer. Do not change execution-policy settings globally if the machine blocks a script; follow its approved script-running method. The script closes only the presentation it opened and never quits PowerPoint.

- **Mac PowerPoint or a connected session:** use supported automation/document commands or the app's own export to obtain PNGs of **the exact built PPTX**, at 1920 pixels wide or higher. Inspect the installed scripting dictionary or connected schemas before constructing calls; do not guess AppleScript verbs. A supported connected renderer may offer slide image export; use that tool only after inspecting its schema. Ordinary browser JavaScript cannot assume an Office add-in context. If the app export produces a smaller image, request a higher-quality native export before accepting fidelity. Record slide order, the app version, platform and the file's SHA-1 in the render manifest. Do not fabricate native render provenance or label another application's screenshots as PowerPoint output.

  On Mac PowerPoint, the observed native UI route is **File → Export → PNG → Save Every Slide**. Set width to 1920 and height from the source ratio, and use a new local export name. Confirm that the files have the requested dimensions after export; the success dialog can precede completion of the PNG writes.

  If the Mac file picker leaves a valid new PPTX disabled, use Finder's **Open With → the intended PowerPoint app** and verify the exact document path in that app. Multiple installed PowerPoint copies can have different activation states. Do not change the default file association or open another app merely to produce a render.

  For an export observed in PowerPoint, create `render-manifest.json` beside the numbered images:

  ```json
  {"renderer":"PowerPoint","version":"<observed version>","platform":"Mac or connected host",
   "pptx_sha1":"<SHA-1 of the exported PPTX>","slides":3,"width":1920,"height":1080}
  ```

  Compute the hash with `shasum -a 1 <file.pptx>`. Rename exported slide PNGs by their actual index, not lexical ordering (`Slide10` sorts before `Slide2`). The manifest ties the check to a file; it does not independently prove the stated renderer. Only record native provenance from an observed app export or a trustworthy user-provided export, stating which.

Ask for application-control permissions only when required by the actual automation path. Only close this job's documents. Stop for user intervention when an app shows a dialog you cannot safely resolve within existing authorization.

Both [PowerPoint slide dimensions](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides) must be between 1 and 56 inches. The builder uses recorded source page properties automatically, or takes a confirmed physical width when the source has none, and derives height from the source ratio. It does not choose a template size.
