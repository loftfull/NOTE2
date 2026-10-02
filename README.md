# NoteAI v3.6 — Secure Sessions & Durable Workers

NoteAI is a local-first notebook and multimodal evidence workspace. Notes, documents, web pages, images, scanned PDFs, audio/video and YouTube captions are normalized into one Source Vault, searched through lexical/vector retrieval, and used for provenance-backed answers with clickable evidence.

v3.6 deliberately concentrates on reliability and deployment security rather than adding another set of UI features. New workspaces start empty: NoteAI no longer auto-populates fake seed notes or tasks.

## What v3.6 adds

### Durable server-side media worker queue

Large media no longer depends on one HTTP request staying alive until transcription finishes.

- resumable browser upload sessions persist on the gateway disk;
- completed uploads enter a FIFO `queued` state;
- the gateway starts at most `MAX_LARGE_MEDIA_TASKS` heavy jobs at once;
- additional jobs remain accepted and queued instead of returning capacity `429` errors;
- queue state survives a gateway restart because it lives in each upload session `meta.json`;
- interrupted `processing` sessions with all chunks intact are recovered to `queued` on startup;
- FFmpeg reconstructs the original media, extracts audio and performs time-based segmentation;
- segment timestamps are rebased into one continuous evidence timeline;
- SIGTERM stops new work and gives active tasks a bounded shutdown window;
- stale upload sessions are removed by TTL cleanup.

This is a durable single-node disk queue, not a distributed message broker. The current Render profile intentionally runs one persistent-disk instance.

### Account and per-device sessions

The old v3.5 shared checkpoint token remains available only as a migration/legacy mode. v3.6 adds a separate self-hosted account layer:

- registration can be closed completely by leaving `REGISTRATION_TOKEN` unset;
- passwords are stored as salted `scrypt` derivation records, never plaintext;
- login issues a different random session credential to every browser/device;
- only a SHA-256 hash of the session secret is persisted server-side;
- sessions expire, can be listed and revoked individually;
- `ACCOUNT_MAX_SESSIONS` limits the number of active device sessions per account;
- repeated failed logins are throttled per client/email pair with `429` + `Retry-After`;
- account workspace checkpoints are isolated by account id;
- Push uses a monotonic revision guard, so stale devices receive `409 revision_conflict` instead of silently overwriting newer data.

### Protected AI/ingestion gateway

With `REQUIRE_ACCOUNT_AUTH=true`, these cost-bearing/private routes require a valid device session:

```text
/api/ai
/api/embed
/api/source-url
/api/vision
/api/transcribe
/api/youtube
/api/uploads/*
```

The browser attaches the account bearer only when the connector origin matches the configured account gateway origin. A third-party connector URL therefore does not automatically receive the NoteAI session credential.

URL ingestion now follows the configured AI gateway origin as well. This fixes the native Android case where `/api/source-url` cannot assume the packaged app and the Node gateway share an origin.

### Android secure credential bridge

`native/android/SecureCredentialsPlugin.java` is installed automatically by `npm run android:prepare`.

- a 256-bit AES key is created inside `AndroidKeyStore`;
- the key is not written to JavaScript storage;
- the session credential is encrypted with AES-GCM before being stored in app-private SharedPreferences;
- Android backup is disabled for the app to avoid copying encrypted credential blobs across devices without their Keystore key;
- web/PWA fallback uses `sessionStorage`, not localStorage, so the credential is removed with the browser session;
- JSON backup and cloud workspace snapshots never contain the account session credential.

See `SECURITY.md` for the exact trust boundary and current limitations.

### Account checkpoint sync

Account sync is explicit checkpoint sync, not live collaborative CRDT sync:

```text
GET /api/account/sync/:workspaceId
PUT /api/account/sync/:workspaceId
```

Pull replaces the local workspace and Source Vault metadata/chunks only after user confirmation. Local queued media Blobs remain on the originating device. Remote snapshots are server-readable and are **not end-to-end encrypted** in v3.6.

### Deployment profile

The repository contains:

```text
Dockerfile
render.yaml
DEPLOY.md
SECURITY.md
```

The Docker runtime installs FFmpeg/ffprobe, serves the built Vite client through the same Node gateway, and keeps account/session/sync/upload state on the configured persistent data volume.

## Source and evidence pipeline

Current ingestion includes:

- TXT / Markdown / CSV / JSON / HTML / XML / YAML / source code;
- DOCX / PPTX / XLSX;
- ODT / ODS / ODP;
- EPUB;
- page-aware PDF text extraction;
- vision/OCR fallback for images and scanned PDFs;
- audio/video transcription with timestamp/speaker evidence;
- public YouTube caption ingestion when captions are actually retrievable;
- URL ingestion with private-network/SSRF protection.

Evidence chunks keep source ids and locators. Clicking `[S#]` can reopen a PDF page, local media timestamp, YouTube timestamp, imported text excerpt or original web source.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Production-style local server:

```bash
npm run build
npm start
```

### Minimum production secrets

```text
OPENAI_API_KEY=<server-side key>
REGISTRATION_TOKEN=<long random bootstrap secret>
REQUIRE_ACCOUNT_AUTH=true
CORS_ORIGINS=https://your-web-app.example,https://localhost
```

After owner accounts have been created, remove/clear `REGISTRATION_TOKEN` to close self-registration. Keep the account/auth and sync directories on persistent storage.

## Android

```bash
npm install
npm run android:prepare
cd android
./gradlew assembleDebug
```

`android:prepare` builds the web client, creates/syncs the Capacitor Android platform, applies SDK/Java/permission patches, installs the Keystore credential plugin and disables Android backup. See `ANDROID.md`.

## QA status

Current source-level/integration regression result:

```text
39 tests
39 passed
0 failed
```

The test suite includes real FFmpeg segmentation, resumable/restart recovery, FIFO worker draining, account registration/login/revoke, account sync conflicts, login throttling/session caps, SSRF protection, Android credential bridge checks, Office extraction, RAG provenance and backup compatibility.

`node_modules` cannot currently be installed in the execution environment because npm registry DNS/network resolution is unavailable. Therefore `npm run build`, generated `android/`, Gradle build and a physical APK/device run are **not claimed as passed** in this release.

See `QA-v3.6.md` for the release gate matrix.
