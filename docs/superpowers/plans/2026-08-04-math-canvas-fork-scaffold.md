# Math Canvas — Fork & Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the real Excalidraw source into a new `canvas/` app at the repo root, strip out the parts we don't want yet (git hooks that could touch the parent repo, remote tracking/analytics), and prove it boots as our own standalone, single-user canvas — before any node/library-panel work starts.

**Architecture:** `canvas/` is a straight copy of the upstream Excalidraw yarn workspace (`excalidraw-app/` + the `packages/*` it depends on via source-level Vite aliases, plus `public/`, `scripts/`, and root config) into this repo, kept as its own workspace with its own `package.json`/`node_modules`/dev server — not merged into `math-lab/`'s no-build asset pipeline. Tracking/Sentry are disabled via existing env flags already in the upstream code (no source edits needed for that part); collaboration is left present but inert (no server configured) since the spec explicitly deprioritizes it.

**Tech Stack:** React 19 + TypeScript + Vite 5, yarn 1.22.22 (classic) workspaces, Node >=18 (this machine has v22.23.2).

## Global Constraints

- `canvas/` lives at the repo root, next to `math-lab/` — not inside it, not merged into its build.
- This is **our own fork**: source is copied in and owned, not consumed as an `@excalidraw/excalidraw` npm dependency.
- No real-time collaboration or save-server work in this plan — explicitly deferred.
- No changes to any file outside `canvas/` and this plan/spec's own docs.
- Every task ends in its own commit. Don't batch multiple tasks into one commit.

---

### Task 1: Vendor the Excalidraw source into `canvas/`

Fetches a **fresh** clone from the real upstream GitHub repo rather than reusing the local
clone at `/home/ameer/excalidraw` — checked during planning, that local clone is ~2 months
behind `origin/master` and has a locally-modified `yarn.lock` (registry URLs swapped to
`registry.npmjs.org`, from this machine's yarn config — not upstream's committed lockfile).
Cloning fresh gives a clean, current, verifiable-by-commit-hash starting point instead of
vendoring that drift.

**Files:**
- Create: `canvas/` — full copy of the subset listed below, taken from a fresh clone of
  `https://github.com/excalidraw/excalidraw.git`.

**Interfaces:**
- Produces: a `canvas/` directory tree containing `excalidraw-app/`, `packages/{common,element,excalidraw,fractional-indexing,math,utils}`, `public/`, `scripts/`, and root config files (`package.json`, `yarn.lock`, `tsconfig.json`, `.gitignore`, `.env.development`, `.env.production`, `.eslintrc.json`, `.eslintignore`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.lintstagedrc.js`, `.npmrc`, `.watchmanconfig`, `setupTests.ts`, `vitest.config.mts`, `LICENSE`, `README.md`) — no `node_modules`, no `.git`, none of upstream's CI/Docker/translation/example scaffolding.
- Consumed by: every later task in this plan and all future Math Canvas plans (library panel, node system, etc. all build inside this tree).

- [ ] **Step 1: Clone upstream fresh into the scratchpad, shallow (we only need current state, not history)**

```bash
rm -rf /tmp/excalidraw-vendor-src
git clone --depth 1 https://github.com/excalidraw/excalidraw.git /tmp/excalidraw-vendor-src
```

- [ ] **Step 2: Record the exact commit this fork starts from**

Run: `cd /tmp/excalidraw-vendor-src && git log -1 --format="%H %ci %s"`
Expected: prints a commit hash + date + message — keep this line, it goes in the commit message in Step 5.

- [ ] **Step 3: Copy the source with `rsync`, excluding what we don't want**

```bash
mkdir -p "canvas"
rsync -a \
  --exclude='.git/' \
  --exclude='.codesandbox/' \
  --exclude='dev-docs/' \
  --exclude='docker-compose.yml' \
  --exclude='Dockerfile' \
  --exclude='.dockerignore' \
  --exclude='examples/' \
  --exclude='firebase-project/' \
  --exclude='.github/' \
  --exclude='.husky/' \
  --exclude='vercel.json' \
  --exclude='CONTRIBUTING.md' \
  --exclude='crowdin.yml' \
  --exclude='CLAUDE.md' \
  --exclude='node_modules/' \
  --exclude='package-lock.json' \
  --exclude='dist/' \
  --exclude='build/' \
  --exclude='dev-dist/' \
  --exclude='coverage/' \
  /tmp/excalidraw-vendor-src/ "canvas/"
rm -rf /tmp/excalidraw-vendor-src
```

Run from the repo root (`/home/ameer/Desktop/baty site the new arc`).

- [ ] **Step 4: Verify the expected top-level entries are present, and nothing unwanted came along**

Run: `ls canvas/`
Expected: includes `excalidraw-app`, `packages`, `public`, `scripts`, `package.json`, `yarn.lock`, `tsconfig.json`, `.gitignore`, `LICENSE`, `README.md`.

Run: `find canvas -maxdepth 4 -iname node_modules; find canvas -iname .git`
Expected: both commands print nothing.

- [ ] **Step 5: Commit, recording the source commit hash from Step 2**

```bash
git add canvas
git commit -m "$(cat <<EOF
chore(canvas): vendor Excalidraw source as our own fork

Copied excalidraw-app + the packages/* it depends on (source-level Vite
aliases, not npm deps) from a fresh clone of upstream
github.com/excalidraw/excalidraw at <PASTE COMMIT HASH FROM STEP 2 HERE>.
Excludes CI, Docker, husky hooks, examples, and node_modules — this is
our own tree to edit directly, not an npm-consumed dependency.
EOF
)"
```

Replace `<PASTE COMMIT HASH FROM STEP 2 HERE>` with the actual hash before running — don't leave the placeholder in the real commit message.

---

### Task 2: Make the fork ours — rename, drop the husky hook, disable tracking/Sentry locally

**Files:**
- Modify: `canvas/package.json`
- Create: `canvas/.env.local`

**Interfaces:**
- Consumes: `canvas/package.json` as vendored in Task 1 (`"name": "excalidraw-monorepo"`, a `"prepare": "husky install"` script).
- Produces: `canvas/package.json` with `"name": "math-canvas"` and no `prepare` script; `canvas/.env.local` (gitignored, matches upstream's own `.env.local` convention) forcing tracking/Sentry off regardless of hostname.

- [ ] **Step 1: Rename the package and remove the husky hook**

In `canvas/package.json`, change:
```json
  "private": true,
  "name": "excalidraw-monorepo",
```
to:
```json
  "private": true,
  "name": "math-canvas",
```

And delete this line from `"scripts"` (it would otherwise run on `yarn install` and try to touch git hooks relative to the *parent* repo, since `canvas/` has no `.git` of its own):
```json
    "prepare": "husky install",
```

- [ ] **Step 2: Verify**

Run: `grep -n '"name"\|husky' canvas/package.json`
Expected: `"name": "math-canvas",` and no `husky` match.

- [ ] **Step 3: Create `canvas/.env.local`**

```
VITE_APP_ENABLE_TRACKING=false
VITE_APP_DISABLE_SENTRY=true
```

`trackEvent()` in `packages/excalidraw/analytics.ts` already no-ops unless `VITE_APP_ENABLE_TRACKING === "true"`, and `excalidraw-app/sentry.ts` already only sets a real Sentry DSN when `window.location.hostname` matches `excalidraw.com`/`staging.excalidraw.com`/`vercel.app` — on `localhost` it's already a no-op DSN. `.env.local` makes this explicit and hostname-independent rather than relying on that implicit match.

- [ ] **Step 4: Verify `.env.local` won't be committed**

Run: `grep -n '^\.env\.local$' canvas/.gitignore`
Expected: one match (inherited from the vendored `.gitignore`, confirming this file is intentionally local-only).

- [ ] **Step 5: Commit**

```bash
git add canvas/package.json
git commit -m "$(cat <<'EOF'
chore(canvas): rename package, drop husky hook

husky's "prepare" script would run on yarn install and touch git hooks
relative to the nearest .git — which is the parent repo, not canvas/
itself. Dropped rather than reconfigured, since git hooks aren't in scope
here. .env.local (gitignored, not part of this commit) pins tracking and
Sentry off explicitly rather than relying on the hostname check.
EOF
)"
```

---

### Task 3: Install dependencies, boot the dev server, and confirm it's really ours

**Files:**
- Modify: `canvas/excalidraw-app/index.html:5`

**Interfaces:**
- Consumes: `canvas/package.json` and `canvas/yarn.lock` from Tasks 1–2; `canvas/.env.local` from Task 2.
- Produces: `canvas/node_modules` (gitignored, not committed); a dev server reachable at `http://localhost:3001/` via `yarn start` from `canvas/`; confirms the whole vendored tree actually builds and runs before any Math Canvas–specific code is added on top of it.

- [ ] **Step 1: Install dependencies**

Run: `cd canvas && yarn install`
Expected: exits 0, ends with a `Done in ...s.` line, no error mentioning `husky` (confirms Task 2's removal worked) and no error resolving `@excalidraw/*` workspace packages.

- [ ] **Step 2: Start the dev server in the background**

Run: `cd canvas && yarn start` (background this — it's a long-running process)
Expected stdout eventually includes: `Local:   http://localhost:3001/`

- [ ] **Step 3: Confirm the stock page responds**

Run: `curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'`
Expected: `<title>Excalidraw Whiteboard</title>` — the untouched upstream title, proving the vendored app serves correctly before we change anything in it.

- [ ] **Step 4: Retitle the page**

In `canvas/excalidraw-app/index.html:5`, change:
```html
    <title>Excalidraw Whiteboard</title>
```
to:
```html
    <title>Math Canvas</title>
```

- [ ] **Step 5: Confirm the new title is served**

Run: `curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'`
Expected: `<title>Math Canvas</title>` — Vite's dev server serves `index.html` fresh on every request, so no restart is needed for this to take effect.

- [ ] **Step 6: Visually confirm the canvas itself works**

Open `http://localhost:3001/` in a browser (use the `claude-in-chrome` tools if driving this from an agent session: `navigate` to the URL, then `computer` to draw a rectangle on the canvas). Expected: the Excalidraw toolbar and infinite canvas render, and a shape you draw appears and persists on screen. This is the real acceptance check for this task — the curl checks only prove the server responds, not that the app works.

- [ ] **Step 7: Stop the dev server**

Stop the background `yarn start` process.

- [ ] **Step 8: Commit**

```bash
git add canvas/excalidraw-app/index.html
git commit -m "$(cat <<'EOF'
chore(canvas): retitle the page to confirm this is our own fork

Verified yarn install + yarn start boot the vendored app unmodified
first (still showing "Excalidraw Whiteboard"), then retitled to "Math
Canvas" and re-verified — confirms the fork is live-editable end to end
before any node/library-panel work starts on top of it.
EOF
)"
```

---

## What this plan deliberately does not do

Matches the design spec's v0 scope boundaries — none of this is forgotten, it's the next plan(s):

- No library panel, no node components, no port-spec system, no wiring/graph engine.
- No removal of the collaboration UI/code — it's present but inert (no `VITE_APP_WS_SERVER_URL` server running, so "Live collaboration" will fail if clicked; acceptable per the spec's "not a priority" call).
- No persistence-mechanism decision (local file export vs. browser storage) — flagged as an open question in the design spec, not resolved here.
- No `DESIGN_SYSTEM.md` visual-identity work (fonts, colors, `.engine-card` styling) — that starts once real Math Canvas UI (the library panel) exists to style, in the next plan.

## Next plan

Once this is executed and the dev server is confirmed working end to end: brainstorm-to-plan the library panel + generic node shell (scrub inputs, `pulseFlash`, node chrome) as its own plan, sourced from `DESIGN_SYSTEM.md`, before wiring in the first real methods (Complex Arithmetic → Möbius Mapping).
