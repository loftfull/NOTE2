# NOTE2 UX Architecture — 2026

## Core principle

The primary UX is not organized by AI features or connector types. It is organized around **capture → think → read → connect → find → act**.

AI and source processing appear contextually inside these flows.

## Primary mobile navigation

Five persistent destinations only:

1. **Today**
2. **Notes**
3. **Sources**
4. **Search**
5. **You**

A single global `+` capture control opens a bottom sheet for note, task, file, link, photo/scan and voice.

### Why this replaces the current 10-item navigation

Current v3.7 exposes Dashboard, Library, Chat, Analysis, Studio, Media, YouTube, Search, Graph, Tasks and Settings as peers. That is implementation-oriented and forces the user to choose a subsystem before they know what they want.

The new navigation keeps capabilities but moves them into context:
- Chat becomes Ask inside a note/source/project/search context.
- Analysis becomes an action/view on selected material.
- Media/YouTube become source types, not destinations.
- Graph becomes a view of selected knowledge, not primary navigation.
- Tasks appear in Today/Notes/project context plus filtered live views.
- Settings lives under You.

## 1. Today

Today is the default opening surface and capture inbox, not a KPI dashboard.

### Top region
- date/day;
- compact workspace switcher;
- sync/local status only when actionable;
- search affordance.

### Capture rail
One-row, thumb-friendly quick actions:
- write;
- voice;
- scan;
- file;
- link.

### Daily note
The central surface is today's actual note. It can contain normal blocks, tasks, links and embedded sources.

### Continue
A compact horizontal strip of the 2–4 most relevant unfinished items:
- note being written;
- PDF/video being read;
- media processing job;
- source with unresolved highlights/tasks.

No fake “activity” or vanity metrics.

### Review
Optional lower section for:
- due tasks;
- recently captured inbox items needing organization;
- resurfaced highlights;
- failed processing needing user action.

## 2. Notes

A real writing environment.

### Notes home
Supports user-switchable views over the same notes:
- Recent;
- Daily;
- Projects;
- Favorites;
- custom live views.

### Editor
Mobile:
- full-width writing surface;
- title + compact metadata row;
- bottom contextual formatting/action bar;
- slash/command menu;
- selection toolbar;
- side information as bottom sheets.

Desktop/tablet:
- navigation pane;
- editor canvas;
- optional context pane for backlinks/outline/properties/Ask.

### Contextual intelligence
AI actions live on selection or command palette:
- explain;
- rewrite;
- summarize selection;
- extract tasks;
- connect to existing notes;
- verify selected claim.

They must never replace basic editor controls.

## 3. Sources

Sources is the unified reader and Source Vault.

### Source list
Default groups:
- Inbox;
- Reading / Watching / Listening;
- Finished;
- Highlights;
- Failed / Needs attention.

Filters cover type, project, status, date and tags. PDF/video/YouTube/image/audio are filters, not navigation tabs.

### Universal source detail
Every source detail shares one shell but the central reader changes by source kind.

Persistent source-level actions:
- highlight / annotate;
- add note;
- link to project/note;
- search within;
- Ask;
- analyze;
- share/export.

### PDF / document
- true page reader;
- outline/thumbnails on demand;
- highlights/annotations;
- OCR coverage indicator only where relevant;
- evidence deep-links open exact page/region.

### Video / YouTube
- media player;
- time-synced transcript;
- tap transcript to seek;
- highlight transcript range;
- saved highlight opens exact timestamp;
- chapters/timeline when available.

### Audio
- player/waveform;
- speaker-aware transcript where available;
- timestamped highlights/notes.

### Image / scan
- pan/zoom;
- OCR text side/bottom sheet;
- evidence region overlay;
- annotations.

### Web / EPUB
- clean reading mode;
- headings/chapter navigation;
- highlights and annotations;
- source URL/provenance.

## 4. Search

Search is a command surface, not merely a text box.

### Default state
- recent searches;
- saved/live views;
- quick scopes (all, notes, sources, tasks, people/projects);
- recent entities/topics.

### Search result
Each result shows:
- object/source type;
- title;
- meaningful excerpt;
- exact source location if applicable;
- why it matched when semantic retrieval is used.

Selecting a source-derived hit opens the exact page/timestamp/region.

### Ask workspace
Natural-language retrieval is a mode inside Search, not a separate top-level Chat application.

Answers are evidence-first and list the specific material used.

## 5. You

Contains:
- account/devices/sync;
- local storage and backup;
- privacy;
- AI/provider availability;
- appearance;
- import/export;
- Android/PWA diagnostics when needed.

Technical settings are intentionally separated from daily work.

## Object model exposed to the user

The interface should gradually converge on a small set of understandable objects:

- Note
- Source
- Task
- Project
- Person
- Topic
- Highlight

Internally more record types may exist, but they should not leak into navigation.

## Unified capture sheet

Invocation:
- floating/global `+`;
- Android share target;
- keyboard shortcut;
- system share/open where available.

First-level choices:
- Note
- Task
- Voice
- Scan / Photo
- File
- Link

After capture, NOTE2 detects the source subtype and starts extraction when appropriate. The user is not asked to choose “YouTube pipeline”, “OCR mode”, “media analyzer” or similar internal concepts.

## Result / intelligence model

There is no standalone “AI Result Dashboard”.

Generated understanding appears as a **lens** on a note/source/project.

Source lenses:
- Overview
- Highlights
- Transcript / Pages
- Insights
- Evidence
- Study

Project/note lenses may differ.

`Insights` can contain quick/full/simplified/expanded/verified outputs, but these are secondary views over the source, not the source itself.

## Evidence interaction

Evidence is a navigation primitive.

Tap evidence from:
- AI answer;
- generated insight;
- search result;
- highlight;
- verification result.

Expected behavior:
- PDF → exact page and highlighted region/text;
- video/audio → seek exact timestamp and highlight transcript segment;
- web/EPUB → exact paragraph/chapter;
- image → exact OCR/vision region.

The evidence sheet can be expanded without losing reading/writing context.

## Mobile interaction model

### Bottom navigation
Five items maximum. Labels always visible.

### Sheets over route explosion
Use bottom sheets for:
- capture;
- properties;
- backlinks;
- source outline;
- evidence;
- contextual Ask;
- processing details.

### One-handed usage
The lower third contains primary controls. Destructive/rare actions stay in overflow menus.

### Motion
Motion explains continuity:
- capture item morphs into the saved object;
- source card expands into reader;
- citation/evidence animates to its exact source location;
- processing state transitions without page reloads.

No decorative constant motion.

## Desktop/tablet adaptation

Desktop does not become a different product.

Use extra width for:
- two/three pane navigation;
- persistent outline/backlinks/evidence;
- drag-and-drop between notes/sources/projects;
- multi-select and batch organization;
- command palette and keyboard navigation.

## What happens to existing v3.7 screens

| Current screen | New destination |
|---|---|
| Dashboard | Today |
| Library | Notes + Sources, depending object type |
| Chat | Search → Ask / contextual Ask |
| Analysis | Source/Note → Insights |
| Studio | contextual creation tools; no top-level nav |
| Media | Sources filtered by audio/video |
| YouTube | Sources filtered by YouTube |
| Search | Search |
| Graph | contextual knowledge view |
| Tasks | Today + live task views |
| Settings | You |

This is a consolidation, not feature removal.

## First implementation slice after verified source import

1. Replace the 10-item primary navigation with the five-destination shell.
2. Build Today around a functional daily note + capture sheet using existing local persistence.
3. Split current Library into Notes and Sources views without migrating data yet.
4. Move Chat/Analysis/Media/YouTube/Graph/Tasks entry points into contextual actions/views while preserving current code behind them.
5. Add route/state adapters so no existing capability is deleted during the UX migration.
6. Regression gate: existing 39 tests remain green; add navigation/state tests before removing legacy routes.

The purpose is to make the existing capability set understandable before adding more capability.