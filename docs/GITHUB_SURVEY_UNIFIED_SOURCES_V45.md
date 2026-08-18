# GitHub Survey — Unified Sources v4.5

Goal: prevent Instagram/YouTube from becoming separate mini-products. Screen at least 50 repositories for a single saved-source/library/viewer architecture.

## 1. Read-later / saved-content systems

1. `omnivore-app/omnivore`
2. `DominikPieper/obsidian-ReadItLater`
3. `onlyhavecans/ReadItLater-Calibre-Plugin`
4. `miss-syntax/letter-project`
5. `ncarlier/readflow`
6. `Fillll/pockebot`
7. `perstarkse/minne`
8. `jensomato/ReadeckApp`
9. `readeck/readeck`
10. `ilyas-hallak/readeck-ios`

## 2. Bookmark / preservation libraries

11. `linkwarden/linkwarden`
12. `sissbruecker/linkding`
13. `kanishka-linux/reminiscence`
14. `devimust/easy-bookmark-manager`
15. `goniszewski/grimoire`
16. `ahmadfarhan1981/linkstash`
17. `ThomasRoest/better-bookmarks`
18. `denho/faved`
19. `sebcode/b`
20. `mkoppmann/eselsohr`

## 3. YouTube archive / media-library systems

21. `tubearchivist/tubearchivist`
22. `sworcery/ChannelHoarder`
23. `Alanaktion/mytube`
24. `Wayback-Tube/Wayback-Tube-Front`
25. `MathiasDPX/archivetube`
26. `SiddheshNan/yt-archiver`
27. `NickN0w4k/tubetracker`
28. `siikamiika/youtube-live-archive`
29. `Akunsinu/youtube-archiver`
30. `hipsterjazzbo/tubecast`

## 4. Web clipper / capture patterns

31. `ganesshkumar/obsidian-bookmarklet-maker`
32. `timrosenberg/NotePlan-Web-Clipper-Bookmarklet`
33. `zhangboy03/bookmarklet-web-clipper`
34. `iArnaud/evermarks`
35. `parmsam/quarto-clipper-bookmarklet`
36. `not-a-firm/not-a-webclipper`
37. `swaevior/web-clipper`
38. `JuliusGruber/bookmarks-to-obsidian-skill`
39. `tsubasaogawa/hatebu-web-clipper-for-obsidian`
40. `thomasmeijer92/visual-bookmarks-grid`

## 5. Saved-content / Pocket-style alternatives

41. `apvcode/pocketsentry`
42. `recally-io/recally`
43. `farynaio/org-pocket`
44. `savetoink/savetoink`
45. `Kmilos8/pocketproxy-remote`
46. `mgaitan/readeckbot`
47. `makebit/obsidian-readeck-importer`
48. `iceyear/readeck.koplugin`
49. `mrexodia/readeck-mcp`
50. `eleith/readeckobo`

## 6. Cross-media / social archival candidates

51. `nelsonwang222/SocialArchiver`
52. `nikolainyegaard/social-downloader`
53. `winterop-com/maneki`
54. `josterga/youtube-server`
55. `Glitchedpixel-io/media-api`

## Strongest references

### Omnivore
Absorb:
- one library for captured content;
- read-later mental model;
- content-first presentation;
- highlights/reader concepts.

Do not copy:
- its whole application architecture;
- licensing-sensitive code into NOTE2 without review.

### Linkwarden
Absorb:
- collect/read/annotate/preserve as one lifecycle;
- provider/domain is metadata, not app navigation;
- preservation status as a background capability.

Do not copy:
- collaborative/team product surface;
- Next.js architecture.

### Readeck
Absorb:
- calm saved-content library;
- reader-first experience;
- source as durable saved item.

### TubeArchivist
Absorb:
- YouTube media-library concepts;
- playback progress;
- thumbnails/title/channel as primary library information;
- archive/enrichment state separated from viewing.

Do not copy:
- Elasticsearch/media-server stack;
- dedicated YouTube-only navigation model.

## Architectural synthesis for NOTE2

The common pattern worth assimilating is not a specific UI component. It is this lifecycle:

`Capture → Saved immediately → Enrich in background → View in source-native renderer → Extract/search text → Link to notes → Analyze on demand`

The correct abstraction is **SavedSource**, not InstagramPost or YouTubeItem.

Instagram and YouTube are provider adapters.

A source library card should not expose the processing pipeline. Provider-specific controls belong only in the source renderer or overflow menu.

## Explicit rejection from v4.3–v4.4

Reject as primary library UI:
- Instagram-only library architecture;
- large OCR/transcription processing panels;
- always-visible structured cards;
- chip clouds for collections;
- duplicate-warning blocks;
- three analysis buttons on every post;
- provider-specific multi-select flows.

Keep the underlying capabilities but expose them through the unified Source architecture documented in `UNIFIED_SOURCE_ARCHITECTURE_V45.md`.
