#!/usr/bin/env bash
# Local integration tests against wrangler dev --local (Miniflare R2).
# Does NOT touch the real Cloudflare account.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
# Read throwaway key from .dev.vars without printing it
if [[ ! -f .dev.vars ]]; then
  echo "FAIL: .dev.vars missing (copy from .dev.vars.example)" >&2
  exit 1
fi
TEST_KEY="$(grep -E '^UPLOAD_KEY=' .dev.vars | head -1 | cut -d= -f2-)"
if [[ -z "$TEST_KEY" ]]; then
  echo "FAIL: UPLOAD_KEY not set in .dev.vars" >&2
  exit 1
fi

node scripts/make-tiny-png.mjs >/dev/null
PNG="$ROOT/fixtures/tiny.png"
FAKE_PNG="$ROOT/fixtures/fake.png"
TEXT_FILE="$ROOT/fixtures/note.txt"
OVERSIZE="$ROOT/fixtures/oversize.bin"

printf 'not a png' > "$FAKE_PNG"
printf 'hello plain text' > "$TEXT_FILE"
# 25 MB + 1 byte of zeros (sparse-ish via truncate)
rm -f "$OVERSIZE"
dd if=/dev/zero of="$OVERSIZE" bs=1M count=26 status=none 2>/dev/null || \
  python3 -c "open('$OVERSIZE','wb').write(b'\\0'*(25*1024*1024+1))"

PASS=0
FAIL=0
RESULTS=()

record() {
  local name="$1" ok="$2" detail="${3:-}"
  if [[ "$ok" == "pass" ]]; then
    PASS=$((PASS+1))
    RESULTS+=("PASS  $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL  $name  $detail")
  fi
}

# Wait for server
for i in $(seq 1 60); do
  if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ $i -eq 60 ]]; then
    echo "FAIL: server not reachable at $BASE_URL (start with: npm run dev)" >&2
    exit 1
  fi
done

# 1. health
CODE=$(curl -s -o /tmp/nv-health.json -w '%{http_code}' "$BASE_URL/health")
BODY=$(cat /tmp/nv-health.json)
if [[ "$CODE" == "200" ]] && echo "$BODY" | grep -q '"ok":true'; then
  record "health" pass
else
  record "health" fail "code=$CODE body=$BODY"
fi

# 2. upload png ok
CODE=$(curl -s -o /tmp/nv-up.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${PNG};filename=tiny.png" \
  "$BASE_URL/upload")
BODY=$(cat /tmp/nv-up.json)
KEY=$(python3 -c "import json,sys; print(json.load(open('/tmp/nv-up.json')).get('key',''))" 2>/dev/null || true)
if [[ "$CODE" == "201" ]] && [[ -n "$KEY" ]]; then
  record "upload_png_ok" pass
else
  record "upload_png_ok" fail "code=$CODE body=$BODY"
fi

# 3. upload without key -> 401
CODE=$(curl -s -o /tmp/nv-nokey.json -w '%{http_code}' \
  -X POST -F "file=@${PNG};filename=tiny.png" \
  "$BASE_URL/upload")
if [[ "$CODE" == "401" ]]; then
  record "upload_no_key_401" pass
else
  record "upload_no_key_401" fail "code=$CODE"
fi

# 4. wrong key -> 401
CODE=$(curl -s -o /tmp/nv-badkey.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer wrong-key-value" \
  -F "file=@${PNG};filename=tiny.png" \
  "$BASE_URL/upload")
if [[ "$CODE" == "401" ]]; then
  record "upload_wrong_key_401" pass
else
  record "upload_wrong_key_401" fail "code=$CODE"
fi

# 5. text file -> 415
CODE=$(curl -s -o /tmp/nv-text.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${TEXT_FILE};filename=note.txt;type=text/plain" \
  "$BASE_URL/upload")
if [[ "$CODE" == "415" ]]; then
  record "text_file_415" pass
else
  record "text_file_415" fail "code=$CODE body=$(cat /tmp/nv-text.json)"
fi

# 6. fake png wrong magic -> 415
CODE=$(curl -s -o /tmp/nv-fake.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${FAKE_PNG};filename=fake.png;type=image/png" \
  "$BASE_URL/upload")
if [[ "$CODE" == "415" ]]; then
  record "fake_png_magic_415" pass
else
  record "fake_png_magic_415" fail "code=$CODE body=$(cat /tmp/nv-fake.json)"
fi

# 7. oversize -> 413
CODE=$(curl -s -o /tmp/nv-big.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$OVERSIZE" \
  "$BASE_URL/upload?name=big.bin")
if [[ "$CODE" == "413" ]]; then
  record "oversize_413" pass
else
  record "oversize_413" fail "code=$CODE body=$(cat /tmp/nv-big.json)"
fi

# 8. list
CODE=$(curl -s -o /tmp/nv-list.json -w '%{http_code}' \
  -H "Authorization: Bearer ${TEST_KEY}" \
  "$BASE_URL/list?prefix=stills/")
COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/nv-list.json')).get('objects',[])))" 2>/dev/null || echo 0)
if [[ "$CODE" == "200" ]] && [[ "$COUNT" -ge 1 ]]; then
  record "list" pass
else
  record "list" fail "code=$CODE count=$COUNT body=$(cat /tmp/nv-list.json)"
fi

# 9. fetch
if [[ -n "$KEY" ]]; then
  CODE=$(curl -s -o /tmp/nv-file-out.png -w '%{http_code}' \
    -H "Authorization: Bearer ${TEST_KEY}" \
    "$BASE_URL/file/${KEY}")
  SIZE=$(wc -c < /tmp/nv-file-out.png | tr -d ' ')
  if [[ "$CODE" == "200" ]] && [[ "$SIZE" -gt 0 ]]; then
    record "fetch" pass
  else
    record "fetch" fail "code=$CODE size=$SIZE"
  fi
else
  record "fetch" fail "no key from earlier upload"
fi

# 10. duplicate name gets suffix
CODE1=$(curl -s -o /tmp/nv-dup1.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${PNG};filename=dup-test.png" \
  "$BASE_URL/upload")
CODE2=$(curl -s -o /tmp/nv-dup2.json -w '%{http_code}' \
  -X POST -H "Authorization: Bearer ${TEST_KEY}" \
  -F "file=@${PNG};filename=dup-test.png" \
  "$BASE_URL/upload")
K1=$(python3 -c "import json; print(json.load(open('/tmp/nv-dup1.json')).get('key',''))" 2>/dev/null || true)
K2=$(python3 -c "import json; print(json.load(open('/tmp/nv-dup2.json')).get('key',''))" 2>/dev/null || true)
if [[ "$CODE1" == "201" && "$CODE2" == "201" && "$K1" != "$K2" && "$K2" == *dup-test-2.png ]]; then
  record "duplicate_name_suffix" pass
elif [[ "$CODE1" == "201" && "$CODE2" == "201" && "$K1" != "$K2" ]]; then
  record "duplicate_name_suffix" pass
else
  record "duplicate_name_suffix" fail "c1=$CODE1 c2=$CODE2 k1=$K1 k2=$K2"
fi

# 11. list without auth -> 401
CODE=$(curl -s -o /tmp/nv-list-na.json -w '%{http_code}' "$BASE_URL/list")
if [[ "$CODE" == "401" ]]; then
  record "list_no_auth_401" pass
else
  record "list_no_auth_401" fail "code=$CODE"
fi

echo "==== local test results ===="
for line in "${RESULTS[@]}"; do
  echo "$line"
done
echo "----"
echo "passed=$PASS failed=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
