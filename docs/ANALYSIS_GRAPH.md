# NOTE2 — Analysis Graph

## Why a graph

A source is not an answer. The same video, PDF or book may need a quick summary now, a verified analysis later, a simplified explanation for another reader and a comparison against other sources tomorrow.

NOTE2 therefore models analysis as a reusable graph of stages instead of a single prompt-response job.

## Core layers

```text
Source
  ↓
Representations
  ↓
Facts / entities / segments
  ↓
Claims + evidence
  ↓
Analysis runs
  ↓
Views / reports / comparisons / chat
```

Each downstream layer records which upstream version produced it.

## Proposed records

### Source
Durable identity of the imported item.

```ts
interface SourceRecord {
  id: string;
  kind: SourceKind;
  canonicalUrl?: string;
  storageKey?: string;
  mimeType: string;
  title?: string;
  contentHash?: string;
  metadata: Json;
  createdAt: Date;
}
```

### Representation
Reusable extraction result.

```ts
interface RepresentationRecord {
  id: string;
  sourceId: string;
  type: "TEXT" | "TRANSCRIPT" | "PAGES" | "FRAMES" | "OCR" | "STRUCTURE";
  extractor: string;
  extractorVersion: string;
  parametersHash: string;
  coverage: number;
  artifactKey?: string;
  metadata: Json;
  createdAt: Date;
}
```

Unique identity should prevent duplicate expensive extraction:

```text
(sourceId, type, extractor, extractorVersion, parametersHash)
```

### EvidenceUnit
Small addressable source-backed unit.

```ts
interface EvidenceUnit {
  id: string;
  sourceId: string;
  representationId: string;
  text?: string;
  anchor: Json;
  embeddingRef?: string;
  metadata: Json;
}
```

Examples:
- transcript segment 12:42–13:07;
- PDF page 38 paragraph 4;
- image region x/y/w/h;
- article section “Methodology”, paragraph 7.

### Claim
A normalized proposition found or inferred during analysis.

```ts
interface ClaimRecord {
  id: string;
  sourceId?: string;
  normalizedText: string;
  claimType: "FACT" | "OPINION" | "PREDICTION" | "DECISION" | "RISK" | "ACTION";
  confidence: number;
  status: "UNVERIFIED" | "SUPPORTED" | "DISPUTED" | "INSUFFICIENT_EVIDENCE";
}
```

Claim-to-evidence must be many-to-many. One claim may need several evidence anchors; one evidence unit may support several claims.

### AnalysisRun
Versioned interpretation request.

```ts
interface AnalysisRun {
  id: string;
  scopeType: "SOURCE" | "PROJECT" | "SELECTION";
  scopeId: string;
  mode: "QUICK" | "FULL" | "SIMPLE" | "EXPANDED" | "VERIFIED" | "COMPARE";
  domain?: string;
  modelProvider: string;
  modelId: string;
  promptVersion: string;
  inputGraphHash: string;
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED";
  coverage: number;
  createdAt: Date;
}
```

The important field is `inputGraphHash`: if source representations and analysis parameters are unchanged, NOTE2 can reuse an existing run rather than spending again.

## Mode behavior

### QUICK
Goal: decision-speed orientation.

Consumes:
- best available text/transcript/structure;
- top entities/key segments.

Produces:
- what this is;
- 5–10 most important points;
- immediate actions/risks;
- coverage warning.

### FULL
Goal: professional structured analysis.

Produces:
- executive summary;
- structure/argument map;
- key ideas;
- evidence;
- assumptions;
- gaps;
- implications;
- decisions/tasks/risks;
- domain-specific analysis.

### SIMPLE
Goal: explain without losing the original meaning.

Must reuse factual/evidence layer from FULL/QUICK when available; simplification is a presentation transformation, not a second extraction.

### EXPANDED
Goal: add useful context around the source.

Adds external/domain context only through explicit enrichment steps. The UI must visually separate:
- source says;
- NOTE2 inference;
- external context.

### VERIFIED
Goal: pressure-test material.

Pipeline:
1. extract checkable claims;
2. classify claim type;
3. link in-source evidence;
4. perform external verification where appropriate;
5. assign supported/disputed/insufficient status;
6. expose sources and uncertainty.

The result must never collapse “not verified” into “false”.

### COMPARE
Goal: reason across multiple sources.

Operates primarily over claims/evidence rather than raw full documents.

Produces:
- shared claims;
- direct contradictions;
- differences in assumptions;
- chronology;
- unique evidence;
- missing information;
- synthesized conclusion with provenance.

## Job graph

Example for a YouTube video requesting VERIFIED analysis:

```text
probe
  ↓
acquire metadata/media
  ↓
transcript ──────────────┐
  ↓                      │
segment + anchors        │
  ↓                      │
entities                 │
  ↓                      │
claims                   │
  ├─ in-source evidence  │
  └─ external verify     │
          ↓              │
verified synthesis ◀─────┘
          ↓
index + result view
```

Each node is independently retryable and records status.

## Idempotency

Node identity:

```text
jobKey = nodeType + scopeId + implementationVersion + parametersHash + upstreamHash
```

If a worker crashes after writing the artifact but before acknowledging the queue, rerun must discover/reuse the committed artifact.

This extends the same reliability principle already used for multipart upload completion.

## Cost control

Before executing an expensive node, planner checks:

1. Is a compatible representation already present?
2. Is the requested analysis already cached for the same graph hash?
3. Can a cheaper model perform classification/extraction while a stronger model only synthesizes?
4. Does the user actually need visual frame analysis for this source?
5. Can external verification be limited to checkable/high-impact claims?

Store token/time/provider cost per node so later routing decisions are evidence-based.

## Confidence and coverage

Separate these concepts.

- **Confidence**: how strongly NOTE2 believes a specific output.
- **Coverage**: how much of the source was actually available/processed.

A highly confident analysis of 20% of a restricted video must still show low coverage.

## UI contract

Result header should expose:

```text
Source identity · analysis mode · coverage · freshness
```

For every important assertion users should be able to navigate toward evidence rather than receiving decorative confidence badges only.

Recommended interactions:
- tap a claim → supporting timestamps/pages;
- tap “why?” → reasoning summary + evidence, not private chain-of-thought;
- switch QUICK/FULL/SIMPLE without new upload;
- request VERIFY for selected claims only;
- compare with another source from Library.

## Migration from current models

Do not perform a big-bang schema rewrite.

Incremental sequence:

1. Map existing `MediaFile` to the future `Source` concept logically first.
2. Keep `MediaAnalysis` operational while adding version/coverage fields needed for reusable runs.
3. Introduce representation metadata around existing transcript/extracted text artifacts.
4. Add evidence anchors.
5. Add claims as a parallel derived layer.
6. Only after APIs/UI use the new abstractions decide whether table/model renames are worth migration risk.

The architecture should change behavior before cosmetic model names.

## Definition of done for Phase C

- one source can have multiple analysis modes without re-upload;
- transcript/document extraction is reused across modes;
- analysis runs are versioned and reproducible;
- important claims link to evidence anchors;
- failed graph nodes retry independently;
- result UI exposes coverage and provenance;
- provider/model changes do not require a source re-ingest;
- cost per stage is observable.
