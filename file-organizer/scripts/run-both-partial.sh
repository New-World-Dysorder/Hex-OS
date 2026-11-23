#!/usr/bin/env bash
# Starts a failing mock, expects Worker DRIVE_SCRIPT_URL already pointing at it,
# uploads once, asserts 201 + drive.ok=false.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
TEST_KEY="$(grep -E '^UPLOAD_KEY=' "$ROOT/.dev.vars" | head -1 | cut -d= -f2-)"
PNG="$ROOT/fixtures/tiny.png"
node "$ROOT/scripts/make-tiny-png.mjs" >/dev/null

CODE=$(curl -s -o /tmp/nv-partial.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${PNG};filename=partial-fail.png" \
  "$BASE_URL/upload")
python3 - <<'PY'
import json,sys
d=json.load(open("/tmp/nv-partial.json"))
drv=d.get("drive") or {}
ok = (int(open("/tmp/nv-partial.code","w").write("") or True) and True)
PY
echo "$CODE" > /tmp/nv-partial.code
PART=$(python3 -c "import json; d=json.load(open('/tmp/nv-partial.json')); drv=d.get('drive') or {}; print('yes' if d.get('key') and drv.get('ok') is False and drv.get('error') else 'no')")
echo "code=$CODE partial=$PART body=$(cat /tmp/nv-partial.json)"
[[ "$CODE" == "201" && "$PART" == "yes" ]]
