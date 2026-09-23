# NOTE2 v4.4 — Structured Instagram Knowledge

## User flow

Saved Instagram Source → full OCR/transcript processing → typed object extraction → editable structured card → search/RAG/collections → optional offline pin → exact media block in a note.

## Supported object families

- Recipe: title, ingredients, steps, time, servings.
- Product: name, brand, model, price, specs.
- Place: name, address, phone, notes.
- Book: title, author, ISBN, key ideas.
- How-to: goal, steps, materials, warnings.
- Design / travel / study / general: title, ideas, actions.

## Grounding contract

Structured values are derived only from the Source evidence document. Each field has evidence labels. Normalization discards labels that do not exist in the current Source.

## Offline contract

`offlinePinned=true` means the media payload is actually persisted in the device IndexedDB `offlineAssets` store. Viewer resolution is local Blob first, archived gateway URL second.

Unpin removes device-local media blobs but does not delete the canonical Source or server archive.

## Note-block contract

`Слайд → заметку` creates a note fragment for one exact carousel media item and includes its locator/evidence identity. This is the bridge toward a future block editor without forcing a full editor migration in v4.4.

## Search contract

Human-readable structured fields are appended as a dedicated Source section, so product model/price, recipe ingredients, place address, book author, etc. are searchable and available to existing NOTE2 RAG.
