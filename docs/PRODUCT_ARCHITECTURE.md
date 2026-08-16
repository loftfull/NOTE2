# NOTE2 — Verified Product Architecture

## Product identity

NOTE2 is the repository for the NoteAI line developed in this chat: a local-first notebook and multimodal evidence workspace that can ingest files and URLs and produce provenance-backed analysis.

This document is intentionally based only on the recovered NoteAI project package and conversation history. It does not inherit architecture from unrelated GitHub repositories.

## Verified baseline stack

Recovered build candidate:

- package: `noteai-v3`
- version: `3.6.0`
- frontend: React 19
- bundler/dev server: Vite 8
- gateway/runtime: Node.js `server.mjs`
- PDF parsing: `pdfjs-dist`
- Android path: Capacitor 8
- browser persistence: IndexedDB Source Vault + local workspace/settings storage
- deployment profile: Docker + Render
- media processing: FFmpeg/ffprobe on the gateway

## Verified functional baseline

The current project already contains:

- note/task/chat workspace;
- local-first persistence;
- Source Vault in IndexedDB;
- deterministic local AI fallback;
- lexical/vector retrieval and grounded RAG;
- page/time/source provenance;
- TXT/Markdown/CSV/JSON/HTML/XML/YAML/source-code ingestion;
- DOCX/PPTX/XLSX/ODT/ODS/ODP/EPUB extraction;
- page-aware PDF extraction;
- vision/OCR fallback for images and scanned PDFs;
- audio/video transcription with timestamp/speaker evidence;
- YouTube caption ingestion when captions are genuinely available;
- SSRF-protected URL ingestion;
- clickable evidence navigation;
- resumable large-media upload;
- durable single-node media processing queue;
- account/device sessions and checkpoint sync;
- Android secure-credential preparation path;
- Docker/Render deployment configuration.

## Architectural direction

The next evolution must extend this baseline rather than replace it with a different application stack.

### 1. Source abstraction

All user inputs should converge on one source contract:

```text
Source
  ├─ provenance
  ├─ metadata
  ├─ representations
  ├─ evidence anchors
  ├─ analysis runs
  └─ relationships
```

Existing Source Vault records/chunks remain the migration anchor.

### 2. Reusable representations

Expensive extraction must be reusable across analysis modes.

Examples:

- native PDF text;
- OCR text;
- document structure;
- transcript;
- diarized transcript;
- scene/frame observations;
- embeddings;
- extracted entities.

A second analysis mode must not retranscribe or reparse the source when an equivalent representation already exists.

### 3. Analysis graph

Analysis becomes a dependency graph over source representations rather than one monolithic prompt.

Target modes:

- QUICK;
- FULL;
- SIMPLE;
- EXPANDED;
- VERIFIED;
- COMPARE.

Each run records the model/provider/version and evidence used.

### 4. Evidence first

Claims and findings must remain traceable to exact source locators:

- PDF page;
- timestamp range;
- speaker segment;
- document section;
- web URL/fragment;
- image region when available.

The UI should let the user move directly from a conclusion to the evidence.

### 5. Mobile-first Result Workspace

The result screen should behave like a professional working document, not a generic AI dashboard.

Priority hierarchy:

1. source identity and status;
2. concise overview;
3. important findings;
4. evidence/verification;
5. timeline/pages/sections;
6. entities/tasks/decisions/risks;
7. related sources;
8. contextual Ask NOTE2.

On desktop this can become a source/evidence split view. On mobile, evidence opens as a focused sheet/view without losing the analysis context.

## Reliability constraints

These constraints are inherited from the verified NoteAI baseline:

- no fabricated transcript/caption/OCR result;
- large-media recovery must not require a new upload after a recoverable interruption;
- credentials never belong in exported workspace backups;
- account/session credentials are scoped to the configured gateway origin;
- SSRF protection remains mandatory for URL acquisition;
- PWA/mobile storage must not expose previous-user private content;
- Android signing/build claims are not made until an actual build/device gate passes.

## Technology rule

Do not introduce a new framework, database, auth system, queue system or storage layer merely because another GitHub project uses it.

A new dependency is accepted only when it improves a specific NOTE2 capability and can be isolated behind an adapter with a testable failure/removal path.

## Next verified sequence

### Phase 0 — restore canonical source

- import `NoteAI-v3.7-build-candidate.zip` into NOTE2;
- reproduce the existing tests;
- run a real Vite production build when dependency/network access permits;
- verify Docker/gateway startup;
- establish NOTE2 as the only write target for this project.

### Phase 1 — SourceAdapter registry

Wrap existing local-file, URL and YouTube ingestion behind one typed adapter registry without changing persistence first.

### Phase 2 — representation reuse

Formalize versioned reusable extraction artifacts and cache keys.

### Phase 3 — analysis graph and claims

Add analysis planning, reusable modes, claims and evidence links incrementally.

### Phase 4 — Result Workspace

Build compact mobile-first evidence navigation and multi-mode switching.

### Phase 5 — additional acquisition adapters

Only after the shared contract is stable, benchmark and add Instagram/social and other difficult acquisition paths.

## Boundary protection

Repository/project provenance rules are defined in [`PROJECT_BOUNDARY.md`](PROJECT_BOUNDARY.md) and are mandatory for every future GitHub operation.
