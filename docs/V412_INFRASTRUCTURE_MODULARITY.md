# NOTE2 v4.12 — Infrastructure & Modularity Baseline

## Why this baseline exists

The project had accumulated several development blockers that made new feature work riskier than necessary.

## Blockers found and resolved

1. **Runtime identity drift**
   - UI/runtime was NOTE2 while Capacitor still displayed NoteAI.
   - Fixed: `appName = NOTE2`.
   - Kept `appId = app.noteai.workspace` intentionally until a controlled native package migration is designed.

2. **Docker reproducibility drift**
   - Docker always used `npm install`.
   - Fixed: Docker copies `package*.json` and prefers `npm ci` when `package-lock.json` exists.

3. **Broken environment template**
   - `.env.example` had a stray `PY` sentinel.
   - Fixed and guarded in source preflight.

4. **No post-build runtime smoke gate**
   - Added `scripts/runtime-smoke.mjs`.
   - CI contract is now: lockfile → npm ci → tests → Vite build → gateway/static smoke.

5. **App.jsx monolith**
   - Source Viewer was already extracted in v4.11.
   - v4.12 additionally extracts:
     - `src/capture-sheet.jsx`
     - `src/knowledge-object.jsx`
     - `src/settings-page.jsx`
   - `App.jsx` reduced to roughly 665 lines.

6. **Stale identity strings**
   - User-visible NoteAI wording in account/media/server output replaced with NOTE2.
   - Legacy backup-format identifiers remain accepted for backwards compatibility.

## Remaining release blocker

`package-lock.json` is still absent. The local environment cannot generate it reliably because npm registry access/cache is incomplete. Do not hand-author a lockfile.

The repository includes a manual **Bootstrap package lock** GitHub Action. Run it on the runtime branch once the full runtime source is present. After that, standard CI must use `npm ci`.

## Verification

- Source preflight: PASS.
- Unit/regression suite: **109/109 PASS**.
- Local package-lock bootstrap: unavailable due missing cached `@capacitor/android`.
- Production Vite build is not claimed until dependency installation succeeds.

## Next development order

1. Complete full runtime publication to a dedicated GitHub runtime branch.
2. Run Bootstrap package lock workflow.
3. Require CI green: test + build + runtime smoke.
4. Then begin the block-editor migration behind a versioned note-content schema.
5. Add browser-level mobile E2E for Today, Notes, Capture, Sources, Search and Settings.
