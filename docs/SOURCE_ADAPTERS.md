# NOTE2 — Universal Source Adapter Architecture

## Goal

Every input enters NOTE2 through one ingestion contract. Routes and UI must not know the implementation details of YouTube, Instagram, PDF, DOCX, audio, video or web acquisition.

The user supplies either:

- a local file;
- a URL;
- a shared Android intent / uploaded camera item in the future.

The system identifies the source and selects an adapter.

## Core contract

```ts
export type SourceKind =
  | "video"
  | "audio"
  | "image"
  | "pdf"
  | "document"
  | "book"
  | "web"
  | "youtube"
  | "instagram"
  | "social"
  | "unknown";

export interface SourceProbe {
  kind: SourceKind;
  canonicalUrl?: string;
  mimeType?: string;
  title?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  pageCount?: number;
  languageHint?: string;
  confidence: number;
}

export interface AcquiredSource {
  sourceId: string;
  kind: SourceKind;
  storageKey?: string;
  canonicalUrl?: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  provenance: ProvenanceRecord[];
}

export interface ExtractedRepresentation {
  sourceId: string;
  text?: string;
  transcript?: TimedSegment[];
  pages?: PageSegment[];
  chapters?: ChapterSegment[];
  frames?: FrameObservation[];
  metadata: Record<string, unknown>;
}

export interface SourceAdapter {
  id: string;
  canHandle(input: SourceInput): Promise<number>; // 0..1 confidence
  probe(input: SourceInput): Promise<SourceProbe>;
  acquire(input: SourceInput, ctx: AdapterContext): Promise<AcquiredSource>;
  extract(source: AcquiredSource, ctx: AdapterContext): Promise<ExtractedRepresentation>;
}
```

## Adapter selection

Selection is confidence-based, not a chain of route-specific `if/else` branches.

Example:

1. `YouTubeAdapter` recognizes YouTube host/video id: 1.0.
2. `InstagramAdapter` recognizes supported Instagram URL: 1.0.
3. `WebArticleAdapter` handles ordinary HTML: 0.7–0.9.
4. `GenericUrlAdapter` is final URL fallback.
5. File adapters use MIME + extension + signature probing.

If the highest confidence is below the safe threshold, NOTE2 must stop with an understandable unsupported-source message rather than guessing a destructive parser.

## Capability matrix

| Source | Acquire | Text | Audio transcript | Visual frames | Structure | Evidence anchors |
|---|---:|---:|---:|---:|---:|---:|
| Local video | yes | optional | yes | yes | timeline | timestamps |
| YouTube | yes* | captions/transcript | yes | yes* | chapters/timeline | timestamps |
| Instagram video | best-effort* | caption | yes* | yes* | timeline | timestamps/url |
| Audio | yes | — | yes | — | timeline | timestamps |
| PDF | yes | yes | — | page images optional | pages/headings | pages/regions |
| DOCX/ODT | yes | yes | — | embedded images optional | headings/tables | paragraph/section |
| PPTX | yes | yes | — | slide images | slides | slide numbers |
| Image | yes | OCR | — | yes | regions | bounding regions |
| Web article | yes | readability text | embedded media optional | optional | headings | URL/paragraph |
| Book/EPUB | yes | yes | — | covers/images optional | chapters | chapter/paragraph |

`*` Subject to availability, access rights, source restrictions and acquisition reliability. Adapter failure must not corrupt the source record.

## Separation of acquisition and understanding

Never mix these responsibilities.

### Acquisition
- resolving URL;
- downloading/streaming source where allowed;
- upload/storage;
- metadata/provenance;
- deduplication;
- resumability.

### Extraction
- text parsing;
- transcription;
- OCR;
- frame sampling;
- document/page/slide structure.

### Understanding
- summaries;
- deep analysis;
- simplification;
- expansion/context;
- claims;
- verification;
- tasks/decisions/risks/entities;
- cross-source reasoning.

This separation lets NOTE2 replace an Instagram downloader or transcription provider without rewriting analysis.

## Derived representations

Representations are reusable artifacts. A full analysis must not retranscribe the same 90-minute video if a quick summary already produced a valid transcript.

Recommended identity:

```text
representationKey = sourceId + representationType + extractorVersion + parametersHash
```

Examples:
- transcript/whisper-vX/language-auto;
- pdf-text/pdfjs-vY;
- frame-set/scene-change-v2/24frames;
- OCR/vision-provider-v3/russian+english.

## Evidence anchors

Every extracted unit should preserve a source anchor.

Video/audio:
```ts
{ startMs, endMs }
```

PDF/book:
```ts
{ page, paragraph?, bbox? }
```

Web:
```ts
{ canonicalUrl, headingPath?, paragraphIndex? }
```

Image:
```ts
{ bbox, regionLabel? }
```

Claims produced later reference these anchors. This is mandatory for verification and for a trustworthy result UI.

## Fallback policy

Fallbacks are explicit and observable.

Example video acquisition:

1. source-native transcript when reliable;
2. acquired audio + transcription;
3. metadata-only partial analysis when media cannot be acquired;
4. clear unsupported/restricted result — never fabricated transcript.

Every fallback records:
- original strategy;
- failure class;
- selected fallback;
- confidence/coverage impact.

## Failure taxonomy

Adapters return typed failure classes:

- `UNSUPPORTED_SOURCE`;
- `SOURCE_NOT_FOUND`;
- `SOURCE_PRIVATE`;
- `AUTH_REQUIRED`;
- `RATE_LIMITED`;
- `ACQUISITION_BLOCKED`;
- `FILE_TOO_LARGE`;
- `CORRUPT_MEDIA`;
- `EXTRACTOR_FAILED`;
- `TRANSIENT_PROVIDER_ERROR`.

UI maps these to user actions. Workers use them to decide retryability.

## Retry rules

Retry automatically only for transient categories:
- temporary HTTP/network failures;
- provider 429/5xx;
- object-storage temporary failures;
- queue interruption.

Do not automatically retry:
- private/deleted source;
- unsupported format;
- invalid credentials;
- deterministic corruption.

## Initial adapter set

Phase B implementation order:

1. `LocalFileAdapter` — existing upload pipeline as canonical baseline.
2. `YouTubeAdapter` — refactor existing YouTube-specific code behind contract.
3. `WebArticleAdapter` — Readability/existing web extraction.
4. `PdfAdapter`.
5. `OfficeDocumentAdapter` — DOCX/PPTX and adjacent formats.
6. `AudioVideoAdapter` — normalized local media extraction.
7. `ImageAdapter`.
8. `InstagramAdapter` / `SocialAdapter` only after acquisition benchmarking against maintained OSS approaches.

Do not add more adapters until the first four share the same test harness.

## Adapter conformance tests

Every adapter must pass the same contract suite:

- deterministic probe for known fixture;
- safe rejection of unrelated input;
- provenance is present;
- acquire is idempotent or safely resumable;
- extraction preserves anchors;
- retryable vs permanent errors are classified;
- no provider-specific object escapes the adapter boundary;
- re-running extraction with same version/parameters reuses representation.

## UI implications

The Analyze screen remains one surface. Source type is detected after input.

The user sees:
- source identity;
- what NOTE2 could extract;
- analysis progress;
- coverage limitations if any;
- result modes.

The user does **not** choose internal downloader/transcriber/parser implementations.
