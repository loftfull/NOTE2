# NOTE2 v4.6 — v4.0 Baseline Recovery

## Decision

The visual/product shell from NOTE2 v4.0 is the canonical UI baseline for the next development cycle.

Provider-specific features must not create new primary navigation silos by default.

Instagram, YouTube, web pages, documents, images, audio and video are all represented as `Source` objects inside one `Sources` library.

## UI baseline preserved from v4.0

Primary navigation:
- Сегодня
- Заметки
- Источники
- Поиск
- Профиль

Visual rules:
- flat light surfaces;
- no decorative gradients;
- restrained shadows;
- Russian-first typography;
- 16–17 px reading/editor text;
- 25–28 px page headings on mobile;
- 25–26 px bottom-navigation icons;
- 11–12 px navigation labels;
- semantic flat-color icons only;
- one yellow primary accent;
- compact Yandex-like information density.

## Sources architecture

`Sources` opens directly to the unified library.

Top-level filters only:
- Все
- Instagram
- YouTube
- Веб
- Документы
- Медиа

A source card shows only:
- recognizable provider/type icon;
- title;
- meaningful short excerpt/status;
- provider/author/channel;
- lightweight progress/ready state.

OCR, transcription, structured extraction, duplicate detection, comparison, synthesis and offline management are capabilities of the selected Source. They do not belong on every library card.

## Capture architecture

The capture sheet has one `Ссылка` action.

That action accepts:
- Instagram posts/Reels/carousels;
- YouTube watch/short/live links;
- ordinary web URLs.

Provider detection happens after capture. There are no separate Instagram and YouTube capture destinations.

## Shared Source Viewer

The viewer shell is stable across providers:

1. native media/content renderer;
2. original description/metadata;
3. extracted text/transcript;
4. summary/analysis;
5. user's notes/highlights.

Only the content renderer changes:
- Instagram → carousel/Reel renderer;
- YouTube → embedded player + transcript seek;
- PDF → page renderer;
- Web/EPUB → reader;
- audio/video → native media player.

## Advanced capabilities

The v4.1–v4.4 work is retained as capability code, but advanced operations are contextual/overflow actions:
- process entire source;
- OCR;
- transcription;
- structured extraction;
- offline pin;
- similar-source detection;
- comparison;
- multi-source synthesis.

Those capabilities must not reshape primary navigation or visual hierarchy.

## Regression gate

The v4.6 working source currently passes 85 / 85 regression tests, including new UI-contract tests for:
- v4.0 Sources-shell restoration;
- one universal capture-link action;
- provider-aware Instagram/YouTube/Web URL intake.

Production Vite/Android build is not claimed until dependencies are installed and the build/device checks actually pass.
