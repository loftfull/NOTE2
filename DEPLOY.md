# NoteAI v3.6 deployment profile

The current production gateway is designed as a persistent single-node service because it combines HTTP APIs, resumable upload state, a durable disk-backed worker queue, account sessions and checkpoint sync.

The repository includes a Docker profile and a Render Blueprint. They are deployment configuration, not a claim that this exact checkout has already been deployed.

## Required persistent paths

`render.yaml` mounts `/var/data` and stores:

```text
/var/data/uploads       resumable upload sessions + durable queue metadata
/var/data/sync          legacy v3.5 checkpoint snapshots
/var/data/auth          accounts + hashed device sessions
/var/data/account-sync  account-scoped workspace checkpoints
```

Do not move these to an ephemeral filesystem if restart recovery/sync persistence matters.

## Production secrets and settings

At minimum configure:

```text
OPENAI_API_KEY=<secret>
REGISTRATION_TOKEN=<long random bootstrap secret>
REQUIRE_ACCOUNT_AUTH=true
CORS_ORIGINS=https://your-web-origin.example,https://localhost
```

Recommended defaults in `render.yaml`:

```text
ACCOUNT_SESSION_TTL_DAYS=30
ACCOUNT_MAX_SESSIONS=12
LOGIN_MAX_FAILURES=8
LOGIN_WINDOW_MS=300000
MAX_LARGE_MEDIA_TASKS=2
UPLOAD_CHUNK_BYTES=6291456
MEDIA_SEGMENT_SECONDS=600
LARGE_MEDIA_TTL_HOURS=24
```

`SYNC_TOKEN` remains only for backwards-compatible v3.5 legacy checkpoint sync. New installations should use account sync instead.

## Bootstrap sequence

1. Deploy with `REGISTRATION_TOKEN` set to a long random secret.
2. In NoteAI Settings enter the account gateway URL, email/password and the registration token.
3. Create the owner account and verify sign-in from the intended devices.
4. Remove `REGISTRATION_TOKEN` from the service environment and redeploy/restart. Registration will then return `503` and no new account can self-register.
5. Keep `REQUIRE_ACCOUNT_AUTH=true` on any public gateway.
6. Keep `OPENAI_API_KEY` only in server-side environment/secrets.

## Gateway auth boundary

When `REQUIRE_ACCOUNT_AUTH=true`, account session authentication is required for AI, embeddings, URL ingestion, vision/OCR, direct transcription, YouTube ingestion and all resumable upload routes.

Account session tokens are independently revocable. The server stores a hash of each session secret; it does not need the plaintext bearer after issuance.

Login protection is intentionally basic/self-hosted: repeated failures for the same client/email pair are rate-limited in process memory and active device sessions are capped. Put a public deployment behind the provider firewall/WAF/rate-limiting layer as an additional boundary.

## Large-media worker semantics

A completed resumable upload enters a disk-persisted `queued` state. The server drains jobs FIFO while fewer than `MAX_LARGE_MEDIA_TASKS` are active.

On restart:

- `queued` jobs remain queued;
- an interrupted `processing` job with all chunks intact returns to `queued`;
- an interrupted incomplete upload becomes `failed` rather than pretending it is recoverable;
- SIGTERM stops new task starts while active tasks get the configured shutdown window.

This is deliberately a single-node durable queue. If the product later needs horizontal workers, job metadata/blobs must move to shared object storage/database/queue infrastructure before enabling multiple worker replicas.

## Sync semantics

Account sync is checkpoint sync with optimistic concurrency:

- `GET /api/account/sync/:workspace` retrieves the latest account checkpoint;
- `PUT` includes the device's `baseRevision`;
- mismatched revisions return `409 revision_conflict`;
- raw local media Blobs stay on-device;
- remote snapshots contain notes/tasks/chats, settings stripped of local auth/sync credentials, Source Vault metadata and chunks.

Remote checkpoints are currently **server-readable plaintext JSON**. v3.6 does not provide end-to-end encryption, password recovery, 2FA or multi-user collaborative permissions. See `SECURITY.md`.

## Health gate

`GET /api/health` is public so platform health checks can function. It reports capability/configuration booleans and limits but not API keys or session secrets.
