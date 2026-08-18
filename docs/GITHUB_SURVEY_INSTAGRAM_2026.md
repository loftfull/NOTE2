# NOTE2 — GitHub Survey: Instagram Save Library (2026)

## Rule applied

This feature was not designed from scratch. Before implementation, we reviewed more than 50 public GitHub repositories across the complete flow:

`Android share → Instagram acquisition/metadata → durable archive → carousel/zoom → playback → OCR → searchable local library`.

The goal is **assimilation**, not wholesale importing of another application. NOTE2 keeps one Source Vault, one auth layer, one search/RAG index and one media/OCR architecture.

## Reviewed repository universe

### A. Instagram acquisition / download / metadata

1. `instaloader/instaloader`
2. `igdownloader/InstagramDownloader`
3. `riad-azz/instagram-video-downloader`
4. `althonos/InstaLooter`
5. `hoaianle/Instagram-Downloader`
6. `bachors/Insta-Downloader`
7. `KishanViramgama/InstagramDownloader`
8. `taengstagram/instagram-livestream-downloader`
9. `gusfahmi/Social-Media-Downloader`
10. `devyuji/isave`
11. `nitink133/Instagram-Profile-Downloader`
12. `awesome-yasin/Media-Downloader`
13. `Okramjimmy/Instagram-reels-downloader`
14. `milancodess/Instagram-Video-Downloader-API`
15. `Ytbh/Telegram-InstagramMediaDownloader-Bot`
16. `shico007/InstagramDownload`
17. `MohammadAG/Xposed-InstagramDownloader`
18. `milancodess/universalDownloader`
19. `dipayansarkar47/insta-reels-downloader`
20. `fernandod1/Instagram-downloader`
21. `xniperbuilds/riplox-ig`
22. `postaddictme/instagram-php-scraper`
23. `Hiromi-nee/instagram-scraper`
24. `drawrowfly/instagram-scraper`
25. `noncent/instagram-data-scraper`
26. `postaddictme/instagram-java-scraper`
27. `harismuneer/Ultimate-Social-Scrapers`
28. `arcanecfg/Instagram-Private-Scraper`
29. `huaying/instagram-crawler`
30. `th3unkn0n/osi.ig`
31. `h4t0n/instagram-scraper`
32. `Avnsh1111/Instagram-Reels-Scraper-Auto-Poster`
33. `BochilTeam/scraper`
34. `ahmedrangel/instagram-media-scraper`
35. `elvisyjlin/media-scraper`
36. `floriandiud/instagram-users-scraper`

### B. Android / Capacitor Share Target

37. `Cap-go/capacitor-share-target`
38. `TorichanCapgo/capacitor-share-target`
39. `LeoSchleicher/TextReceiver`
40. `HaraldRichter/sharing_intent_demo`
41. `SabithPkcMnr/AndroidIntentReceiver`

### C. Carousel / image gallery / zoom interaction

42. `MinJieLiu/react-photo-view`
43. `xiaolin/react-image-gallery`
44. `infeng/react-viewer`
45. `benhowell/react-grid-gallery`
46. `pedropalau/react-bnb-gallery`
47. `specter256/react-simple-image-viewer`
48. `davidjerleke/embla-carousel`
49. `leandrowd/react-responsive-carousel`
50. `meliorence/react-native-image-gallery`
51. `georstat/react-native-image-gallery`
52. `InterfaceKit/react-native-interactive-image-gallery`
53. `FidMe/react-native-photo-gallery`
54. `meliorence/react-native-snap-carousel`
55. `dohooo/react-native-reanimated-carousel`
56. `gusgard/react-native-swiper-flatlist`
57. `anvilabs/react-native-image-carousel`
58. `namlehoangdev/react-native-anchor-carousel`

### D. OCR / image text extraction

59. `pedrol2b/react-native-vision-camera-mlkit`
60. `ahmeterenodaci/rn-mlkit-ocr`
61. `crendu/OCR_mlkit_TextRecognition`
62. `Preeternal/react-native-document-scanner-plugin`
63. `spanmartina/Text-Recognition-and-Translation-MLKit`
64. `gonexwind/kotlin_ocr`
65. `gonexwind/kotlin_ocr_translation`
66. `josrangel/MlKitTextRecognitionAndroidExample`
67. `mtndrms/TextRecognitionXML`
68. `Raju13579/OCR_mlkit_TextRecognition`
69. `vaibhavimore1811/android-ocr-filter-app`
70. `lnlan1810/Document-OCR`
71. `Javed69/Android-Based-Optical-Character-Recognition`

### E. Media playback

72. `google/ExoPlayer`
73. `jellyfin/jellyfin-androidx-media`
74. `halilozel1903/Media3Sample`
75. `daniyaljavaid/media3-audio-stream`
76. `rafaqat-funprime/SampleAndroidVideoPlayer`
77. `fengdai/compose-media`
78. `mrprashant249/ExoPlayerMediaDemo`

Total named candidates: **78**.

## Shortlist and assimilation decision

### 1. `Cap-go/capacitor-share-target` — ADOPT AS DEPENDENCY

Why:
- purpose exactly matches `Instagram → Share → NOTE2`;
- current plugin major tracks Capacitor 8, which matches NOTE2;
- supports text/URL and file share events;
- avoids maintaining another custom Android intent bridge beside the existing secure-credentials bridge.

Assimilated boundary:
- plugin delivers the shared payload only;
- NOTE2 extracts an Instagram URL and routes it into the existing Source flow;
- it does not own storage, UI, search or processing.

License note: repository/package metadata must be treated as MPL-2.0 unless clarified upstream. Use as a dependency rather than copying plugin source.

### 2. `instaloader/instaloader` — ADOPT AS SERVER-SIDE ACQUISITION PROVIDER

Why:
- mature Instagram-specific metadata/media model;
- supports post photos/videos, sidecars/carousels and captions;
- keeps Instagram-specific breakage behind one provider boundary.

Assimilated boundary:
- a tiny Python bridge receives only a shortcode;
- returns normalized post metadata and media URLs;
- Node gateway validates, downloads and archives media itself;
- no profile crawling UI and no bulk scrape workflow enters NOTE2.

### 3. `react-photo-view`, `react-image-gallery`, `embla-carousel` — ASSIMILATE INTERACTION PATTERNS, DO NOT ADD YET

Useful ideas:
- swipe/next-prev continuity;
- fullscreen preview;
- zoom and image preloading;
- stable carousel index and dots.

Decision:
- first implementation uses lightweight NOTE2-native controls to avoid another large UI dependency;
- a mature gallery dependency can be adopted later only if pinch/pan accessibility and performance testing prove the custom interaction weaker.

### 4. OCR repositories — REJECT AS DUPLICATE SUBSYSTEM

NOTE2 already has an image Vision/OCR path and evidence indexing. Adding a second OCR stack only for Instagram would create duplicate semantics and inconsistent extraction quality.

Assimilation:
- Instagram image → authenticated archived blob → existing `analyzeVisualFile()` → OCR text stored in the same Instagram Source → reindex.

Native ML Kit remains a future offline OCR candidate for all image sources, not just Instagram.

### 5. ExoPlayer / Media3 — REFERENCE FOR NATIVE PHASE, REUSE CURRENT WEB MEDIA NOW

NOTE2 already plays video/audio in its React/Capacitor shell. The first Instagram viewer uses native HTML media controls in the existing web layer.

Android Media3 becomes valuable later if background playback, PiP, advanced buffering/caching or native offline playback requires it across all Source types.

## Explicit rejects

Do not assimilate:
- private-account sniffers;
- follower scraping tools;
- profile bulk crawlers;
- auto-post/repost bots;
- Xposed hooks;
- Telegram bots;
- another standalone Instagram database/library application.

They do not match the user-initiated capture job and would expand legal, reliability and security surface without improving the notebook.

## Product architecture chosen

```text
Instagram app
  ↓ Android Share
@capgo/capacitor-share-target
  ↓ URL
NOTE2 Instagram SourceAdapter
  ↓ shortcode
Node gateway
  ↓ provider bridge
Instaloader
  ↓ normalized metadata + ordered media URLs
NOTE2 safe downloader
  ↓
per-account persistent Instagram archive
  ↓
Source Vault record
  ├─ caption → lexical/vector search
  ├─ images → carousel + zoom + OCR
  ├─ videos → inline playback
  ├─ provenance → original URL / author / shortcode
  └─ OCR → Source sections → RAG/evidence
```

## Non-Frankenstein constraints

1. Instagram is one `Source.kind`, not a new application silo.
2. One Source Vault / chunks index.
3. Existing account session scopes archived media.
4. Existing Vision/OCR performs image extraction.
5. Existing search/RAG indexes caption and OCR.
6. Original ordering of sidecar media is preserved.
7. CDN URLs are not treated as durable storage; server archives user-selected media.
8. Private/unavailable posts fail visibly; no fabricated caption/media.
9. Only user-initiated single-post/reel capture is in scope for v1.
10. Every stored post preserves original URL and author provenance.
