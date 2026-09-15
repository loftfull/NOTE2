# NoteAI v3.5 QA Gate

Date: 2026-08-16

## Release scope

v3.5 closes three architecture gaps left after v3.3: true large-media resumability, restart-safe gateway processing, and conflict-guarded self-hosted checkpoint sync. It also adds a concrete persistent Docker/Render deployment profile and strengthens the Android generation path.

## Automated verification

Result: **30 / 30 tests passing**.

Covered areas include:

- local summarization/keywords/semantic scoring;
- ZIP, DOCX and XLSX extraction;
- extraction-quality heuristics;
- chunking, vector similarity and RAG provenance;
- durable media-job state transitions;
- resumable chunk math and endpoint routing;
- real FFmpeg large-media integration with a generated 61-second WAV;
- continuous timestamp rebasing across two server segments;
- YouTube URL/caption parsing;
- diarized transcription normalization;
- PDF vision page locators;
- gateway restart recovery from persisted complete chunks;
- CORS for the Android default `https://localhost` origin;
- SSRF/private-network blocking;
- resumable upload init/chunk/status/delete server protocol;
- checkpoint sync authorization, Push/Pull and 409 revision conflict;
- v3.5 backup round-trip and older backup compatibility;
- sync credential redaction/path-safe workspace IDs;
- Docker/Render deployment-profile invariants.

## Static checks

Passed:

```text
node --check server.mjs
node --check media-connectors.mjs
node --check large-media-core.mjs
node --check sync-core.mjs
node --check src/sync-api.js
node --check src/resumable-upload.js
node --check scripts/prepare-android.mjs
```

`src/App.jsx` and `src/main.jsx` were passed through TypeScript `transpileModule`: **0 errors**.

Browser-source audit: **no `node:` imports under `src/`**.

`render.yaml`: parsed successfully with PyYAML 6.0.3 and checked for persistent `/var/data`, `/api/health`, separate upload/sync roots and uncommitted secret values.

Runtime available during QA:

```text
Node v22.16.0
npm 10.9.2
FFmpeg 7.1.5
```

## End-to-end large-media integration

The test suite creates a real 61-second WAV with FFmpeg, sends it through the resumable gateway, lets the gateway reconstruct the file and create two time segments, feeds those segments to a local mock transcription endpoint and verifies that the second evidence segment begins after 59 seconds. This verifies the transport + reconstruction + FFmpeg + timeline merge path rather than only testing helper functions.

## Restart recovery

A second integration test pre-populates a persistent upload directory in `processing` state with all required chunks, starts the gateway and verifies startup recovery changes the state to `ready/recovered` without requiring those chunks to be uploaded again.

The production server also handles SIGTERM by stopping new requests and waiting up to 110 seconds for active large-media tasks, fitting inside the supplied Render profile's 120-second shutdown allowance. If a process is still interrupted, persisted complete chunks are recoverable on the next start.

## Sync semantics verified

The current sync implementation is a trusted-device checkpoint protocol, not account auth or live collaboration. Tests verify:

- missing/incorrect Bearer token → 401;
- first Push from base revision 0 → revision 1;
- Pull returns revision 1 and snapshot;
- another Push claiming base revision 0 → 409 `revision_conflict`;
- sync token/config fields are stripped from remote snapshots;
- JSON workspace backup redacts the sync token;
- raw media job Blobs are not placed into remote checkpoint snapshots.

## Build / native limitations

These gates were attempted or inspected but **not falsely marked as passing**:

1. `npm install --no-audit --no-fund` was retried with a 25-second cap and timed out in this container (`exit 124`). Any partial `node_modules`/lockfile output was removed afterward.
2. Therefore `npm run build` could not be truthfully executed for v3.5 in this runtime.
3. Docker CLI is not installed, so the new Dockerfile could not be image-built locally here.
4. Android SDK/Gradle are not installed and npm dependencies are unavailable, so `android/`, APK and AAB were not generated.
5. No live Render URL is claimed. `render.yaml` is a deployment profile awaiting repository/cloud execution.

## Known release risks

- Checkpoint sync uses one shared secret and local app-profile storage; it is not multi-user auth, E2EE or hardware-backed Android credential storage.
- Persistent-disk deployment is intentionally single-instance in the supplied Render profile. Scaling the media worker needs a shared object store/queue architecture rather than multiple instances writing the same local-disk protocol.
- Speaker identity across separately transcribed FFmpeg segments is not guaranteed; timestamps are continuous, speaker labels may reset.
- A current Capacitor 8 Android 16 SystemBars safe-area startup issue must be tested on a real Android 16 device before signing a release.
- The Docker build currently uses `npm install` because a package lock cannot be generated without registry access in this environment. A successful connected build should generate/commit the lockfile before reproducible production release.

## v3.5 disposition

**Core logic / gateway protocol: PASS.**

**Production web bundle: BLOCKED BY LOCAL REGISTRY ACCESS.**

**Native Android build/APK: NOT YET EXECUTED.**

**Live cloud deployment/device QA: NOT YET EXECUTED.**
