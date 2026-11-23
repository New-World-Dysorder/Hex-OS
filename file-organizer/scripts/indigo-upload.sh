#!/usr/bin/env bash
# Upload a still to nv-file-organizer.
# Usage:
#   NV_UPLOAD_KEY='...' ./scripts/indigo-upload.sh ./path/to/still.png
#   NV_UPLOAD_KEY='...' BASE_URL=https://nv-file-organizer.bookings-8be.workers.dev ./scripts/indigo-upload.sh still.png
#
# Never echo the key. Never pass the key as a CLI flag that lands in shell history
# if you can avoid it — prefer the env var.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: NV_UPLOAD_KEY=... $0 <image-file> [name]" >&2
  exit 2
fi

FILE="$1"
NAME="${2:-$(basename "$FILE")}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"

if [[ -z "${NV_UPLOAD_KEY:-}" ]]; then
  echo "Set NV_UPLOAD_KEY in the environment (do not paste it into chat)." >&2
  exit 2
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 2
fi

# Key goes only in the Authorization header; curl -s silences progress.
# Do not add -v (would not print the key body, but keep it quiet).
curl -sS -X POST \
  -H "Authorization: Bearer ${NV_UPLOAD_KEY}" \
  -F "file=@${FILE};filename=${NAME}" \
  "${BASE_URL}/upload"
echo
