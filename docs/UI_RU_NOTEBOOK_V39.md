# NOTE2 UI / Notebook v3.9 — Russian mobile pass

## Goal

This pass implements the user's explicit corrections to the recovered NOTE2 product direction:

- Russian-first visible UI;
- larger and clearer bottom navigation;
- readable mobile typography;
- obvious semantic icons instead of abstract decorative shapes;
- restrained color/depth and micro-motion attached to meaning;
- materially stronger notebook/editor capability.

## Bottom navigation

Mobile primary navigation remains five destinations:

- Сегодня
- Заметки
- Источники
- Поиск
- Профиль

Required mobile metrics:

- glass bar full-width with 9 px side margins;
- approximately 78 px bar height;
- minimum ~64 px button height inside the bar;
- 24–25 px primary icons;
- approximately 10–11 px visible labels;
- filled icon state only for the active destination;
- separate 58 px capture button floating above the bar so it does not compress navigation labels.

The navigation must not use tiny 8 px labels.

## Semantic visual objects

The previous abstract sphere/ring/prism/capsule language is deprecated for primary user interaction.

Color and depth are retained, but every visual object now contains an obvious semantic glyph:

- note → edit/note icon;
- task → check icon;
- document/PDF → document/PDF icon;
- voice/audio → microphone;
- video → camera/video;
- link/web → link;
- image/scan → camera/image;
- search → search.

Micro-motion is limited to a 1–3 px idle/hover lift and must respect `prefers-reduced-motion`.

No user should need to infer what an abstract shape means.

## Russian-first shell

Primary user paths are translated:

- Today → Сегодня
- Notes → Заметки
- Sources → Источники
- Search → Поиск
- You → Профиль
- Capture anything → Добавить в NOTE2
- Note / Task / Voice / Scan / File / Link → Заметка / Задача / Голос / Фото-скан / Файл / Ссылка

Advanced technical diagnostics can remain partially untranslated temporarily, but all everyday notebook/capture/navigation surfaces must be Russian-first.

## Typography

Mobile target:

- primary page title: roughly 30–40 px depending screen context;
- body/source text: 13–18 px depending role;
- editor body: 18 px with ~1.7 line-height;
- navigation icon: ~25 px;
- navigation label: ~10–11 px;
- metadata: never below ~9.5–10 px unless non-essential.

Information density must increase without shrinking text to compensate.

## Notebook upgrade implemented in the working source

The editor now includes:

- pin/unpin note;
- favorite/unfavorite note;
- library views: All / Pinned / Favorites;
- selection-aware text insertion;
- heading block;
- checklist block;
- bullet list;
- quote;
- inline code;
- Markdown table;
- link insertion;
- wiki-style `[[Note]]` relation insertion;
- current date/time insertion;
- attach-file shortcut;
- voice shortcut;
- templates: Daily / Meeting / Project / Study notes;
- tag editing;
- word and character counts;
- backlink count based on `[[Title]]` references;
- Russian AI-note action labels and Russian system instruction.

This is a meaningful notebook upgrade, not only a visual redesign.

## Regression result

The modified verified source passed the existing Node regression suite:

- 39 tests
- 39 passed
- 0 failed

The suite covers account/session security, ingestion, DOCX/XLSX, RAG provenance, resumable media, durable queue, YouTube, transcription, vision locators, backup/sync and Android secure credentials.

## Build status

Production Vite build is **not yet verified in the current execution environment** because Vite dependencies are not installed there (`vite: not found`). Do not state that a production build passed until dependencies are restored and `npm run build` succeeds.

## Next notebook functionality slice

1. real block editor model rather than a single textarea;
2. drag/reorder blocks;
3. slash command menu;
4. inline Markdown/wikilink autocomplete;
5. task blocks synchronized with global Today/task views;
6. source embed blocks with live preview;
7. image/voice/file attachments inside notes;
8. note outline and heading navigation;
9. backlinks panel with direct navigation;
10. version history / local recovery checkpoints;
11. daily-note creation and calendar navigation;
12. templates as user-editable objects;
13. custom properties / typed objects;
14. saved/live views over notes/tasks/sources;
15. full Russian localization of advanced settings and diagnostics.
