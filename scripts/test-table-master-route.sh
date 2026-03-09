#!/usr/bin/env bash
# Run after starting the backend (npm run dev). Verifies table-master route is registered.
set -e
BASE="${1:-http://localhost:5001}"
echo "Testing $BASE"
echo "1. Health (should include routesRevision: table-master-2024 if backend was restarted):"
curl -s "$BASE/api/v1/health" | head -c 200
echo ""
echo ""
echo "2. GET /api/v1/admin/master/table-master (expect 401 without auth, not 404):"
CODE=$(curl -s -o /tmp/tm-resp.json -w "%{http_code}" "$BASE/api/v1/admin/master/table-master")
echo "   HTTP $CODE"
if [ "$CODE" = "404" ]; then
  echo "   FAIL: Still 404. Restart the backend (Ctrl+C then npm run dev) and run this again."
  exit 1
fi
if [ "$CODE" = "401" ]; then
  echo "   OK: Route exists; 401 expected without token."
fi
echo "   Response: $(cat /tmp/tm-resp.json)"
