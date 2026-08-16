# NOTE2 — Verified NoteAI baseline audit

Date: 2026-08-16

This document is based only on the recovered NoteAI source from the current project/chat line. No external GitHub repository was used as a source of application code or architecture.

## Source identity

Verified import artifact:

- file: `NoteAI-v3.7-verified-source.zip`
- SHA-256: `faf8695578a1fc613e63325001dafbfcdb02c1f9b565c4692e027e2799ec0bee`
- file-count fingerprint used during verification: 73 files
- package name: `noteai-v3`
- package version reported by `package.json`: `3.6.0`
- module type: ESM

The `v3.7` label is therefore a **build-candidate label**, not a verified in-product semantic version. Runtime/UI/server/backup identifiers remain v3.6 and must not be silently renamed until a real v3.7 release is cut.

## Recovered-candidate defect

The originally recovered `NoteAI-v3.7-build-candidate.zip` was not suitable for direct import.

Its existing test suite referenced:

```text
native/android/SecureCredentialsPlugin.java
```

but that file was missing from the archive, causing 38/39 tests to pass.

The verified source restores the Android Capacitor plugin required by the project's own `scripts/prepare-android.mjs` and security test. The restored implementation uses:

- `AndroidKeyStore`;
- AES-256 key generation;
- `AES/GCM/NoPadding`;
- app-private SharedPreferences for IV+ciphertext only;
- no `EncryptedSharedPreferences` dependency.

After restoration, the existing regression suite passes **39/39**.

## Verification performed before import

### Node syntax

All `.js` / `.mjs` files pass `node --check`.

### JSX parse

`src/App.jsx` and `src/main.jsx` pass a TypeScript JSX parse-only gate with no diagnostics.

### Regression suite

```text
39 tests
39 pass
0 fail
```

The suite includes account/session guards, SSRF protection, hybrid RAG provenance, Office extraction, resumable upload math, real FFmpeg segmentation integration, worker queue recovery, YouTube/caption locators, Android credential bridge checks, account sync conflicts and deployment config checks.

### Production build

A full clean Vite production build is **not yet claimed as passed** for this verified import snapshot. The recovered source has no installed dependency tree in the verification environment.

## Reproducibility blocker

The verified source contains `package.json` but **does not contain `package-lock.json`**.

This means the exact dependency graph is not yet pinned. Before declaring NOTE2 baseline reproducible:

1. perform a clean install using a supported Node runtime;
2. generate and review `package-lock.json`;
3. run `npm test` again;
4. run `npm run build`;
5. commit the lockfile only after those gates pass.

Do not create a lockfile by hand or by copying one from another project.

## Actual architecture fingerprint

The recovered NoteAI codebase is:

- React 19 + Vite 8 frontend;
- Node ESM gateway in `server.mjs`;
- local-first workspace/settings storage;
- IndexedDB Source Vault;
- lexical/vector RAG with evidence locators;
- PDF.js extraction;
- dependency-light Office/archive/EPUB extraction;
- server-side OpenAI-compatible AI/embed/vision/transcription gateway;
- public YouTube caption connector when captions genuinely exist;
- resumable large-media upload;
- FFmpeg time segmentation and merged timestamp evidence;
- durable single-node disk worker queue with restart recovery;
- self-hosted account/device sessions and revision-guarded checkpoint sync;
- Docker/Render deployment profile;
- Capacitor 8 Android preparation path.

It is **not** a Next.js/Auth.js/Prisma/BullMQ application.

## Maintainability observations

Approximate source sizes in the verified snapshot:

- `src/App.jsx`: ~85 KB;
- `server.mjs`: ~52 KB;
- `src/styles.css`: ~21 KB;

The application already has useful lower-level modules (`ingest`, `rag`, `source-db`, `media-jobs`, `resumable-upload`, `account-sync-api`, etc.), but UI orchestration remains heavily concentrated in `App.jsx`, while HTTP/gateway orchestration remains concentrated in `server.mjs`.

This is a maintainability issue, but **not** a reason for a big-bang rewrite. The baseline must build first.

## Baseline gates before feature refactoring

Order is mandatory:

1. import this verified snapshot into a dedicated NOTE2 branch;
2. compare imported tree to the verified source identity/checksum manifest;
3. clean dependency install and reviewed `package-lock.json`;
4. `npm test` green;
5. `npm run build` green;
6. Node gateway health/smoke;
7. only then begin structural refactors.

## First structural work after green baseline

The safest next code changes are bounded extractions from existing code, not architecture replacement:

1. extract source-detection/ingestion orchestration from UI into a `SourceAdapter` registry around **existing implementations**;
2. keep `src/ingest.js`, PDF/archive extractors and YouTube connector behavior unchanged behind adapters initially;
3. extract API route dispatch from `server.mjs` only after route-level regression coverage exists;
4. progressively split `App.jsx` by stable product surfaces (Analyze, Source Preview, Search, Media, Settings) without redesigning everything at once;
5. add reusable analysis-run/evidence abstractions only after the import/build baseline is reproducible.

## Project-boundary requirement

Every future repository/library comparison remains read-only until its role is explicitly classified as one of:

- current project source;
- external reference;
- candidate dependency;
- independent/unrelated project.

Only **current project source** may be imported wholesale. Similarity of purpose or stack is never sufficient evidence.
