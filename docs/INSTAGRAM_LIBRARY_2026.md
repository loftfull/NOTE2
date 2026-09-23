# NOTE2 Instagram Library — Architecture & UX 2026

## User journey

Primary Android path:

1. User opens a post/reel/carousel in Instagram.
2. Taps **Share / Поделиться**.
3. Chooses **NOTE2**.
4. NOTE2 receives the shared text/link through the native Capacitor Share Target.
5. NOTE2 automatically opens `Источники → Instagram` and starts saving the shared post.
6. The saved post becomes a normal NOTE2 Source with durable provenance.

Manual fallback:
- paste the Instagram post/reel URL into `Источники → Instagram` and press `Сохранить`.

## Saved representation

Each Instagram source stores:
- canonical original URL;
- shortcode;
- author username / available display name;
- post caption;
- original published timestamp when available;
- media items in original sidecar order;
- item type image/video;
- width/height/alt metadata where available;
- server archive metadata;
- optional OCR text per image;
- favorite state;
- NOTE2 Source text/sections/chunks for search and RAG.

The IndexedDB Source Vault stores metadata and extracted text. Durable media is archived on the authenticated gateway's persistent disk so expiring Instagram CDN URLs are not treated as storage.

## Server acquisition

`POST /api/instagram {url}`

Flow:
1. validate that the URL is an Instagram `p`, `reel` or `tv` URL;
2. extract path-safe shortcode;
3. invoke the isolated Instaloader bridge;
4. normalize caption/author/media list;
5. validate each returned media URL with the same private-network protection used by URL ingestion;
6. download with byte limits and redirect validation;
7. persist per account under `INSTAGRAM_ROOT`;
8. write metadata only after all media items have been archived;
9. return protected archive paths.

Read routes:
- `GET /api/instagram/:shortcode`
- `GET /api/instagram/:shortcode/media/:index`

All Instagram routes follow the existing account-auth protection when production gateway auth is required.

## Client viewer

The viewer intentionally resembles source behavior without cloning Instagram chrome:
- original carousel order;
- next/previous controls;
- position dots + `n/N`;
- fullscreen-style media surface;
- double tap/click and explicit zoom for images;
- inline video playback with native controls;
- media download;
- link back to the original post;
- caption under media;
- OCR action on each image;
- OCR text displayed and re-indexed;
- favorite;
- create a NOTE2 note from caption + original URL.

## Search / knowledge integration

At save time:
- caption becomes a Source section;
- available alt/accessibility text becomes media sections.

After OCR:
- OCR is appended to the corresponding media section;
- the Source is re-indexed;
- lexical/vector search and evidence retrieval can find the new text.

Instagram is therefore not a bookmark silo. It participates in the same knowledge system as PDFs, books, videos and user notes.

## Library capabilities in first implementation

Inside `Источники → Instagram`:
- author/caption search;
- filters: all / favorites / carousels / video / photos;
- first-media thumbnail;
- media count;
- original caption preview;
- favorite toggle;
- open full carousel viewer.

## Brainstorm — high-value next extensions

### Collections
User-defined collections such as:
- Интерьеры;
- Рецепты;
- Дизайн;
- Путешествия;
- Покупки;
- Идеи для проекта.

A post may belong to multiple collections. Collections should be Source properties, not duplicated folders.

### Smart extraction
- detect products / brands / places / recipes / books mentioned in the caption or OCR;
- extract actionable checklists from carousel slides;
- combine OCR across all slides into a readable article;
- generate a clean “carousel transcript” preserving slide boundaries;
- translate selected slide/caption;
- compare a saved Instagram claim with other NOTE2 sources.

### Post → notebook transformations
- save highlighted slide as an inline block in a note;
- drag a carousel slide into a project note;
- create task from selected caption sentence/OCR region;
- create moodboard/live view from saved image sources;
- visual duplicate detection.

### Offline/mobile
- per-post offline pin;
- archive storage quota and cleanup controls;
- download only selected slides vs entire carousel;
- background save progress after Share;
- Android notification on completed/failed archival.

## Safety / product boundaries

- user-initiated single-post/reel saving only;
- preserve original URL and author provenance;
- no private-account bypass;
- no follower/profile bulk scraping;
- no fabricated media/caption when extraction fails;
- respect deletion/copyright/privacy obligations when exporting or redistributing content;
- acquisition provider is replaceable behind the Instagram adapter when Instagram changes upstream behavior.
