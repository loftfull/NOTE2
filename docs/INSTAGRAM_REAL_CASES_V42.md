# NOTE2 Instagram — real control cases v4.2

These two user-provided URLs are permanent regression fixtures for the Instagram Source feature.

## Case A — Reel

Shared URL:
`https://www.instagram.com/reel/DaszqnpoLCl/?igsh=MTY0Z3l3OWU5MzU1dw==`

Expected URL semantics:
- shortcode: `DaszqnpoLCl`
- route type: `reel`
- canonical URL: `https://www.instagram.com/reel/DaszqnpoLCl/`
- requested media index: `0`

Expected product flow after acquisition:
1. archive video bytes;
2. show native inline playback;
3. allow save/export;
4. run durable transcription on demand;
5. preserve transcript timestamps as evidence locators;
6. index caption + transcript;
7. generate Brief / Detailed / Organize views from extracted evidence only;
8. citations/search hits navigate to the correct timestamp.

## Case B — carousel/post opened on slide 2

Shared URL:
`https://www.instagram.com/p/Db7z448jYex/?img_index=2&igsh=MWtvejAyaHZ3Y2V0aQ==`

Expected URL semantics:
- shortcode: `Db7z448jYex`
- route type: `p`
- canonical URL: `https://www.instagram.com/p/Db7z448jYex/`
- requested media index: `1` (zero-based internal value)

Expected product flow after acquisition:
1. archive all sidecar media in original order;
2. open viewer on the second item because the shared URL requested `img_index=2`;
3. swipe/buttons/dots preserve order;
4. images support zoom and per-slide download;
5. OCR is stored per slide;
6. video slides, if present, support playback/transcription;
7. caption + all OCR/transcripts are indexed as one Source while retaining per-slide locators;
8. Brief / Detailed / Organize analysis uses those evidence labels;
9. similar saved posts are detected from extracted content, not merely from author names.

## Failure contract

Instagram may require a logged-in session or temporarily block public metadata access. In that case NOTE2 must:
- keep the shared link as a `needs-connector` Instagram Source;
- keep canonical URL + original shared URL + requested media index;
- display the acquisition error instead of fake caption/media;
- allow a later acquisition retry after server/session configuration.

## Live gateway check

With a running NOTE2 gateway:

```bash
NOTE2_GATEWAY_URL=https://your-gateway.example \
NOTE2_SESSION_TOKEN=... \
node scripts/run-instagram-real-cases.mjs
```

The runner does not assert the semantic content of these posts because that content can change or become unavailable. It verifies that the gateway can acquire and normalize the current post metadata/media without losing source provenance.
