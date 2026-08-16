# NOTE2

NOTE2 is the new canonical repository for a **universal media and knowledge analyzer**.

The product accepts files and URLs — video, YouTube, Instagram/social sources, audio, PDF, office documents, books, images and web pages — and turns them into reusable, evidence-backed analysis instead of a single generic summary.

## Product goals

For the same source NOTE2 should support:

- quick summary;
- full professional analysis;
- simplified explanation;
- expanded/contextualized explanation;
- claim verification;
- decisions, tasks, risks, people, entities, dates and metrics;
- timeline/page/chapter navigation;
- semantic search and Ask NOTE2;
- comparison across multiple sources.

## Core architecture

The current proven stack remains the foundation:

- Next.js App Router + TypeScript;
- Auth.js + Prisma;
- PostgreSQL + pgvector;
- Redis + BullMQ;
- S3/R2-compatible object storage;
- provider adapters for transcription, extraction, vision and reasoning;
- PWA first, verified TWA for Android.

We intentionally avoid a second auth system, duplicate queue stack or separate mobile backend.

## Architecture documents

- [`docs/PRODUCT_ARCHITECTURE.md`](docs/PRODUCT_ARCHITECTURE.md) — product definition, layers and phased evolution.
- [`docs/SOURCE_ADAPTERS.md`](docs/SOURCE_ADAPTERS.md) — universal ingestion/adaptation contract.
- Draft PR #1 adds:
  - `docs/ANALYSIS_GRAPH.md`;
  - `docs/RESULT_WORKSPACE.md`;
  - `docs/IMPLEMENTATION_PLAN.md`.

## Repository migration

The previous development repository is `loftfull/BlockNoteAI`.

Because NOTE2 was created as an independent repository, preserving all Git history requires a mirror push from a machine authenticated to GitHub.

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts/migrate-full-history.ps1
```

### macOS / Linux

```bash
bash scripts/migrate-full-history.sh
```

The scripts perform `git clone --mirror` from `loftfull/BlockNoteAI` and `git push --mirror` into `loftfull/NOTE2`, preserving branches, tags and commit history.

Important source branches to verify after migration:

- `claude/shadow-knowledge-ai-OgOPz`;
- `chatgpt/resumable-mobile-hardening`;
- `chatgpt/mobile-pwa-shell`.

After the mirror, recreate/retarget the draft PRs inside NOTE2, run hosted CI or `npm run ci:local`, and only then consolidate the hardening + mobile stacks.

## Next implementation step

After repository consolidation and a green build/smoke gate, the first code change is deliberately bounded:

> Introduce a `SourceAdapter` registry around the **existing local-file and YouTube ingestion** without changing the persistence schema or adding new downloader/provider dependencies.

This gives NOTE2 the universal-source architecture without a risky big-bang rewrite.
