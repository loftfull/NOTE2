# NOTE2 Product DNA — 2026

## Canonical product statement

NOTE2 is a **local-first notebook and personal knowledge workspace** that can accept almost any kind of information — a thought, note, task, document, PDF, book, image, scan, audio recording, video, web page, or YouTube source — and keep it inside one searchable, evidence-aware workspace.

AI is an enhancement layer. It is not the product shell, not the navigation model, and not a prerequisite for basic usefulness.

NOTE2 must remain valuable when every AI provider is disabled.

## Non-negotiable user jobs

### 1. Capture

The user must be able to capture something in seconds without deciding which technical pipeline to use.

Primary capture forms:
- note / thought;
- task;
- file;
- URL;
- photo / scan;
- microphone / voice memo;
- shared Android intent.

Capture should default into an inbox/today context and can be organized later.

### 2. Write

NOTE2 must be a genuinely good notebook/editor, not a media analyzer with a weak textarea attached.

Required direction:
- distraction-free note editing;
- headings, lists, quotes, code, checklists, tables and embeds;
- fast keyboard/mobile editing;
- backlinks/mentions;
- tags/properties;
- templates;
- daily notes;
- local autosave and recovery;
- export/import/backup.

### 3. Read and annotate

Imported sources are not inert attachments.

The workspace must support source-native interaction:
- PDF pages;
- EPUB chapters;
- web article reading;
- YouTube/video transcript navigation;
- audio transcript/timestamps;
- image/OCR regions;
- highlights;
- annotations;
- source notes;
- deep links to exact evidence.

### 4. Organize

The same underlying data should be visible in multiple useful ways instead of being copied into separate silos.

Target concepts:
- Notes;
- Sources;
- People;
- Projects;
- Tasks;
- Topics;
- Daily notes;
- Collections / live views;
- graph relationships.

NOTE2 should evolve toward typed objects and queryable views without forcing the user to learn a database before writing a note.

### 5. Find

Search is a first-class interaction.

Required stack:
- instant lexical search offline;
- optional semantic/vector search;
- search across notes and imported source text;
- filters by type/date/project/tag;
- reusable live queries/views;
- exact source-location navigation from results.

### 6. Understand

AI analysis operates over real stored material and preserves evidence.

Every important generated conclusion should be able to point to:
- source identity;
- location (page/timestamp/chapter/region/paragraph);
- quoted or highlighted evidence;
- confidence/coverage where relevant;
- verification/uncertainty state.

Supported analysis modes are views over the same material, not separate products:
- quick;
- full;
- simplified;
- expanded/contextual;
- verified;
- compare.

### 7. Reuse knowledge

The product should convert passive material into durable knowledge:
- saved highlights;
- linked notes;
- extracted entities;
- tasks/decisions/questions;
- related sources;
- study/review material;
- graph connections;
- project synthesis.

## Local-first contract

The following continue to work without a network connection whenever the underlying source is local:
- create/edit/delete notes;
- local notes/tasks/settings persistence;
- Source Vault browsing;
- previously extracted local source content;
- lexical search;
- local relationships/backlinks;
- export/backup;
- opening previously available sources.

Remote AI, remote URL acquisition and account sync may degrade gracefully, but local knowledge must remain usable.

## Evidence-first contract

NOTE2 must never fake:
- OCR;
- transcript availability;
- source metadata;
- relevance scores;
- successful processing;
- citations;
- verification state.

Generated answers must distinguish:
- direct evidence;
- inference;
- external verification;
- uncertainty;
- missing coverage.

## Android-first delivery contract

The product must remain designed for real phone use, not merely responsive desktop web.

Required direction:
- Capacitor 8 path;
- safe areas and system bars;
- native microphone;
- Android share/open flows;
- background/resumable large-media processing;
- process-death recovery;
- secure account credential storage through Android Keystore;
- AI/API keys remain server-side;
- usable 360–430 px layout;
- one-handed primary navigation.

## Visual DNA

NOTE2 should feel like a premium personal instrument, not an AI demo.

### Keep
- editorial typography;
- calm surfaces;
- restrained material/glass only where depth communicates hierarchy;
- meaningful animation;
- content-led layouts;
- dense but legible information;
- strong source previews;
- native-feeling bottom navigation/mobile sheets;
- desktop split panes where they increase understanding.

### Reject
- generic SaaS KPI dashboards;
- giant gradient hero sections;
- decorative AI sparkle badges;
- every element inside a rounded card;
- gratuitous shadows/glow;
- oversized whitespace with little information;
- technical pipeline names in primary navigation;
- separate top-level tabs for every source connector;
- fake/demo workspace activity.

## Product hierarchy

The product is intentionally broader than a media analyzer.

1. **Notebook** — write and capture.
2. **Knowledge workspace** — organize and connect.
3. **Universal reader/source vault** — bring external material in.
4. **Evidence layer** — highlights, locators, provenance.
5. **Intelligence layer** — search, analysis, verification, synthesis.
6. **Automation layer** — later, only when the first five layers are trustworthy.

## Benchmark principles to absorb, not copy

- Craft: one elegant environment can cover notes, tasks, calendar, daily notes and visual thinking.
- Capacities: daily capture plus typed objects can create structure without forcing folders everywhere.
- Tana: live queries and typed/supertagged objects make information reusable across contexts.
- Obsidian: local ownership and derived database-like views can coexist.
- Readwise Reader: PDFs, EPUB, web and YouTube become one reading/highlighting system with precise source navigation.

NOTE2 should combine these classes of strengths while keeping a simpler mobile-first mental model and much stronger multimodal evidence analysis.

## Definition of success

A NOTE2 build is not “top-tier” because it has many features.

It succeeds when a user can:
1. capture anything quickly;
2. write comfortably for an hour;
3. import a difficult source;
4. understand exactly what was extracted;
5. find it later;
6. jump from an answer to its evidence;
7. turn that evidence into their own note/task/project;
8. keep using the workspace offline;
9. do all of this comfortably on a phone;
10. never wonder whether the product invented something that it claims came from a source.
