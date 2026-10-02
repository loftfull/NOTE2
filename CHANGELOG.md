# NoteAI changelog

## v3.6 — Secure Sessions & Durable Workers

- replaced capacity `429` behavior for long media with a durable FIFO worker queue;
- persisted queue/restart state in resumable upload session metadata;
- added self-hosted accounts with salted scrypt password records;
- added independent expiring/revocable device sessions;
- added account-scoped revision-guarded checkpoint sync;
- added active-session caps and failed-login throttling;
- optionally requires account sessions for all cost-bearing AI/ingestion/upload routes;
- added origin-bound bearer injection to prevent account-token leakage to unrelated connector hosts;
- added Android Keystore AES-GCM Capacitor credential bridge;
- web/PWA credentials now use session-only storage;
- remote URL ingestion follows the configured gateway origin;
- removed automatic demo/seed notes and tasks from first launch;
- added explicit real-data onboarding empty state;
- added `SECURITY.md` and updated Docker/Render/Android deployment guidance;
- regression suite increased to 39/39 passing tests.

## v3.5 — Resumable Evidence Workspace

- resumable large-media transport;
- FFmpeg media segmentation and merged timeline evidence;
- restart recovery and graceful SIGTERM;
- legacy revision-guarded checkpoint sync;
- Docker/Render persistent gateway profile;
- Capacitor Android preparation.

## v3.3–v3.4

- durable local media jobs;
- exact evidence deep-links;
- extraction quality heuristic;
- remote gateway mode;
- Source Vault backup/restore.

## v3.1–v3.2

- IndexedDB Source Vault;
- hybrid lexical/vector RAG;
- Office/EPUB/PDF extraction;
- OCR/vision, transcription and YouTube caption ingestion;
- evidence-backed citations and unified search.

## v4.2 Instagram evidence workflow

- real regression fixtures for Reel `DaszqnpoLCl` and carousel `Db7z448jYex`;
- preserves Instagram route type and shared `img_index` as viewer start context;
- Reel/video transcription through the existing durable media queue;
- OCR/transcripts are indexed per Instagram media item with evidence locators;
- Brief / Detailed / Organize analysis modes over caption + OCR + transcripts only;
- related-post similarity and repeated-topic grouping from extracted evidence;
- evidence navigation opens the exact carousel item and seeks video timestamps;
- failed acquisition saves a pending Instagram Source instead of losing the shared link;
- live gateway runner: `scripts/run-instagram-real-cases.mjs`.

## v4.4 — Structured Instagram Knowledge

- Added schema-grounded structured objects for recipes, products, places, books and how-to content.
- Added true device offline pin with IndexedDB media blobs.
- Added exact carousel media → note flow.
- Added structured fields to Source search/RAG.
- Regression gate: 68/68 tests.
