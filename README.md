# NOTE2

NOTE2 is the dedicated repository for the NoteAI project developed in this chat.

## Verified source of truth

The project source is **NoteAI**, not `BlockNoteAI` / Shadow Knowledge AI.

The latest recovered project package from this chat is:

- `NoteAI-v3.7-build-candidate.zip`
- package name: `noteai-v3`
- package version: `3.6.0`
- frontend: React 19 + Vite 8
- local-first data layer: IndexedDB Source Vault + local workspace/settings storage
- gateway/runtime: Node.js `server.mjs`
- multimodal ingestion: PDF, Office/archive formats, EPUB, images/OCR, audio/video transcription, URLs and YouTube captions
- retrieval: lexical/vector RAG with source locators and clickable evidence
- large media: resumable upload + FFmpeg segmentation + durable single-node queue
- account/device sessions and checkpoint sync
- deployment: Docker + Render profile
- Android: Capacitor 8 preparation path

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

This repository currently contains architecture/bootstrap documentation only. The verified NoteAI v3.7 build-candidate source must be imported here directly from the recovered project package, not from another GitHub project.

The former cross-project mirror scripts have been removed.

## Next implementation step

1. Import the verified NoteAI v3.7 build-candidate snapshot into NOTE2.
2. Run its existing regression suite and build gates.
3. Only after the baseline is reproduced, continue with the universal `SourceAdapter`/analysis-graph evolution.
