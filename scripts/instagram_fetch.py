#!/usr/bin/env python3
import json, os, sys


def die(message, code=2):
    print(json.dumps({"error": message}, ensure_ascii=False))
    sys.exit(code)

try:
    import instaloader
except Exception as exc:
    die(f"Instaloader unavailable: {exc}")

if len(sys.argv) != 2:
    die("Usage: instagram_fetch.py SHORTCODE")
shortcode = sys.argv[1]
if not shortcode or len(shortcode) > 64 or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-" for c in shortcode):
    die("Invalid shortcode")

loader = instaloader.Instaloader(
    download_pictures=False,
    download_videos=False,
    download_video_thumbnails=False,
    download_geotags=False,
    download_comments=False,
    save_metadata=False,
    compress_json=False,
    quiet=True,
)

session_file = os.getenv("INSTAGRAM_SESSION_FILE", "").strip()
username = os.getenv("INSTAGRAM_USERNAME", "").strip()
if session_file and username:
    try:
        loader.load_session_from_file(username, session_file)
    except Exception as exc:
        die(f"Unable to load Instagram session: {exc}")

try:
    post = instaloader.Post.from_shortcode(loader.context, shortcode)
except Exception as exc:
    die(f"Instagram post unavailable: {exc}", 3)

media = []
try:
    if post.typename == "GraphSidecar":
        for index, node in enumerate(post.get_sidecar_nodes()):
            is_video = bool(node.is_video)
            media.append({
                "index": index,
                "kind": "video" if is_video else "image",
                "url": node.video_url if is_video else node.display_url,
                "width": int(getattr(node, "width", 0) or 0),
                "height": int(getattr(node, "height", 0) or 0),
                "alt": str(getattr(node, "accessibility_caption", "") or ""),
            })
    else:
        is_video = bool(post.is_video)
        media.append({
            "index": 0,
            "kind": "video" if is_video else "image",
            "url": post.video_url if is_video else post.url,
            "width": int(getattr(post, "width", 0) or 0),
            "height": int(getattr(post, "height", 0) or 0),
            "alt": str(getattr(post, "accessibility_caption", "") or ""),
        })
except Exception as exc:
    die(f"Unable to enumerate Instagram media: {exc}", 4)

owner = getattr(post, "owner_profile", None)
result = {
    "shortcode": shortcode,
    "url": f"https://www.instagram.com/p/{shortcode}/",
    "type": str(getattr(post, "typename", "")),
    "caption": str(getattr(post, "caption", "") or ""),
    "owner": {
        "username": str(getattr(post, "owner_username", "") or ""),
        "fullName": str(getattr(owner, "full_name", "") or "") if owner else "",
    },
    "takenAt": getattr(post, "date_utc", None).isoformat() + "Z" if getattr(post, "date_utc", None) else None,
    "media": media,
}
print(json.dumps(result, ensure_ascii=False))
