# NOTE2 v4.5 — Unified Source Architecture

## Why v4.3–v4.4 drifted

The Instagram work became a parallel product inside NOTE2. Too many Instagram-specific controls appeared directly in the library and viewer: OCR, structure extraction, collections, duplicate detection, synthesis, offline, per-slide actions, analysis modes, etc. The capabilities are useful, but their placement was wrong.

v4.5 returns to the v4.0 product shell and makes platform-specific complexity an adapter concern.

## Canonical model

The user does not save an “Instagram object” or “YouTube object”. The user saves a **Source**.

A Source has:
- identity;
- provider;
- canonical URL;
- display metadata;
- one or more media items;
- one playback strategy;
- zero or more text/evidence representations;
- reading/viewing progress;
- collections/tags;
- linked notes;
- optional analysis;
- offline capability/status.

Provider examples:
- Instagram;
- YouTube;
- Web;
- Local file;
- PDF/EPUB;
- Audio/video;
- future TikTok/Telegram/X/etc.

Provider is a filter and an acquisition/playback adapter, not a top-level product.

## SavedSource contract

```js
{
  id,
  provider,            // instagram | youtube | web | file | local-media ...
  providerId,          // shortcode, video id, canonical URL hash, file id ...
  sourceType,          // carousel | reel | video | article | pdf | audio ...

  originalUrl,
  canonicalUrl,
  captureContext,      // img_index, YouTube start time, playlist item, shared URL ...

  title,
  author,
  description,
  thumbnail,
  duration,

  media: [
    {
      id,
      kind,            // image | video | audio | page
      locator,
      poster,
      width,
      height,
      duration,
      archiveUrl,
      localAssetKey
    }
  ],

  playback: {
    kind,              // instagram-carousel | youtube-iframe | archived-video | pdf | article
    initialLocator
  },

  representations: [
    {
      id,
      kind,            // caption | description | transcript | ocr | article-text | structured
      text,
      locator,
      provenance,
      confidence
    }
  ],

  state,               // saved | enriching | ready | needs-action | error
  enrichment,
  progress,

  favorite,
  offline,
  collections,
  tags,
  linkedNoteIds,

  analysis
}
```

The Source record never requires provider-specific UI code to participate in search, RAG, collections, notes or Today.

## Provider adapter contract

Each remote provider implements a small adapter:

```js
{
  id,
  match(input),
  canonicalize(input),
  captureContext(input),
  createPendingSource(input),
  enrich(source, runtime),
  playback(source),
  evidenceLocator(representation)
}
```

Provider adapters may have additional internal helpers, but all return the same SavedSource surface.

### InstagramAdapter

Responsible for:
- `/p/`, `/reel/`, `/tv/` URL recognition;
- shortcode;
- preserving `img_index` separately from canonical URL;
- caption/author metadata;
- ordered sidecar media;
- archived media when acquisition succeeds;
- image OCR and video transcript enrichment;
- locator `{ mediaIndex, startSeconds?, region? }`.

It does **not** own collections, search, notes, AI summaries or duplicate detection.

### YouTubeAdapter

Responsible for:
- watch / shorts / youtu.be URL recognition;
- video id;
- playlist id and playlist index when supplied;
- preserving `t=` / `start=` as capture context;
- title/channel/description/thumbnail metadata;
- official YouTube IFrame playback when online;
- transcript/caption representation when legitimately available through configured connectors;
- locator `{ startSeconds, endSeconds? }`.

It does **not** own a separate YouTube library UI.

## Capture architecture

### Android share flow

`Share → NOTE2` must accept any URL, not Instagram only.

1. Android Share Target sends text/URL to NOTE2.
2. NOTE2 immediately creates a `saved` Source with provider + canonical identity.
3. UI returns to `Источники` and shows the new item instantly.
4. Background enrichment starts.
5. Card updates in place:
   - `Сохранено`;
   - `Получаю данные…`;
   - `Готово`;
   - or `Нужно действие`.

The user never has to remain on an import screen.

### Paste flow

The global `+` sheet contains only:
- Заметка;
- Задача;
- Голос;
- Фото / скан;
- Файл;
- **Ссылка**.

There is no separate Instagram button and no separate YouTube button.

After the user pastes a link, the provider is detected automatically.

## App navigation

Return to the v4.0 shell:

1. Сегодня
2. Заметки
3. Источники
4. Поиск
5. Профиль

No Instagram or YouTube top-level tab.

## Sources screen

The Sources screen is a content library, not an analysis dashboard.

### Header

- `Источники`
- Search
- `+`

### Provider filters

Single horizontal filter row:

`Все  Instagram  YouTube  Веб  Документы  Медиа`

These are filters over the same Source collection.

### Secondary filters

Hidden behind `Фильтры`:
- Collection;
- Favorite;
- Offline;
- Unprocessed;
- Recently saved;
- Type;
- Date.

### View modes

Only two:
- Comfortable list (default mobile);
- Media grid.

No platform-specific library layout state.

## Unified Source Card

A card shows only information needed to choose/open the item:

- provider badge/icon;
- visual preview;
- title or first meaningful caption line;
- author/channel/domain;
- source kind (`Карусель · 7`, `Видео · 18:42`, `PDF · 42 стр.`);
- saved time;
- processing status if not ready;
- optional watch/read progress;
- favorite indicator;
- overflow menu.

The card does **not** show:
- OCR buttons;
- AI mode buttons;
- structure extraction;
- duplicate score;
- synthesis controls;
- collections as a cloud of pills.

Those were the main causes of v4.3–v4.4 visual overload.

## Unified Source Viewer

Every Source opens into the same page hierarchy.

### 1. Top bar

- Back;
- provider/author;
- Favorite;
- Overflow menu.

### 2. Media surface

Provider-native presentation:

Instagram carousel:
- swipe;
- original order;
- correct aspect ratio;
- image zoom;
- video playback;
- dots/counter;
- start on shared `img_index` when present.

YouTube:
- official 16:9 embedded player;
- resume/start from captured time;
- playback remains visually inside NOTE2.

PDF:
- page reader.

Web:
- clean reader.

### 3. Information surface

Immediately below media:
- title/caption;
- author/channel;
- date;
- source URL;
- small Save/Favorite/Collection controls.

### 4. Four calm tabs

Only:

**Описание**
- original caption/description;
- metadata.

**Текст**
- Instagram OCR / transcript;
- YouTube transcript;
- PDF/article extracted text;
- locator-aware navigation.

**Выжимка**
- default short summary;
- switch `Кратко / Подробно` inside the tab;
- evidence chips jump to exact slide/timestamp/page.

**Заметки**
- linked user notes;
- create note from source;
- highlights.

Advanced features move to overflow/contextual actions:
- structured extraction;
- compare;
- duplicate/similar sources;
- export;
- process all media;
- offline pin when supported.

## Analysis hierarchy

Analysis is no longer a collection of buttons on the library card.

Default automatically available result:
- one short summary when enough text exists.

On demand inside `Выжимка`:
- Detailed;
- Simplified;
- Verified;
- Compare.

Structured knowledge is not a primary viewer tab. It becomes a reusable internal representation that may surface contextually:
- recipe → “Создать рецепт”;
- product → “Сохранить товар”;
- place → “Сохранить место”.

## Collections

Collections are universal, not Instagram-specific.

Examples:
- Дизайн;
- Покупки;
- Рецепты;
- Посмотреть;
- Работа;
- Путешествия.

A single collection can contain Instagram posts, YouTube videos, PDFs and notes.

## Cross-source synthesis

Multi-select belongs to the universal Sources screen.

Select any combination:
- Instagram carousel;
- YouTube video;
- PDF;
- article.

Then:
- `Создать конспект`;
- `Сравнить`;
- `Добавить в коллекцию`;
- `Экспорт`.

The synthesis layer consumes `representations[]`, not provider-specific data structures.

## Search and evidence

Search indexes `representations[]` from every provider.

A search result includes an exact locator:
- Instagram → slide 2 / video timestamp;
- YouTube → timestamp;
- PDF → page/region;
- web → heading/paragraph.

Tap always follows:

`result → Source Viewer → exact locator`

## Offline policy

Offline is a capability of a Source, not a visual category.

Possible levels:
- `metadata-only`;
- `text-offline`;
- `media-offline`.

The UI shows one simple state in the overflow menu.

Provider policy decides what is legally/technically available. For YouTube, online playback should use the official embedded player; offline media must not be assumed available by default.

## Visual direction

Return to v4.0:
- flat light background;
- white content surfaces;
- no gradients;
- one restrained accent;
- Inter/system Cyrillic typography;
- 16–17 px body;
- 25–28 px page title;
- 13 px secondary text;
- 24–26 px primary icons;
- 11–12 px bottom-nav labels;
- content thumbnails carry most of the color.

Do not add decorative 3D objects, colored schema badges, dense analytics blocks or AI chrome to Sources.

## Migration from v4.4

Keep the capabilities, change their placement.

### Keep internally
- Instagram acquisition;
- carousel preservation;
- OCR;
- video transcription;
- summaries;
- structured extraction;
- collections;
- duplicate detection;
- offline blob cache;
- multi-source synthesis.

### Move out of primary UI
- structured card;
- processing percentage panel;
- collection chip cloud;
- duplicate warning panel;
- three analysis buttons;
- OCR/transcribe controls for every slide.

### Replace

`InstagramLibrary + InstagramPostViewer`

with

`SourceLibrary + SourceViewer + provider renderer`.

Provider-specific components are permitted only inside the media rendering/acquisition layer.

## Implementation sequence

1. Introduce `SavedSource` normalization and provider registry.
2. Generalize Share Target from Instagram URL to any URL.
3. Add `YouTubeAdapter` with canonical URL/start/playlist context parsing.
4. Refactor Sources list to use one `UnifiedSourceCard`.
5. Build one `SourceViewerShell`.
6. Move Instagram carousel into `InstagramMediaRenderer`.
7. Move YouTube playback into `YouTubeMediaRenderer` using the official IFrame Player/API model.
8. Replace Instagram-only filters with provider filters.
9. Move advanced Instagram controls into viewer overflow / contextual analysis.
10. Convert collections and multi-select synthesis to provider-agnostic operations.
11. Add contract tests proving Instagram and YouTube both map into the same Source schema.
12. Preserve existing 70/70 regression coverage before removing legacy UI paths.

## Success test

If the user saves one Instagram carousel and one YouTube video, both should:
- appear next to each other in Источники;
- have the same card hierarchy;
- open the same viewer shell;
- differ only in the media renderer and provider metadata;
- participate equally in Search, Collections, Notes and synthesis.

If adding TikTok later requires a new top-level screen, this architecture has failed.
