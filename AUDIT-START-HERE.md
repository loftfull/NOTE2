# NOTE2 — independent audit source

**Audit branch:** `audit/current-complete-source-2026-09-14`

This branch exists because the historical NOTE2 branches on GitHub do not contain the complete working application tree. Do **not** use `English`, `main`, `runtime/v4.10`, `release/v4.10-current`, old base64 fragments, or expired ChatGPT artifact URLs as the audit baseline.

The complete source bundle for the audit must be reconstructed from the verified bundle placed under `audit-source/` on this branch. Before auditing, run the bootstrap script in that directory and verify the SHA-256. After bootstrap, the repository root must contain at least:

- `package.json`
- `package-lock.json`
- `src/`
- `test/`
- `scripts/`
- `server.mjs`
- `capacitor.config.json`
- `render.yaml`

If any of these are missing after bootstrap, stop and report `AUDIT SOURCE INCOMPLETE`.

Read next:

1. `docs/audit/AUDIT-SOURCE-README.md`
2. `docs/audit/REAL-DEVICE-EVIDENCE.md`
3. `docs/audit/CLAUDE-INDEPENDENT-AUDIT-BRIEF.md`

The auditor must create a new branch from this branch and must not merge into `main`, change the default branch, force-push, delete historical branches, or deploy production without explicit permission.
