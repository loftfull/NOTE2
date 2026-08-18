# NOTE2 Instagram Knowledge Library v4.3

## Goal

Turn saved Instagram posts into durable, searchable and reusable knowledge objects inside NOTE2 instead of treating them as bookmarks or downloaded media.

## Implemented in the v4.3 working source

### Full-post processing

A saved post now exposes `Обработать весь пост`.

The action processes only missing evidence:
- image → existing NOTE2 Vision/OCR pipeline;
- video/Reel → existing durable media transcription pipeline;
- already processed media is skipped;
- patches are committed back to the Source in one batched update to avoid losing concurrent results.

The viewer displays processing coverage as `processed / processable` and a percentage.

### Automatic semantic classification

Classification is derived from stored caption/OCR/transcript evidence, not from the URL alone.

Initial categories:
- Recipes;
- Products;
- Places;
- Books;
- Design;
- Instructions;
- Travel;
- Study;
- Ideas / unknown.

`autoCategory` is recalculated after source evidence changes.

### Collections

The Source metadata can contain `instagram.collections[]`.

Suggested collections are derived from extracted evidence. The user can toggle suggestions directly in the post viewer. Library-level collection filters are generated from the saved Source metadata.

Examples:
- Референсы
- Интерьеры
- Рецепты
- Покупки
- Путешествия

Collections do not copy the post. They are views over the same Source.

### Duplicate / repeated-idea detection

NOTE2 compares extracted tokens between Instagram Sources. Strong overlap is marked as a likely repeated idea. The purpose is not to delete posts automatically; it is to prevent repeated material from polluting later synthesis.

### Multi-source synthesis

Library cards can be selected. With two or more selected Sources, `Собрать конспект` creates one NOTE2 note.

AI synthesis receives source-labelled evidence documents:
- `[IG1]`, `[IG2]`, ... identify saved posts;
- inner labels `[CAPTION]`, `[MEDIA N OCR]`, `[MEDIA N TRANSCRIPT]` remain intact.

The synthesis prompt requires:
1. merge repeated ideas;
2. show differences/contradictions;
3. extract useful actions;
4. preserve evidence labels;
5. never introduce external facts.

If the AI endpoint is unavailable, NOTE2 still creates a deterministic source-organized note instead of losing the selection.

## Regression gates

New test coverage checks:
- full-post processing coverage calculations;
- evidence-based category detection;
- collection suggestions;
- likely-duplicate scoring;
- collection statistics;
- synthesis provenance labels;
- presence of bulk-processing / collections / synthesis controls in the application shell.

Current working-source result: **58 tests / 58 passed / 0 failed**.

Production Vite/Android build is still a separate gate and must not be claimed until dependencies are installed and the real build completes.

## Architectural rule

Instagram remains a Source type inside the existing Source Vault. No separate Instagram database, RAG engine, OCR system or media queue is introduced.
