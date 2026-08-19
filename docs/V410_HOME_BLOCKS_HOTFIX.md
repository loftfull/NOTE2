# NOTE2 v4.10 — Home Blocks Hotfix

## Goal

Repair the broken blocks visible on the Today screen without changing the v4.0 visual/product baseline.

## Root cause

The UI depended on remote Google Fonts / Material Symbols. When the icon font was unavailable, icon names such as `edit_note`, `upload_file`, `library_books`, and `search` were rendered as ordinary text. That text expanded cards and the bottom navigation, creating apparently broken blocks.

## Fix

- Replace the primary Material Symbols font dependency with built-in inline SVG icons.
- Remove Google Fonts/Material Symbols network dependencies from `index.html`.
- Keep system-font fallbacks for Russian text.
- Harden Today layout against overflow:
  - `minmax(0,1fr)` quick-action columns;
  - constrained titles and metadata;
  - one full-width recent card per mobile snap position;
  - task text uses `minmax(0,1fr)` and ellipsis;
  - no horizontal page overflow.
- Preserve v4.0 shell, typography scale, flat colors, navigation, and capture behavior.

## Verification

- Full regression suite in the verified local derivative: **99/99 passed**.
- Offline headless render with network disabled: no raw icon-name text remains in `.material-symbols-rounded` elements.
- Main Today blocks render within the 430px mobile viewport without expansion from missing fonts.

## Provenance

Runtime source is not pushed to GitHub because the safe verified-source import branch `import/noteai-v3.7-verified` is still absent. This branch therefore contains only the hotfix contract/documentation.
