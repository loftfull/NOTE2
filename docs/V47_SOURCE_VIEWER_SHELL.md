# NOTE2 v4.7 — Unified Source Viewer

## Baseline

The visual and navigation baseline remains NOTE2 v4.0. v4.7 must not introduce a new top-level Instagram, YouTube, Web, PDF or Media product surface.

Primary navigation remains:

- Сегодня
- Заметки
- Источники
- Поиск
- Профиль

## One Source Viewer

Every saved Source opens through one Source Viewer shell. The shell has exactly four primary tabs:

1. Описание
2. Текст
3. Выжимка
4. Заметки

The provider changes only the media/reader renderer at the top of the Viewer.

### Renderer adapters

- Instagram: original carousel/Reel ordering, image zoom, inline video, requested `img_index`, exact slide/timestamp evidence navigation.
- YouTube: embedded player with `enablejsapi=1`; transcript/evidence clicks seek the player to the corresponding timestamp.
- PDF: page-aware reader driven by existing page locators; evidence navigation opens the referenced page.
- Local audio/video: existing durable media job playback; transcript/evidence clicks seek to the timestamp.
- Web/other documents: readable source surface plus extracted text.

## Evidence continuity

The Source Viewer owns an `activeLocator`. Clicking a transcript segment, OCR fragment, search evidence or summary citation updates that locator.

The renderer interprets the same locator:

- `instagramItem` -> carousel item
- `startSeconds` -> video/audio timestamp
- `page` -> PDF page

This preserves NOTE2's core contract: conclusion -> exact source evidence.

## Summary behavior

The default summary is one calm, evidence-backed brief. Model-backed summaries must cite supplied `[S#]` fragments. Offline/local fallback also keeps `[S#]` citations rather than producing uncited prose.

More detailed analysis remains contextual and must not become a primary navigation surface.

## Instagram advanced functionality

Existing OCR, full-post processing, offline pin, structured extraction, similarity, collections and organization are retained, but moved behind `... -> Инструменты Instagram` inside the selected Source.

The old `mode === 'instagram'` library is removed. There is one Sources library with provider filters.

## Notes

Creating a note from any Source uses a generic source-note contract, stores the canonical/original URL when available, and embeds a hidden `source:<id>` marker so the Viewer can list linked notes without mixing user-authored text with original source evidence.

## Verification gate

Current working package requirements:

- v4.0 shell unchanged at primary navigation level
- no reachable Instagram-only library mode
- one Source Viewer shell
- YouTube seek command from evidence
- Instagram exact slide/time navigation
- PDF page navigation
- local source brief preserves citations
- existing Instagram enrichment remains available contextually

The working local v4.7 package passed 90/90 Node regression tests. Production Vite/Android build remains a separate gate and must not be claimed until dependencies are installed and the build is executed.