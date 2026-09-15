# NoteAI v3.3 QA report

## Automated status

- Unit/integration tests: **22 passed / 0 failed**.
- `server.mjs`: syntax check passed.
- `media-connectors.mjs`: syntax check passed.
- Browser-side `.js` modules: Node syntax checks passed where applicable.
- `App.jsx`: TypeScript parser check passed with `--jsx preserve --noResolve`.

## Added coverage

### Durable media job core
- new job starts queued;
- running transition increments attempts;
- completed job reaches 100%;
- completed job is not considered resumable;
- failed job can be re-queued and clears its error.

### Extraction quality
- normal readable prose is rated strong;
- unreadable PDF pages/noisy text produce warnings and a degraded score.

### Gateway/CORS
- health endpoint reports v3.3;
- configured native origin receives `Access-Control-Allow-Origin`;
- OPTIONS preflight returns 204;
- private-network source ingestion remains blocked;
- model-backed routes still return connector-unavailable status with no API key.

### Existing regression coverage
- local summarization/keywords/semantic ranking;
- DOCX ZIP extraction;
- XLSX shared strings;
- HTML cleaning;
- chunk overlap;
- vector cosine ranking;
- RAG source provenance/citations;
- YouTube URL and caption parsing;
- time-coded caption sections;
- diarized speaker normalization;
- PDF vision page locators.

## Manual code-path review

- Analysis Workspace audio/video imports now create durable media jobs before transcription.
- Media page persists raw local media in IndexedDB and exposes retry/resume/delete controls.
- Indexed media sources store `mediaJobId` provenance so citation preview can reopen local playback.
- Source Preview receives the retrieved evidence text and highlights the matched excerpt.
- Timestamped local media preview seeks to evidence start time after metadata loads.
- Timestamped YouTube evidence embeds the source with the appropriate start offset.
- OCR/transcription quality is surfaced as a review heuristic, not represented as model confidence.
- Android/gateway split is explicit; API keys remain server-side.

## Known limits / blockers

### Production Vite bundle
`npm install --no-audit --no-fund` timed out in the current execution container. Because dependencies are unavailable locally, `npm run build` and Capacitor native generation cannot be honestly marked as completed here.

### Media resume semantics
v3.3 stores jobs and raw media durably and can retry after a reload. The upstream transcription request is still restarted as a whole. True byte-range/chunked upload and server-side media segmentation remain a future slice.

### Native Android artifact
Capacitor configuration/scripts are present, but the `android/` native project and signed APK/AAB require dependency installation plus Android SDK/Gradle execution.

## Release gate

Do not label v3.3 "production-ready APK" until all of the following pass:

1. clean `npm ci`/`npm install`;
2. `npm run build`;
3. `npx cap add android` / `npm run android:sync`;
4. Android Studio/Gradle debug build;
5. remote HTTPS gateway health + CORS test from WebView;
6. device tests for microphone, File picker, IndexedDB persistence and source-media seeking;
7. real OCR/transcription test with configured provider key;
8. accessibility and performance checks on 360–430 px mobile widths.
