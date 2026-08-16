#!/usr/bin/env bash
set -euo pipefail

SOURCE="https://github.com/loftfull/BlockNoteAI.git"
TARGET="https://github.com/loftfull/NOTE2.git"
WORKDIR="${TMPDIR:-/tmp}/note2-mirror-$$"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

printf '\nNOTE2 full Git migration\n'
printf 'Source: %s\nTarget: %s\n\n' "$SOURCE" "$TARGET"

command -v git >/dev/null 2>&1 || { echo 'Git is required.' >&2; exit 1; }

# Authentication is delegated to the user's existing GitHub credential helper / gh login.
git clone --mirror "$SOURCE" "$WORKDIR/BlockNoteAI.git"
cd "$WORKDIR/BlockNoteAI.git"

# NOTE2 has a bootstrap commit created before migration. --mirror intentionally
# replaces all refs with the source repository refs so branches/tags/history are exact.
git remote set-url --push origin "$TARGET"
git push --mirror origin

printf '\nMirror complete. All source branches, tags and commit history are now in NOTE2.\n'
printf 'Recommended next step: set the desired default branch in GitHub to chatgpt/mobile-pwa-shell (temporary) or main after consolidation.\n'
