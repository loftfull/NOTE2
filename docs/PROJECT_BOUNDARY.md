# NOTE2 — Project Boundary and Provenance Guardrails

This file defines mandatory checks before any GitHub repository, branch, archive or codebase may be treated as part of NOTE2.

## Core rule

**No repository is related to NOTE2 by similarity.**

A similar name, stack, feature set, owner account, recent activity or AI/media theme is not proof of project identity.

## Required provenance check

Before any cross-repository read becomes a write/import/merge action, record and verify:

1. **Target identity** — exact `owner/repository` supplied for the current project.
2. **Source identity** — exact source archive/repository/branch.
3. **User confirmation or conversation lineage** — evidence that the source belongs to this project.
4. **Runtime fingerprint** — package name, framework, entry points and storage model match the known project baseline.
5. **Commit/history relationship** — where Git history exists, verify ancestry rather than infer it.
6. **Scope comparison** — identify what files/features are intended to move.
7. **Destructive-operation review** — mirror, force push, branch deletion, default-branch change and history rewrite require explicit confirmation after the above checks.

If any item is unresolved, the operation stops at read-only inspection.

## Verified NOTE2 baseline

The verified source line is NoteAI from this chat.

Current recovered build candidate fingerprint:

```text
archive: NoteAI-v3.7-build-candidate.zip
package: noteai-v3
version: 3.6.0
frontend: React 19
build: Vite 8
runtime/gateway: Node.js server.mjs
browser persistence: IndexedDB Source Vault + local workspace/settings storage
Android: Capacitor 8 path
```

## Explicitly unrelated source

`loftfull/BlockNoteAI` / Shadow Knowledge AI is a separate project and must not be mirrored, merged, cherry-picked or treated as NOTE2 history without a future explicit user request that names that repository and desired cross-project feature.

Its existence in the same GitHub account does not imply relationship.

## Branch-name rule

A branch name such as `main`, `English`, `develop`, `claude/...` or `chatgpt/...` has no semantic ownership by itself.

Before using a branch:

- inspect its root commit/history;
- inspect README/package metadata;
- verify it belongs to the current repository/project;
- never infer project identity from the branch name.

## New-repository initialization rule

When a repository is reported as newly created/empty:

- treat GitHub `default_branch` metadata as a repository setting, not proof that a populated project branch exists;
- inspect refs/commits before writing;
- initialize only after verifying there is no existing project content;
- do not use a cross-project mirror to populate it unless the source is explicitly confirmed.

## Allowed future cross-project use

External GitHub projects may still be researched for ideas or OSS components, but the workflow is:

```text
research → compare → isolate capability → license/maintenance check → adapter/port → tests
```

not:

```text
similar project → assume same project → mirror/merge
```

## Destructive Git guard

The following actions are prohibited without explicit target/source confirmation in the same task:

- `git push --mirror`;
- force-push across project boundaries;
- repository-wide ref replacement;
- deleting unknown branches/tags;
- changing a default branch to an unverified branch;
- importing another repository's full history.

## Audit trail

For each future repository migration or major import, record in the PR/commit description:

- target repository;
- source repository/archive;
- verified project fingerprint;
- files/branches affected;
- destructive operations used (normally none);
- rollback path.
