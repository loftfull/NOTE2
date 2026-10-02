# NOTE2 Instagram Library 2026

Implementation: user-initiated Instagram Share/Paste → Capacitor Share Target → server Instagram adapter → Instaloader metadata → bounded safe media archive → NOTE2 Source Vault → carousel/zoom/video/caption/OCR → search/RAG.

Key rules:
- Instagram is `Source.kind = instagram`, not a second app/database.
- Caption and image OCR are indexed as normal Source sections.
- Media order from sidecar/carousel is preserved.
- Authenticated persistent gateway stores media; expiring CDN URLs are not durable storage.
- Original URL/author provenance is always retained.
- No bulk profile crawling or private-account bypass.

First UI capabilities:
- Instagram library inside Sources;
- automatic save after Android Share Target;
- manual URL paste fallback;
- author/caption search;
- filters: all, favorites, carousels, video, photo;
- first-media thumbnails and media counts;
- favorite toggle;
- ordered carousel viewer;
- image zoom;
- inline video playback;
- per-item download;
- OCR per image through existing NOTE2 Vision path;
- caption display;
- create a regular NOTE2 note from post caption + original URL.
