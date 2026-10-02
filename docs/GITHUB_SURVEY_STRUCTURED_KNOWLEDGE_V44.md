# NOTE2 v4.4 — GitHub Survey: Structured Knowledge, Offline Pin & Note Blocks

## Scope

This survey is the mandatory GitHub-first discovery pass for NOTE2 v4.4. It covers structured extraction, knowledge graphs, offline-first persistence, block editors, and saved-content libraries. More than 50 candidate repositories were surveyed; a smaller shortlist was inspected more deeply before implementation.

The goal is assimilation of proven patterns, not wholesale import of another product or creation of a parallel NOTE2 stack.

## 51 surveyed candidates

### Block editors / Notion-style composition (10)
1. `steven-tey/novel`
2. `TypeCellOS/BlockNote`
3. `sereneinserenade/notitap`
4. `phyohtetarkar/tiptap-block-editor`
5. `nuxt-ui-templates/editor`
6. `microvoid/marktion`
7. `hunvreus/pagescms-editor`
8. `pierre-lgb/slashwriter`
9. `CafeinoDev/tiptap-notion`
10. `factly/scooter`

### Structured output / schema extraction (10)
11. `minhnguyen1108/structured-output-validator`
12. `SabbellaLaharika/structured-output-llm`
13. `saurabhherwadkar/ai-genai-structured-output`
14. `rahulmandal112/invoice-data-extraction-llm`
15. `sohaggain/ai-structured-data-extraction-api`
16. `Paullllllllllllllllll/ChronoMiner`
17. `marcelodmartini/week2-llm-ia-fintech-bilingual`
18. `nachai-l/universal_llm_batch_generation_framework`
19. `ramiha97/student-teacher-llm`
20. `susu6666666666/docstruct-extractor`

### Knowledge graph / entity-relation extraction (11)
21. `microsoft/graphrag`
22. `automataIA/graphrag-rs`
23. `zaydmulani09/mnemo`
24. `junhewk/simple-graph-builder`
25. `julymetodiev/post-cortex`
26. `MadsDoodle/Knowledge-Graph-using-RDF-LLM`
27. `closedloop-technologies/PromptedGraphs`
28. `belindamo/kg_mem`
29. `sjarmak/scix-agent`
30. `Kesara03/knowledge-graph-rag-pipeline`
31. `maddataanalyst/grawiki`

### Offline-first / IndexedDB / PWA persistence (10)
32. `Alenaak/Oracle-APEX-APP-with-PWA-Offline-Access`
33. `LinkdJulioFlores/LinkdJulioFlores-tanstack-start-offline-first-pwa`
34. `JColeCodes/cash-cache`
35. `adhitamafikri/vite-offline-notes-app`
36. `JaiAakash21/Offline-First-App`
37. `adhitamafikri/offline-notes-app`
38. `rbalukja15/pwa-cache-kit`
39. `Hayden-Haun/Offline-Budget-App`
40. `Yelsabawyy/calls-trolley-systems-enegix`
41. `rysiphoto/PWA`

### Saved-content / bookmark libraries (10)
42. `kanishka-linux/reminiscence`
43. `linkwarden/linkwarden`
44. `sissbruecker/linkding`
45. `devimust/easy-bookmark-manager`
46. `ahmadfarhan1981/linkstash`
47. `ThomasRoest/better-bookmarks`
48. `mkoppmann/eselsohr`
49. `masukomi/backup_brain`
50. `querwurzel/semantic-scuttle`
51. `roelofjan-elsinga/link-that`

Additional discovery passes also covered recipe parsing, NER/location extraction and unstructured document pipelines.

## Deep-review shortlist and assimilation

### TypeCellOS/BlockNote
Useful pattern:
- block-level composition;
- extensible custom blocks;
- source/embed objects as first-class editor content;
- Notion-style editing without forcing Markdown syntax on the user.

Assimilated into NOTE2 direction:
- exact Instagram media can become a note block;
- typed structured object cards should become editable note blocks;
- slash-command architecture is a future editor migration target.

Not imported wholesale:
- NOTE2 is not migrated to another editor during the Instagram feature;
- existing local note persistence remains intact until a dedicated editor migration is proven.

### steven-tey/novel
Useful pattern:
- contextual AI inside writing flow;
- slash-command discoverability;
- clean WYSIWYG composition.

Assimilated:
- source-to-note actions produce editable content instead of a detached AI report;
- AI structured extraction remains an optional contextual enhancement.

### microsoft/graphrag
Useful pattern:
- entities and relationships can be derived as a separate knowledge layer;
- synthesis should use relationships across multiple sources rather than concatenate summaries.

Assimilated:
- typed Instagram objects feed the existing NOTE2 source graph/search model;
- entity/relation expansion is planned on top of Note/Source objects.

Not imported:
- no second Python graph database/index stack;
- no GraphRAG runtime dependency in v4.4.

### Linkwarden / linkding class
Useful pattern:
- saving is distinct from durable archival;
- collection/tag views should derive from one canonical object;
- original URL remains provenance.

Assimilated:
- Instagram collections do not duplicate Source records;
- canonical/source URLs remain attached to structured objects.

### Offline-first candidates
Useful pattern:
- “saved” and “available offline” are separate states;
- binary payloads need explicit local cache lifecycle.

Assimilated:
- `offlineAssets` IndexedDB store;
- pin/unpin lifecycle;
- viewer reads local Blob first and network second.

## v4.4 decision

NOTE2 uses a three-layer structured extraction approach:

1. **Deterministic extraction** for obvious Russian-language fields (prices, recipe ingredients/steps, models, addresses, ISBN-like values, etc.).
2. **Schema-validated AI extraction** only over evidence already present in caption/OCR/transcript.
3. **Editable user data** so extracted fields are not immutable AI prose.

Every structured field may carry one or more evidence labels such as `[CAPTION]`, `[MEDIA 2 OCR]`, or `[MEDIA 1 TRANSCRIPT]`. Unknown/fabricated evidence labels are rejected by normalization.

## Anti-Frankenstein constraints

- No separate Instagram database.
- No second RAG stack.
- No second OCR/transcription engine.
- No full BlockNote/Novel migration during this feature.
- No GraphRAG runtime dependency.
- No offline flag without locally stored media blobs.
- No structured value accepted as source-grounded unless its evidence locator exists.
