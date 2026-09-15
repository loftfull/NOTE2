# NoteAI v3.6 security boundary

This document describes implemented controls and known gaps. It is intentionally conservative.

## Implemented

### Server-held provider key

`OPENAI_API_KEY` is read only by the Node gateway. The web/Android client does not receive it.

When `REQUIRE_ACCOUNT_AUTH=true`, cost-bearing ingestion/AI routes require a valid NoteAI account session.

### Account passwords

Account passwords are stored as salted `scrypt` records. Plaintext passwords are not written to the account JSON files.

### Device sessions

Every login creates a separate random bearer credential. Server session files contain a SHA-256 hash of the secret rather than the issued plaintext secret. Sessions have expiry timestamps, can be listed/revoked, and are capped per account.

Repeated failed login attempts are throttled per remote-address/email key. This is an application-level guard, not a replacement for provider-level WAF/rate limiting.

### Android credential at rest

The custom native Capacitor bridge uses a generated AES key in `AndroidKeyStore` and AES-GCM encryption for the device session credential. App backup is disabled to avoid restoring ciphertext onto a device that does not possess the original Keystore key.

Web/PWA stores the bearer only in `sessionStorage`.

### Credential leak prevention

The client injects the account bearer only when a request target has the same origin as the configured account gateway. Connector URLs on another origin do not automatically inherit the NoteAI session token.

Backup exports and remote workspace snapshots strip account/sync endpoint identity/revision fields and never contain the device bearer credential.

### SSRF boundary

Server-side URL ingestion rejects localhost/private-network destinations and validates redirects before downloading content.

## Not implemented yet

v3.6 does **not** currently provide:

- end-to-end encrypted cloud checkpoints;
- zero-knowledge server storage;
- two-factor authentication / passkeys;
- password reset or account-recovery email;
- email ownership verification;
- organization/team RBAC;
- distributed/global login rate limiting;
- multi-region session stores;
- Android biometric gating for credential use;
- remote deletion of local Source Vault/media after a session is revoked;
- cryptographic signing of exported backups.

The self-hosted gateway administrator can read account checkpoint JSON and controls the server-side provider key. Treat the gateway host as trusted infrastructure.

## Production checklist

- use HTTPS only;
- enable `REQUIRE_ACCOUNT_AUTH=true`;
- use a long random `REGISTRATION_TOKEN` only for initial bootstrap, then remove it;
- restrict `CORS_ORIGINS` to exact origins;
- keep `/var/data` on protected persistent storage;
- back up account/sync data according to your threat model;
- put the gateway behind provider firewall/WAF/rate controls;
- rotate provider and bootstrap secrets after suspected exposure;
- revoke lost-device sessions from another authenticated device;
- do not treat v3.6 checkpoint sync as confidential against the server operator.
