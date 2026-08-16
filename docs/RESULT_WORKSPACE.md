# NOTE2 — Result Workspace UX Architecture

## Objective

The result screen is the core product. It must feel like a professional analysis workspace, not a chat response wrapped in cards.

The user should immediately understand:

1. what the source is;
2. what matters;
3. how complete/reliable the analysis is;
4. where each important conclusion came from;
5. what they can do next.

## Visual principles

- light, calm interface;
- restrained glass effects only for navigation/overlays, not every content block;
- real document depth through layering, typography, sticky context and motion;
- compact vertical rhythm on mobile;
- minimal decorative gradients;
- no “AI sparkles everywhere” visual language;
- content hierarchy through type, spacing and evidence structure instead of oversized cards.

## Mobile information architecture

### Persistent top context

Compact sticky header:

```text
←  source title                       ⋯
   YouTube · 48:21 · today
```

Secondary status line only when useful:

```text
Full analysis · 96% coverage · verified 18/24 claims
```

Do not dedicate a full hero card to metadata.

### Primary mode switcher

Horizontally scrollable segmented navigation:

```text
Overview | Deep | Verify | Timeline | Entities | Related | Ask
```

Mode switching should preserve scroll state per tab when practical.

## Overview

First viewport:

### What this is
One or two compact sentences.

### What matters
5–8 high-signal statements with optional evidence indicator.

Example:

```text
• Компания сместила приоритет с роста на маржинальность        12:44
• Главный риск — зависимость от одного канала продаж            31:08
• Прогноз руководства расходится с текущей динамикой спроса     ⚠ verify
```

No generic “Key Insights” card with long prose.

### Bottom line
A concise synthesis separated visually from the source claims.

### Actions / decisions / risks
Only show sections that actually contain meaningful items.

## Deep analysis

Structured editorial document rather than dashboard cards.

Recommended hierarchy:

```text
Executive synthesis
Argument / narrative structure
Key ideas
Assumptions
Evidence
Weak points / omissions
Implications
Domain-specific analysis
```

Use section headings and narrow separators. Large rounded containers only where interaction needs containment.

## Evidence interaction

Every important claim can open an evidence drawer/sheet.

Mobile bottom sheet:

```text
Claim
“Demand slowed materially in Q2.”

Evidence
[12:44–13:18] transcript excerpt
[18:02–18:20] supporting statement

Status
Supported in source · external verification not requested

Open at 12:44  →
```

For PDFs/books, the equivalent action opens the cited page/paragraph.

## Verification view

Not a wall of green/red badges.

Group by status:

```text
Supported        12
Disputed          3
Insufficient      6
Opinion/prediction 8
```

Then show claim rows ordered by importance.

Each row:

```text
[status icon] concise claim
source evidence · external evidence count
```

Use neutral wording:
- supported;
- disputed;
- insufficient evidence;
- opinion/prediction;
- not checked.

Never map “not checked” to false.

## Timeline / Pages / Chapters

The same tab adapts to source structure.

Video/audio:
- chapters;
- key moments;
- events/claims/tasks by timestamp;
- tap to jump.

PDF/book:
- chapters/headings;
- page ranges;
- highlights/claims by page.

Presentation:
- slide list;
- slide-level summary and evidence.

## Entities

Compact searchable list of:
- people;
- organizations;
- products;
- places;
- dates;
- metrics;
- concepts.

Entity detail shows:
- mentions;
- related claims;
- source locations;
- relationships.

Do not show an entity graph by default on a phone. Graph is an optional deeper view.

## Related

Two layers:

### In library
Semantically related sources already analyzed by the user.

### External suggestions
Possible related public material, clearly separated from the user's library and only fetched when external discovery is enabled.

## Ask NOTE2

Chat is contextual, but it is not the main result format.

Default question suggestions should derive from actual gaps:

```text
Why is this conclusion important?
Show evidence against this claim.
Compare this with [related source].
Explain section 3 more simply.
What information is missing?
```

Answers should cite source anchors inline.

## Mode switch behavior

Top-level analysis modes are distinct from workspace tabs.

Example:

```text
Analysis mode: Full ▼
Workspace: Overview | Deep | Verify | ...
```

Changing `Full → Simple` should reuse the same extracted/evidence graph and mostly transform presentation/synthesis.

Changing `Full → Verified` may enqueue additional verification nodes but must not re-ingest the source.

## Processing states

Avoid modal waiting screens.

As soon as useful layers are available, render them progressively.

Example:

```text
Transcript ready
Quick overview ready
Deep analysis 72%
Verification queued
```

Users may inspect completed layers while deeper nodes continue.

## Partial coverage

Coverage warning is contextual rather than an alarming banner.

Example:

```text
78% coverage
Видео доступно частично: анализ основан на субтитрах и описании; визуальные кадры недоступны.
```

Tap opens details.

## Source viewer

Use source-specific viewer where possible:

- video/audio player with timestamp jumps;
- PDF page viewer;
- image zoom with regions;
- text/document reader;
- web snapshot/article view.

Result and source viewer should be linked bidirectionally:
- claim → source anchor;
- source selection → analyze/explain selected fragment.

## Desktop layout

On larger screens use a two-pane workspace rather than stretched mobile cards:

```text
┌──────────────── source / document ────────────────┬──────── analysis ────────┐
│                                                  │                         │
│ viewer                                           │ Overview / Deep / ...   │
│                                                  │                         │
└──────────────────────────────────────────────────┴─────────────────────────┘
```

Resizable split preferred. Mobile collapses to one primary pane with sheets.

## Motion

Motion communicates spatial relationships:

- source → evidence sheet;
- mode changes crossfade/slide minimally;
- progress nodes transition into completed content;
- bottom sheets use spring physics;
- no continuous decorative animation around analysis cards.

Target feel: premium productivity tool, not demo reel.

## Accessibility

- 44px minimum touch targets;
- visible keyboard focus;
- motion respects reduced-motion;
- status never encoded by color alone;
- source timestamps/pages exposed in accessible labels;
- text selection remains native where possible.

## Performance constraints

Result screen must not render the whole transcript/book at once.

- virtualize long transcript/page lists;
- lazy-load evidence excerpts and source thumbnails;
- stream analysis sections progressively;
- keep tab payloads addressable/cacheable separately;
- do not hydrate giant JSON blobs into the root page.

## Definition of done

A mobile user can:

1. open any analyzed source;
2. understand the core result in the first screenful;
3. switch analysis mode without re-upload;
4. tap any important claim and reach evidence;
5. jump to timestamp/page;
6. see what was not analyzed/verified;
7. compare or ask follow-up without leaving the source context.
