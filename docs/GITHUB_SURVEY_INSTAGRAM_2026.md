# GitHub survey — Instagram save library

Reviewed 78 named repositories before implementation across acquisition, share target, gallery/zoom, OCR, and playback.

Shortlist assimilated:
- `Cap-go/capacitor-share-target` — Capacitor 8 Share Target dependency; only receives shared payload.
- `instaloader/instaloader` — server acquisition/metadata provider behind isolated bridge.
- `MinJieLiu/react-photo-view`, `xiaolin/react-image-gallery`, `davidjerleke/embla-carousel` — interaction patterns assimilated; no new UI framework in v1.
- OCR repositories — not adopted because NOTE2 already has one Vision/OCR subsystem.
- `google/ExoPlayer` / Android Media3 projects — reference for later native playback; v1 reuses existing HTML/Capacitor media path.

Rejected categories: private-account sniffers, bulk profile/follower scrapers, repost bots, Xposed hooks, Telegram bots, and standalone Instagram database apps.

Canonical full survey is also tracked in the NOTE2 GitHub branch `chatgpt/product-recovery-2026`.
