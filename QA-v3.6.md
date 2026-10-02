# NoteAI v3.6 QA — Secure Sessions & Durable Workers

## Release result

```text
Automated tests: 39
Passed:          39
Failed:           0
```

The release is source/integration-green. It is **not yet marked binary-release-green** because the current execution environment cannot resolve the npm registry and therefore does not contain the Vite/Capacitor dependency tree.

## Passing automated coverage

### Account/security

- salted scrypt password record; plaintext password absent from account file;
- per-device random session token; only session secret hash persisted;
- account registration bootstrap token;
- protected AI/ingestion routes when `REQUIRE_ACCOUNT_AUTH=true`;
- list/revoke/logout device sessions;
- account isolation for sync checkpoints;
- optimistic revision conflict returns HTTP 409;
- active device-session cap removes the oldest active session;
- repeated failed logins return HTTP 429 + `Retry-After`;
- account/sync credentials are redacted from workspace snapshots/backups;
- API session bearer is injected only into the configured account-gateway origin;
- Android credential plugin statically verifies Android Keystore + AES-GCM and no EncryptedSharedPreferences;
- remote gateway sibling URL derivation keeps source ingestion/health on the configured gateway origin;
- web credential fallback uses sessionStorage and not localStorage.

### Durable large media

- deterministic resumable upload math;
- chunk validation and server status/resume;
- real FFmpeg end-to-end integration using a 61-second WAV;
- time segmentation and merged/rebased transcript timestamps;
- FIFO server-side durable queue accepts work beyond active worker capacity;
- restart recovery returns a complete interrupted processing job to queued without re-uploading chunks;
- incomplete restart state fails explicitly rather than pretending recovery;
- media job state-machine transitions/retry;
- extraction quality checks.

### Evidence/ingestion

- local keyword/summary/semantic scoring;
- Office ZIP reading, DOCX extraction, XLSX shared strings;
- HTML cleanup;
- bounded overlapping chunks;
- cosine vector ranking;
- RAG provenance/citation preservation;
- YouTube URL/caption parsing;
- timestamped caption evidence;
- diarized transcript normalization;
- vision/PDF page locator preservation;
- SSRF/private-network URL-ingestion rejection.

### Deployment/config

- Docker installs FFmpeg and performs Vite build stage;
- runtime copies ESM package metadata + account-auth core;
- Render profile mounts persistent `/var/data`;
- upload, legacy sync, auth and account-sync paths live under persistent data;
- account auth is enabled for the production profile;
- account session/login guard settings are present;
- no literal OpenAI-style key is committed in render.yaml.

## Static checks

Passed:

```text
server.mjs                    node --check OK
account-auth-core.mjs         node --check OK
scripts/prepare-android.mjs   node --check OK
media-connectors.mjs          node --check OK
large-media-core.mjs          node --check OK
sync-core.mjs                 node --check OK
package.json                  JSON parse OK
capacitor.config.json         JSON parse OK
public/manifest.webmanifest   JSON parse OK
src/** node: imports          none
secret-pattern scan          clear
automatic demo-seed scan     clear
```

TypeScript `transpileModule` parser check:

```text
src/App.jsx                 0 errors
src/main.jsx                0 errors
src/secure-credentials.js   0 errors
src/api-session.js          0 errors
src/account-sync-api.js     0 errors
src/gateway-url.js          0 errors
src/resumable-upload.js     0 errors
src/ai.js                   0 errors
src/media-api.js            0 errors
src/embeddings.js           0 errors
```

## Build gate that is NOT passed in this environment

Attempted:

```text
npm run build
→ sh: vite: not found
```

Reason: `node_modules` is absent. A subsequent dependency install attempt failed before resolution:

```text
npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=4000
→ EAI_AGAIN getaddrinfo registry.npmjs.org
```

Therefore this QA report does not claim:

- Vite production bundle success;
- generated `android/` project;
- Gradle compile;
- debug APK/AAB generation;
- Android emulator/physical-device execution;
- live Docker/Render deployment.

## Mandatory next binary/device gates

1. Run `npm install` on a networked machine/CI runner.
2. Run `npm test` and `npm run build`.
3. Run `npm run android:prepare`.
4. Run `cd android && ./gradlew assembleDebug`.
5. Install debug APK on Android 16 and at least one earlier supported Android version.
6. Verify login/session restore/revoke with a real HTTPS gateway.
7. Verify microphone permission and recorder.
8. Interrupt/resume a 500 MB+ media upload.
9. Restart the gateway while one job is processing and another queued.
10. Verify status/nav/keyboard safe-area behavior on physical mobile screens.
11. Verify release signing/AAB separately from debug APK.

## Known security/product limitations

See `SECURITY.md`. Most importantly, account checkpoint sync is server-readable and is not end-to-end encrypted; no password recovery, email verification, passkeys/2FA or organization RBAC is claimed in v3.6.
