# NOTE2 UI implementation delta — Spatial Glass shell

## Source provenance

Base: verified NoteAI source snapshot recovered for NOTE2.
No external repository code was imported.

## Implemented in real verified-source derivative

- Primary navigation consolidated to `Today / Notes / Sources / Search / You`.
- Legacy routes remain in `PageRouter` so Chat, Studio, Media, YouTube, Graph and Tasks are not deleted during migration.
- Global FAB changed from "new note only" to `Capture anything`.
- Capture sheet routes existing capabilities:
  - Note → editor/new note
  - Task → existing Tasks
  - Voice → existing Media
  - Scan / Photo → existing Analysis/ingestion
  - File → existing Analysis/ingestion
  - Link → existing YouTube/link path
- Dashboard replaced with Today.
- KPI/bento metrics removed.
- Today uses only actual workspace notes/tasks; no fake activity.
- Recent notes use deterministic volumetric knowledge objects.
- Notes list uses the same stable visual object identity.
- Existing Analysis page is relabeled/reframed as Sources without removing ingestion/RAG behavior.
- Existing Settings page is reframed as You & your data.

## Visual system

- Content layer stays mostly opaque.
- Glass is limited to navigation/controls/sheets.
- Floating mobile tab bar + volumetric capture action.
- Deterministic CSS volumetric knowledge objects.
- Spatial Today identity scene is ornamental only; it does not pretend to represent user data.
- Reduced-motion and increased-contrast fallbacks retained.

## Verification

`node --test`: 39 passed / 39 total after UI changes.

Not yet verified:
- Vite production build. `npm install` could not complete in the current execution environment, so no build-pass claim is made.
- Browser/device visual QA of the React build; requires installed dependencies/build output.

## Next code slices

1. Install dependencies in a networked checkout and generate a lockfile.
2. Run `npm run build` and actual mobile browser/device QA.
3. Split the 85 KB `App.jsx` by domain before deeper UI work.
4. Move Media/YouTube/Tasks/Graph into contextual routes/sheets without removing their capabilities.
5. Add true Source reader shell with deterministic object → reader continuity.
6. Add evidence sheet and exact page/timestamp navigation animation.
