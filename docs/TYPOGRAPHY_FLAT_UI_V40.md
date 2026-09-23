# NOTE2 v4.0 — Russian typography + flat mobile UI

## Reference direction

The visual benchmark is the clarity and density of current Yandex consumer apps such as Market and Pay: flat surfaces, strong typographic hierarchy, obvious icons, compact spacing and bottom navigation that remains readable on a phone.

NOTE2 must not copy Yandex branding. The reference is the interaction density and Russian-language readability.

## Font decision

Yandex uses proprietary YS Text / Yandex Sans family in its own products and communications. NOTE2 must not bundle or imitate proprietary font files.

Use a neutral open/system stack:

```css
font-family: Inter, "SF Pro Text", -apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, Arial, sans-serif;
```

Inter is the preferred web/PWA face when available. Native/system faces remain first-class fallbacks so Russian text stays legible offline and on Android/iOS/Windows.

## Russian mobile type scale

Russian UI strings are often wider than English and become noisy when captions are too small. Minimum production scale:

| Role | Size | Line height | Weight |
|---|---:|---:|---:|
| Display / page title | 25–28 px | 31–34 px | 700 |
| Section title | 19–20 px | 24–26 px | 700 |
| Editor title | 20–24 px | 27–30 px | 700 |
| Reading/editor body | 17 px | 27–28 px | 400 |
| Standard UI body | 16 px | 22–24 px | 400–500 |
| Controls/buttons | 14 px | 18–20 px | 600 |
| Secondary text | 13 px | 18 px | 400–500 |
| Bottom navigation label | 11–12 px | 14 px | 500–650 |
| Caption / metadata | 11–12 px | 15–16 px | 400–500 |

Do not use 8–10 px for persistent navigation or important Russian labels.

## Color rule

No gradients in product UI.

Primary surfaces:
- app background: `#F4F5F6`;
- surface: `#FFFFFF`;
- secondary surface: `#F0F1F2`;
- primary text: `#161616`;
- secondary text: `#70757A`;
- separators: `#E5E7EA`.

One primary accent may be used for selected/important actions. v4.0 uses warm yellow `#FFCC00` as a temporary NOTE2 accent while identity work continues.

Semantic icon tiles use one flat pastel fill each. No multicolor transitions, halos, blobs or decorative 3D geometry in normal navigation.

## Bottom navigation

Persistent destinations:
- Сегодня;
- Заметки;
- Источники;
- Поиск;
- Профиль.

Mobile specifications:
- full width;
- approximately 82 px total including safe area;
- white / near-white translucent material with subtle blur only;
- 26 px primary icons;
- 11–12 px Russian labels;
- active state: filled icon + 24×3 px accent indicator;
- no floating capsule around the whole nav;
- no individual colorful icon backgrounds inside the nav;
- minimum useful tap target ~56–58 px tall.

The global `+` capture action remains separate above the bar, 54 px, so five navigation items retain readable width.

## Home / Today hierarchy

Remove oversized hero text and decorative spatial scenes.

Mobile structure:
1. date — 12 px;
2. greeting — 25–28 px;
3. one-line explanation — 14 px;
4. search field — 48 px;
5. four quick actions with obvious semantic icons;
6. Today note;
7. recent work;
8. actionable tasks.

No vanity metrics and no demo content.

## Icons

Icons must communicate before animation.

Examples:
- note → `edit_note`;
- document → `upload_file` / `picture_as_pdf`;
- voice → `mic`;
- task → `checklist`;
- search → `search`;
- link → `link`;
- image → `photo_camera`;
- sources → `library_books`;
- profile → `person`.

Animation is limited to 1–2 px lift/press or a short state transition. Motion must never be required to understand the icon.

## Notebook readability

Editor body defaults to 17 px / ~1.62 line-height on mobile.

Russian prose should not use aggressive negative tracking. Heading tracking may use approximately `-0.01em` to `-0.02em`; body text stays at zero.

The command toolbar may scroll horizontally, but command labels remain at least 11 px and icons at least 21–22 px.

## Regression requirement

Visual work must preserve the existing 39 regression tests. Production Vite build remains a separate gate until dependencies are installed in a networked build environment.
