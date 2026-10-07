# NOTE2 Visual System — iOS Glass 2026

## Goal

Create a premium, calm, spatial interface that feels at home on iPhone without imitating Apple apps literally. NOTE2 should borrow the *behavioral logic* of modern iOS materials — hierarchy, translucency, floating controls, depth, spring motion, adaptive contrast — while keeping its own identity through colored volumetric knowledge objects and editorial content surfaces.

## Material hierarchy

### 1. Content layer — mostly opaque

Notes, pages, transcripts, PDFs, lists and reading surfaces stay readable and materially stable.

Use:
- warm/cool near-white surfaces;
- subtle tonal gradients;
- 1px soft separators;
- almost no glass inside long-form content;
- restrained radius (14–22 px depending on scale).

Rationale: glass is a functional layer, not a wallpaper for every card.

### 2. Functional glass layer

Use Liquid-Glass-like treatment for:
- top navigation;
- bottom navigation;
- capture sheet;
- context toolbar;
- floating search/command control;
- transient evidence/metadata sheets;
- media controls.

CSS/Web approximation:
- backdrop-filter: blur(24–40px) saturate(1.15–1.35);
- translucent white/black adaptive fill;
- inner highlight;
- hairline border with local contrast;
- soft ambient shadow;
- slight specular gradient;
- optional refraction-like pseudo-element on rich backgrounds.

Do not put every content block in glass.

## NOTE2 volumetric knowledge objects

These are the visual signature of NOTE2.

### Purpose

A knowledge object gives a source/note/project a recognizable spatial identity without relying on file-type icons alone.

### Object families

- Note — soft folded ribbon / rounded translucent slab.
- PDF / document — layered prism with page-like strata.
- Video — glossy lens / rounded capsule with internal light band.
- Audio — torus / waveform ring.
- Web — translucent orb with layered plane.
- Project — clustered multi-object composition.
- Person — pearl-like sphere with subtle orbit.
- Topic — soft gradient blob / metaball.

### Color logic

Color is contextual, not random.

A source receives a stable palette derived from:
1. user-selected project color when available;
2. source artwork/thumbnail dominant colors when safe;
3. deterministic hash fallback from source identity.

The palette persists across Today, Search, Sources and related-note references so the object becomes recognition memory.

### Rendering requirements

Web prototype:
- layered CSS gradients;
- pseudo-element highlights;
- transform-style: preserve-3d;
- perspective and gentle parallax;
- radial shadows;
- conic/radial gradients for volume;
- no heavy WebGL dependency for ordinary lists.

Future production enhancement:
- optional Canvas/WebGL/Spline/Rive/Lottie only for hero/selected-object states;
- static/lightweight fallback for reduced motion, battery saver and large lists.

## Motion system

### Principle

Motion explains continuity and touch response.

### Timing

- tap feedback: 120–180 ms;
- sheet/nav transition: 260–420 ms;
- object focus/expand: 420–650 ms;
- ambient object drift: 8–18 s and extremely subtle.

### Spring character

Use spring-like easing for large interactive transitions:
- moderate damping;
- no cartoon overshoot;
- scale changes normally stay within 0.97–1.03 except object expansion.

### Continuity examples

- Tap a Source object → object enlarges and becomes the reader header artwork.
- Tap evidence → evidence capsule expands while underlying reader scrolls/seeks to location.
- Open Capture → floating `+` becomes the capture sheet anchor.
- Save new note → temporary colored object collapses into Today/Notes list.

## Mobile navigation

Bottom navigation becomes a floating glass dock.

Destinations:
- Today
- Notes
- Sources
- Search
- You

Properties:
- detached from screen edges;
- safe-area aware;
- selected item gets a soft luminous lens, not a filled rectangular tab;
- labels remain visible;
- central capture action may float slightly above dock but must not create a sixth destination.

Desktop uses the same material language on a floating/attached sidebar with reduced translucency for legibility.

## Today visual composition

Today should feel like opening a private instrument, not a dashboard.

Layers:
1. subtle large color atmosphere from the most relevant current objects;
2. compact date/greeting;
3. Daily Note content surface;
4. floating glass capture control;
5. Continue row with 3D knowledge objects;
6. small Review/Inbox state;
7. floating glass bottom dock.

No KPI cards.

## Notes editor

The editor is deliberately calmer than the surrounding shell.

- almost opaque paper/content layer;
- generous but not empty margins;
- typography carries the premium feel;
- selected content gets contextual glass toolbar;
- backlinks/properties/Ask open as floating glass sheets;
- linked Sources show small colored volumetric object thumbnails.

## Sources / Reader

The selected source gets the richest 3D object treatment.

Source detail header:
- volumetric object / artwork;
- title + provenance;
- reading/processing state;
- floating glass action group.

Reader content stays standard-material/opaque for legibility.

Evidence and transcript controls can use glass because they float above the content.

## Search

Search opens as a near-full-screen glass command layer over the current workspace context.

Results themselves remain stable content rows/cards.

Semantic results must disclose why/where they matched; visual polish never replaces provenance.

## Accessibility

Mandatory:
- `prefers-reduced-motion` removes parallax and ambient drift;
- `prefers-contrast: more` increases glass opacity and borders;
- fallback when backdrop-filter unsupported;
- text contrast independent of the background object color;
- never encode source type or status by color alone;
- touch targets >= 44 CSS px for primary actions.

## Performance constraints

- no per-row WebGL canvases;
- cap simultaneous animated 3D objects in viewport;
- pause ambient animation when document hidden;
- use CSS transforms/opacity for motion;
- avoid animating blur radius continuously;
- lazy-load heavy visual runtimes;
- keep Today interactive before optional visual assets load.

## Anti-patterns

Reject:
- 20 translucent cards stacked together;
- glass over long paragraphs;
- rainbow gradients without semantic context;
- rotating objects everywhere;
- glass borders so bright they look like neon;
- giant 3D mascot replacing information;
- tiny low-contrast gray text over colorful surfaces;
- copying iOS Settings/Music/Photos screen layouts literally.

## Acceptance test

A visual build passes only if:
1. the content remains primary;
2. controls/navigation clearly occupy a separate glass layer;
3. the interface is recognizable as NOTE2 without Apple branding;
4. 3D objects create continuity across capture, source, search and project views;
5. mobile 390×844 remains readable and one-hand usable;
6. reduced-motion/high-contrast variants remain coherent;
7. the page still looks premium when all 3D animations are disabled.
