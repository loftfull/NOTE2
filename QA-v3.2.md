# NoteAI v3.2 QA snapshot

## Automated checks

- `npm test` — 16 passed, 0 failed.
- `node --check server.mjs` — passed.
- `node --check media-connectors.mjs` — passed.
- TypeScript parser syntax validation: `src/App.jsx`, `src/main.jsx`, `src/media-api.js`, `src/source-index.js`, `src/storage.js` — passed.
- TypeScript `transpileModule` check for `App.jsx` — 0 errors.

## Covered by tests

- local keyword, summary and semantic-note ranking
- DOCX deflate extraction
- XLSX shared strings
- HTML cleaning
- text chunking
- cosine similarity and RAG provenance
- YouTube URL parsing
- public caption-track extraction
- caption timestamp normalization
- diarized speaker/time normalization
- vision/PDF page locator splitting
- server health
- private-network URL blocking
- vision/transcription no-key failure behavior
- invalid YouTube URL rejection

## Not fully verified in this container

- Full Vite production bundle: npm registry resolution is unavailable in this runtime, so dependencies cannot be installed here.
- Live OpenAI vision/transcription calls: no user API key is present in the development container.
- Live YouTube caption retrieval: parser logic is unit-tested, but outbound connector execution is environment/network dependent.
- Real-device Android/PWA interaction and microphone permission UX still require browser/device QA.
- Connected Vercel deploy was attempted, but the exposed deployment tool schema could not accept the required file/target parameters.
