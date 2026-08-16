# NOTE2 — Product Architecture 2026

## Product definition

NOTE2 is a universal media and knowledge analysis workspace. A user can provide a file or URL — video, YouTube, Instagram, audio, PDF, document, book, image or web page — and receive layered analysis instead of a generic one-shot summary.

The product must support several analysis views over the same source:

- quick summary;
- full professional analysis;
- simplified explanation;
- expanded/contextualized explanation;
- fact/claim verification;
- extraction of decisions, tasks, risks, people, entities, dates and evidence;
- cross-source comparison;
- semantic search and conversational retrieval across the user's library.

The UI should expose outcomes and understanding, not implementation machinery.

## Architectural principle

Do not rebuild the product around a new framework. Preserve the proven server-backed stack and evolve it by bounded modules:

- Next.js App Router + TypeScript for product/web UI;
- Auth.js + Prisma as the single identity/authorization layer;
- PostgreSQL + pgvector as the primary durable knowledge store;
- Redis + BullMQ as the single asynchronous job layer;
- S3/R2-compatible object storage for original media and derived artifacts;
- provider adapters for extraction/transcription/vision/LLM work;
- PWA first, verified TWA for Android packaging.

No duplicate mobile backend, no second auth system, no parallel queue stack.

## Processing pipeline

1. **Ingest** — URL or file, resumable/direct upload for large media.
2. **Identify** — source type, MIME, metadata, duration/pages/language.
3. **Acquire** — safe download/import where permitted, preserving provenance.
4. **Extract** — transcript/text/OCR/frame descriptions/document structure.
5. **Normalize** — chunks, sections, timestamps/pages, entities and source anchors.
6. **Analyze** — multiple selectable modes over the same normalized source.
7. **Verify** — claims linked to evidence, confidence and contradictions.
8. **Synthesize** — summary, detailed report, simplified view, actions/risks, comparison.
9. **Index** — semantic + lexical retrieval across source and derived knowledge.
10. **Present** — mobile-first result workspace with progressive disclosure.

Every stage must be restartable/idempotent. A failure after ingest must not require a user to upload a 500 MiB file again.

## Analysis object model

Treat one imported item as a `Source`, not as a single final answer.

A source owns:
- original metadata and provenance;
- extracted representations;
- analysis runs by mode/domain/model/version;
- claims and supporting evidence;
- generated artifacts;
- relationships to projects/knowledge bases/other sources.

This allows NOTE2 to rerun only the expensive layer that changed rather than re-ingesting everything.

## UX hierarchy

### 1. Home / Today
Fast entry points, recent work, processing state and unfinished analyses. Avoid dashboard vanity metrics.

### 2. Analyze
One universal input surface for URL/file/camera/share-intent. The system detects media type instead of asking users to choose a technical pipeline.

### 3. Result workspace
Default mobile structure:

- Overview;
- Deep analysis;
- Evidence / verification;
- Timeline / pages / chapters;
- Entities / decisions / tasks / risks;
- Related sources;
- Ask NOTE2.

The first screen must answer: “What is this, what matters, what should I know next?”

### 4. Library
Search-first history of analyzed sources, not a folder-first file manager. Projects/knowledge bases are optional organization layers.

### 5. Compare
Two or more sources → common claims, disagreements, missing evidence, chronology and synthesis.

## Provider architecture

Providers must sit behind capability interfaces instead of leaking SDK-specific objects into routes/workers.

Capabilities:
- transcription;
- document extraction;
- web/social acquisition;
- vision/frame understanding;
- embeddings;
- reasoning/analysis;
- verification/search;
- artifact generation.

A job records the provider/model/version used so results are reproducible and can be selectively regenerated.

## Reliability gates

Before feature expansion, keep these gates mandatory:

- `ci:local` or hosted CI must pass typecheck/lint/tests/build/production smoke;
- schema and migrations must match exactly;
- upload completion must be idempotent;
- queue outage must not lose already-stored media;
- PWA protocol files and Digital Asset Links must remain public while user content stays protected;
- Android release must target API 36+ and use isolated signing.

## Next implementation sequence

### Phase A — canonical repository + release baseline
- Complete migration to `loftfull/NOTE2`.
- Consolidate hardening and mobile stacks after green CI.
- Deploy one stable HTTPS environment.
- Verify PWA installability and Android TWA.

### Phase B — universal source adapters
- Formalize `SourceAdapter` interface.
- Audit existing YouTube/web/file ingestion and remove route-specific duplication.
- Add capability matrix and graceful fallbacks for video/audio/docs/images/social URLs.

### Phase C — analysis graph
- Replace one-dimensional result generation with reusable analysis stages and versioned runs.
- Introduce evidence anchors and claim verification as first-class records.
- Allow quick/full/simple/expanded/verified views to reuse extraction and embeddings.

### Phase D — result workspace redesign
- Mobile-first compact result screen.
- Progressive disclosure instead of large AI-style cards.
- Evidence linked directly to timestamps/pages/paragraphs.
- Fast switch between modes without re-upload.

### Phase E — multi-source intelligence
- compare sources;
- contradictions;
- chronology;
- related-source discovery;
- project-level synthesis and chat.

## Anti-Frankenstein rules

1. One durable database model per concept.
2. One auth layer.
3. One queue/job abstraction.
4. One object-storage abstraction.
5. New OSS solutions enter behind adapters, never by duplicating an existing subsystem.
6. Every imported library/component must have a clear owner, failure mode and removal path.
7. UI shows user outcomes; internal agents/providers remain secondary diagnostics.
