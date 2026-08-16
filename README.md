# NOTE2

NOTE2 is the dedicated repository for the NoteAI project developed in this chat.

## Verified source of truth

The project source is **NoteAI**, not `BlockNoteAI` / Shadow Knowledge AI.

The verified import package is:

- `NoteAI-v3.7-verified-source.zip`
- SHA-256: `faf8695578a1fc613e63325001dafbfcdb02c1f9b565c4692e027e2799ec0bee`
- package name: `noteai-v3`
- package version reported by the source: `3.6.0`
- frontend: React 19 + Vite 8
- local-first data layer: IndexedDB Source Vault + local workspace/settings storage
- gateway/runtime: Node.js `server.mjs`
- multimodal ingestion: PDF, Office/archive formats, EPUB, images/OCR, audio/video transcription, URLs and YouTube captions
- retrieval: lexical/vector RAG with source locators and clickable evidence
- large media: resumable upload + FFmpeg segmentation + durable single-node queue
- account/device sessions and checkpoint sync
- deployment: Docker + Render profile
- Android: Capacitor 8 preparation path + Android Keystore credential bridge

The originally recovered `NoteAI-v3.7-build-candidate.zip` was not imported because verification exposed one missing source file: `native/android/SecureCredentialsPlugin.java`. The verified package restores that file and passes the existing regression suite **39/39** before import.

No other GitHub repository is considered part of NOTE2 unless its provenance is explicitly verified against this project.

## Project boundary rule

Before any external repository, branch or codebase may be imported, all of these must be verified:

1. exact repository identity;
2. branch identity;
3. README/package/runtime stack;
4. commit ancestry or explicit user confirmation;
5. feature ownership relative to NOTE2;
6. no destructive mirror/push operation across unrelated repositories.

Similarity of topic, naming or technology is **not** evidence of project identity.

See [`docs/PROJECT_BOUNDARY.md`](docs/PROJECT_BOUNDARY.md).

## Product direction

NOTE2 remains a universal local-first evidence notebook and media/document analyzer:

- notes and documents;
- PDF and scanned PDF;
- DOCX / PPTX / XLSX / ODT / ODS / ODP;
- EPUB;
- images and OCR/vision;
- audio/video transcription with timestamps/speakers;
- YouTube captions when genuinely available;
- URL ingestion with SSRF protection;
- grounded analysis and evidence citations;
- reusable Source Vault and search;
- Android/PWA/mobile delivery.

## Current repository state

`main` contains only the NOTE2 project boundary, architecture documents and the guarded verified-import tool. The application source is imported into a dedicated branch first; it is not copied from any other GitHub repository.

Safe import command after downloading the verified ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-verified-noteai.ps1 -ZipPath "C:\path\to\NoteAI-v3.7-verified-source.zip"
```

The guard checks the exact ZIP SHA-256, exact `loftfull/NOTE2` origin, clean `main`, required source files and `npm test` before it creates/pushes `import/noteai-v3.7-verified`.

## Next implementation step

1. Import the verified NoteAI snapshot into `import/noteai-v3.7-verified`.
2. Re-run regression suite and build gates from that branch.
3. Compare imported tree against the verified source manifest.
4. Only after the baseline is reproduced, continue with bounded SourceAdapter / analysis-graph evolution.
