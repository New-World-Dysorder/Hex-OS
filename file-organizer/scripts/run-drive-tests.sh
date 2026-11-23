#!/usr/bin/env bash
# Drive / both-mode local tests against wrangler + mock Apps Script.
# Does NOT touch real Cloudflare or real Drive.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
MOCK_URL="${MOCK_URL:-http://127.0.0.1:18790}"
MOCK_SECRET="${MOCK_SECRET:-local-drive-shared-secret-not-for-production}"

if [[ ! -f .dev.vars ]]; then
  echo "FAIL: .dev.vars missing" >&2
  exit 1
fi
TEST_KEY="$(grep -E '^UPLOAD_KEY=' .dev.vars | head -1 | cut -d= -f2-)"
if [[ -z "$TEST_KEY" ]]; then
  echo "FAIL: UPLOAD_KEY not set in .dev.vars" >&2
  exit 1
fi

# Confirm Worker is in both (or drive) mode via /health
HEALTH=$(curl -sf "$BASE_URL/health" || true)
STORAGE=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('storage',''))" "$HEALTH" 2>/dev/null || echo "")
if [[ "$STORAGE" != "both" && "$STORAGE" != "drive" ]]; then
  echo "FAIL: Worker storage=$STORAGE (need both or drive). Start with STORAGE=both in .dev.vars and DRIVE_* pointing at mock." >&2
  echo "health=$HEALTH" >&2
  exit 1
fi

# Confirm mock is up
if ! curl -sf "$MOCK_URL/" >/dev/null; then
  echo "FAIL: mock not reachable at $MOCK_URL (start: MOCK_SECRET=... node scripts/mock-drive-script.mjs)" >&2
  exit 1
fi

node scripts/make-tiny-png.mjs >/dev/null
PNG="$ROOT/fixtures/tiny.png"
TEXT_FILE="$ROOT/fixtures/note.txt"
printf 'hello plain text' > "$TEXT_FILE"

PASS=0
FAIL=0
RESULTS=()
record() {
  local name="$1" ok="$2" detail="${3:-}"
  if [[ "$ok" == "pass" ]]; then
    PASS=$((PASS+1)); RESULTS+=("PASS  $name")
  else
    FAIL=$((FAIL+1)); RESULTS+=("FAIL  $name  $detail")
  fi
}

# 1. both/drive upload success
CODE=$(curl -s -o /tmp/nv-d-up.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${PNG};filename=drive-ok.png" \
  "$BASE_URL/upload")
BODY=$(cat /tmp/nv-d-up.json)
if [[ "$STORAGE" == "both" ]]; then
  OK=$(python3 - <<'PY'
import json
d=json.load(open("/tmp/nv-d-up.json"))
print("yes" if d.get("key") and isinstance(d.get("drive"),dict) and d["drive"].get("ok") is True else "no")
PY
)
  if [[ "$CODE" == "201" && "$OK" == "yes" ]]; then record "both_upload_ok" pass
  else record "both_upload_ok" fail "code=$CODE body=$BODY"; fi
else
  OK=$(python3 - <<'PY'
import json
d=json.load(open("/tmp/nv-d-up.json"))
print("yes" if d.get("drive",{}).get("ok") is True or d.get("storage")=="drive" and "id" in str(d) else "no")
PY
)
  DRIVE_OK=$(python3 -c "import json; d=json.load(open('/tmp/nv-d-up.json')); print('yes' if (d.get('drive') or {}).get('ok') or d.get('storage')=='drive' and d.get('key','').startswith('drive:') else 'no')")
  if [[ "$CODE" == "201" && "$DRIVE_OK" == "yes" ]]; then record "drive_upload_ok" pass
  else record "drive_upload_ok" fail "code=$CODE body=$BODY"; fi
fi

# 2. bad worker key -> 401
CODE=$(curl -s -o /tmp/nv-d-badkey.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer wrong-key" \
  -F "file=@${PNG};filename=x.png" \
  "$BASE_URL/upload")
if [[ "$CODE" == "401" ]]; then record "bad_key_401" pass; else record "bad_key_401" fail "code=$CODE"; fi

# 3. non-image -> 415
CODE=$(curl -s -o /tmp/nv-d-text.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${TEXT_FILE};filename=note.txt;type=text/plain" \
  "$BASE_URL/upload")
if [[ "$CODE" == "415" ]]; then record "non_image_415" pass; else record "non_image_415" fail "code=$CODE"; fi

# 4. oversize -> 413
OVERSIZE="$ROOT/fixtures/oversize.bin"
rm -f "$OVERSIZE"
python3 -c "open('$OVERSIZE','wb').write(b'\\0'*(25*1024*1024+1))"
CODE=$(curl -s -o /tmp/nv-d-big.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$OVERSIZE" \
  "$BASE_URL/upload?name=big.bin")
if [[ "$CODE" == "413" ]]; then record "oversize_413" pass; else record "oversize_413" fail "code=$CODE"; fi

# 5. Drive script failure → both still 201 with drive.ok=false; drive-only → 502
# Restart guidance: this suite expects a second mock on 8791 with MOCK_FAIL=1 when BOTH_FAIL_URL set.
# For the default both suite we flip by POSTing to a fail mock if FAIL_MOCK_URL is set.
FAIL_MOCK_URL="${FAIL_MOCK_URL:-}"
if [[ -n "$FAIL_MOCK_URL" && "$STORAGE" == "both" ]]; then
  # Temporarily the Worker must already point DRIVE_SCRIPT_URL at the fail mock.
  CODE=$(curl -s -o /tmp/nv-d-partial.json -w '%{http_code}' \
    -X POST -H "Authorization: Bearer ${TEST_KEY}" \
    -F "file=@${PNG};filename=partial.png" \
    "$BASE_URL/upload")
  PART=$(python3 - <<'PY'
import json
d=json.load(open("/tmp/nv-d-partial.json"))
drv=d.get("drive") or {}
print("yes" if d.get("key") and drv.get("ok") is False and "error" in drv else "no")
PY
)
  if [[ "$CODE" == "201" && "$PART" == "yes" ]]; then record "both_drive_fail_partial" pass
  else record "both_drive_fail_partial" fail "code=$CODE body=$(cat /tmp/nv-d-partial.json)"; fi
elif [[ "$STORAGE" == "both" ]]; then
  RESULTS+=("SKIP  both_drive_fail_partial  (run scripts/run-both-partial.sh against a MOCK_FAIL=1 mock)")
else
  RESULTS+=("SKIP  drive_fail_502  (point DRIVE_SCRIPT_URL at MOCK_FAIL=1 mock)")
fi

echo "==== drive/both test results (storage=$STORAGE) ===="
for line in "${RESULTS[@]}"; do echo "$line"; done
echo "----"
echo "passed=$PASS failed=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then exit 1; fi
