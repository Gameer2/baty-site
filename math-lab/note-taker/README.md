# Note taker

A personal review tool for leaving notes on specific parts of the site while browsing it, so
you don't have to hold everything in your head across many days of reviewing. Nothing here is
shipped with the real site — it only runs on `localhost`, and lives entirely in this folder.

## What's in here

- `notes-widget.js` — the on-page widget (floating "📝 notes" button, element picker, write box).
- `serve.py` — a local dev server. Run this instead of `python3 -m http.server`; everything
  works exactly the same, except it also saves your notes straight to disk.
- `notes.json` — the raw notes, one entry per page path. Source of truth.
- `notes.md` — the same notes, auto-regenerated as readable Markdown every time you add or
  delete one. **This is the file to hand to Claude, or Claude can just read it directly.**

## How to use it

1. Serve the site with the note-saving server (from anywhere):
   ```
   python3 math-lab/note-taker/serve.py
   ```
   It serves the **repo root**, so the whole site is reachable from one origin: the top-level
   hub at `/`, the General Lab at `/math-lab/`, and Syntropy Canvas at `/canvas/dist/`.
2. Open `http://localhost:8000/` in your browser.
3. A small "📝 notes" tab appears bottom-right on every page, automatically. Click it.
4. Two ways to leave a note:
   - **🎯 Note on part of page** — click the button, then click whatever you want to talk
     about (a chart, a button, a paragraph — anything). Elements outline as you hover so you
     can see what you're about to pick. A small write box opens right next to it — type what
     needs to change, hit Save (or Cmd/Ctrl+Enter). Press Esc any time to cancel.
   - **+ General note about this page** — for feedback that isn't about one specific element.
5. That's it — every note is saved to `note-taker/notes.json` and `note-taker/notes.md`
   automatically, the moment you hit Save. No export step. Keep browsing and taking notes over
   as many days as you like; it all accumulates in the same two files.
6. When you want Claude to act on your notes, just say so — Claude can read `notes.md` directly
   any time. You can also click "Copy all notes" in the panel to copy the same thing to your
   clipboard if you'd rather paste it yourself.

The small status line in the panel tells you whether notes are actually reaching disk
("saved to disk ✓") or only living in the browser for this session ("browser-only — run
note-taker/serve.py to save to disk") — that second one means you're running the plain
`http.server` instead of `serve.py`.

## Format

`notes.md` groups notes by page path, with the exact element (tag/id/text) named for anything
picked, e.g.:

```
## /math-lab/engines/calculus/methods/limits.html
- [div#presetRow "sin x / x → 0 ..."] the design of them are so bad and the way they appear is too cheap
- (general) this page loads slowly
```

The page path maps directly to a file in the repo (`math-lab/engines/calculus/methods/limits.html`),
and the element id/tag is usually enough to find the exact spot in that file or its
`assets/js/*.js` companion.

Canvas notes all land under the single path `/canvas/dist/index.html`, since Canvas is a
single-page app. The widget pins to **DOM** elements, so inside Canvas you can flag the
toolbar, the library panel, dialogs, and the nodes — but not shapes drawn on the `<canvas>`
surface, which aren't DOM elements.

## Notes are never sent anywhere

`notes.json`/`notes.md` are plain local files, written only by `serve.py`, on your machine.
Nothing here makes a network call to anything other than your own local server.
