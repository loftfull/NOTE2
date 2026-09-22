# NOTE2 v4.11 — Actionable Dashboard

The v4.0 shell remains the visual/navigation baseline. v4.11 changes behavior, not product identity.

## Today / Сегодня

- Reads recent Source records from the existing IndexedDB Source Vault.
- Shows up to four recent sources in a compact **Входящие** section.
- A source can be opened through the common Source Viewer using its exact Source id.
- A source can be converted directly into a linked note; the note stores `<!-- source:<id> -->` for provenance/backlinks.
- Open tasks can be completed and renamed inline without leaving Today.
- A compact task input creates a task immediately on Today.

## Guardrails

- No provider-specific top-level navigation.
- No fake inbox records in the runtime app.
- Source → Note never fabricates source facts; it copies only the Source title/description/original URL already stored.
- Existing Source Vault, RAG, media queue, Instagram/YouTube adapters and capture pipeline remain canonical.

## Verification

Current local v4.11 regression gate: **102/102 passed**.
