#!/bin/bash
BASE="http://localhost:3000"
IFS='|' read -r AT ST ADM_SID STAFF_SID < /tmp/tokens.txt
STAFF_SID="${STAFF_SID%$'\n'}"

PASS=0; FAIL=0
check() {
  local label="$1"; local expected="$2"; local got="$3"
  if echo "$got" | grep -q "$expected" 2>/dev/null; then
    echo "  ✅ $label"; PASS=$((PASS+1))
  else
    echo "  ❌ $label  →  $(echo "$got" | head -c 120)"; FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== [1] GET /api/unavailabilities (admin, liste) ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities")
check "retourne tableau JSON" '\[' "$R"

echo ""
echo "=== [2] POST journey entière dans 1 jour (hors délai 3j → pending) ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_SID,\"date_start\":\"2026-03-28\",\"date_end\":\"2026-03-28\",\"all_day\":1,\"recurrence\":\"none\",\"note\":\"Test hors délai\"}" \
  "$BASE/api/unavailabilities")
echo "  $R"
check "status pending" 'pending' "$R"
ID_PENDING=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','0'))" 2>/dev/null)

echo ""
echo "=== [3] POST dans 10 jours (dans délais → approved) ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_SID,\"date_start\":\"2026-04-06\",\"date_end\":\"2026-04-07\",\"all_day\":1,\"recurrence\":\"none\",\"note\":\"Congé famille\"}" \
  "$BASE/api/unavailabilities")
echo "  $R"
check "status approved" 'approved' "$R"
ID_APPROVED=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','0'))" 2>/dev/null)

echo ""
echo "=== [4] POST indispo partielle (heures) ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_SID,\"date_start\":\"2026-04-10\",\"date_end\":\"2026-04-10\",\"all_day\":0,\"hour_start\":9,\"hour_end\":12,\"recurrence\":\"none\"}" \
  "$BASE/api/unavailabilities")
echo "  $R"
check "id présent" '"id"' "$R"
ID_PARTIAL=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','0'))" 2>/dev/null)

echo ""
echo "=== [5] POST récurrente hebdomadaire ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_SID,\"date_start\":\"2026-04-14\",\"date_end\":\"2026-04-14\",\"all_day\":1,\"recurrence\":\"weekly\",\"recurrence_end\":\"2026-06-30\"}" \
  "$BASE/api/unavailabilities")
echo "  $R"
check "recurrence weekly créée" '"id"' "$R"

echo ""
echo "=== [6] GET liste filtrée staff_id ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?staff_id=$STAFF_SID")
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "  → $COUNT entrées pour staff_id=$STAFF_SID (attendu ≥4)"
[[ "$COUNT" -ge 4 ]] && { echo "  ✅ count OK"; PASS=$((PASS+1)); } || { echo "  ❌ count trop bas: $COUNT"; FAIL=$((FAIL+1)); }

echo ""
echo "=== [7] GET from/to avec expansion récurrences ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?from=2026-04-13&to=2026-04-20")
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "  → $COUNT résultats (récurrente étendue attendue)"
check "tableau non vide" '"id"' "$R"

echo ""
echo "=== [8] PUT /:id/review accepter (id=$ID_PENDING) ==="
R=$(curl -s -X PUT -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"status":"approved","review_note":"Accordé"}' \
  "$BASE/api/unavailabilities/$ID_PENDING/review")
echo "  $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== [9] PUT /:id/review refuser (id=$ID_APPROVED) ==="
R=$(curl -s -X PUT -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"status":"refused","review_note":"Date déjà prise"}' \
  "$BASE/api/unavailabilities/$ID_APPROVED/review")
echo "  $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== [10] Sécurité: staff ne peut pas créer pour un autre staff_id ==="
R=$(curl -s -w "|%{http_code}" -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d '{"staff_id":1,"date_start":"2026-04-20","date_end":"2026-04-20","all_day":1,"recurrence":"none"}' \
  "$BASE/api/unavailabilities")
echo "  $R"
check "erreur 403" '403' "$R"

echo ""
echo "=== [11] DELETE salarié supprime la sienne (id=$ID_PARTIAL) ==="
R=$(curl -s -X DELETE -H "Authorization: Bearer $ST" "$BASE/api/unavailabilities/$ID_PARTIAL")
echo "  $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== [12] GET ?status=pending ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?status=pending")
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "  → $COUNT indispos en attente"
check "tableau" '\[' "$R"

echo ""
echo "=== [13] Settings créés en DB ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/settings")
check "unavailability_approval_required" 'unavailability_approval_required' "$R"
check "unavailability_min_notice_days" 'unavailability_min_notice_days' "$R"

echo ""
echo "=============================="
echo "  RÉSULTAT : $PASS ✅ passé(s)  $FAIL ❌ échoué(s)"
echo "=============================="

# Générer les tokens
eval $(node -e "
const {db_} = require('./spirit-v2/db/database');
const jwt = require('./spirit-v2/node_modules/jsonwebtoken');
const secret = 'spirit_jwt_secret_2024';
const admin = db_.all('SELECT id,email,role,staff_id FROM users').find(u => u.staff_id && ['admin','manager','superadmin'].includes(u.role));
const staff = db_.all('SELECT id,email,role,staff_id FROM users').find(u => u.staff_id && u.role === 'staff');
const AT = jwt.sign({id: admin.id, role: admin.role, staff_id: admin.staff_id}, secret, {expiresIn:'1h'});
const ST = jwt.sign({id: staff.id, role: staff.role, staff_id: staff.staff_id}, secret, {expiresIn:'1h'});
console.log('AT=' + AT);
console.log('ST=' + ST);
console.log('ADMIN_STAFF_ID=' + admin.staff_id);
console.log('STAFF_STAFF_ID=' + staff.staff_id);
")

PASS=0; FAIL=0
check() {
  local label="$1"; local expected="$2"; local got="$3"
  if echo "$got" | grep -q "$expected"; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label → got: $got"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== TEST 1 : GET /api/unavailabilities (admin, liste vide) ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities")
check "retourne tableau JSON" '\[' "$R"

echo ""
echo "=== TEST 2 : POST indispo journée entière dans 1 jour (hors délai → pending) ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_STAFF_ID,\"date_start\":\"2026-03-28\",\"date_end\":\"2026-03-28\",\"all_day\":1,\"recurrence\":\"none\",\"note\":\"Test hors délai\"}" \
  "$BASE/api/unavailabilities")
echo "  Réponse: $R"
check "status pending" '"pending"' "$R"
ID_PENDING=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")

echo ""
echo "=== TEST 3 : POST indispo dans 10 jours (dans les délais → approved) ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_STAFF_ID,\"date_start\":\"2026-04-06\",\"date_end\":\"2026-04-07\",\"all_day\":1,\"recurrence\":\"none\",\"note\":\"Test dans délai\"}" \
  "$BASE/api/unavailabilities")
echo "  Réponse: $R"
check "status approved" '"approved"' "$R"
ID_APPROVED=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")

echo ""
echo "=== TEST 4 : POST indispo horaire partielle ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_STAFF_ID,\"date_start\":\"2026-04-10\",\"date_end\":\"2026-04-10\",\"all_day\":0,\"hour_start\":9,\"hour_end\":12,\"recurrence\":\"none\"}" \
  "$BASE/api/unavailabilities")
echo "  Réponse: $R"
check "id présent" '"id"' "$R"
ID_PARTIAL=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")

echo ""
echo "=== TEST 5 : POST indispo récurrente hebdomadaire ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":$STAFF_STAFF_ID,\"date_start\":\"2026-04-14\",\"date_end\":\"2026-04-14\",\"all_day\":1,\"recurrence\":\"weekly\",\"recurrence_end\":\"2026-06-30\"}" \
  "$BASE/api/unavailabilities")
echo "  Réponse: $R"
check "id présent" '"id"' "$R"
ID_RECUR=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))")

echo ""
echo "=== TEST 6 : GET avec filtre staff_id ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?staff_id=$STAFF_STAFF_ID")
COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "  → $COUNT entrées pour staff_id=$STAFF_STAFF_ID"
check "au moins 4 entrées" '[4-9]' "$COUNT"

echo ""
echo "=== TEST 7 : GET avec filtres from/to (expansion récurrences) ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?from=2026-04-13&to=2026-04-20")
echo "  Réponse brute: $(echo $R | head -c 200)"
check "tableau" '\[' "$R"

echo ""
echo "=== TEST 8 : PUT /:id/review — accepter l'indispo pending ==="
R=$(curl -s -X PUT -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"status":"approved","review_note":"OK accordé"}' \
  "$BASE/api/unavailabilities/$ID_PENDING/review")
echo "  Réponse: $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== TEST 9 : PUT /:id/review — refuser une indispo ==="
R=$(curl -s -X PUT -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"status":"refused","review_note":"Date déjà occupée"}' \
  "$BASE/api/unavailabilities/$ID_APPROVED/review")
echo "  Réponse: $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== TEST 10 : Vérif sécurité — staff ne peut pas créer pour un autre staff ==="
R=$(curl -s -X POST -H "Authorization: Bearer $ST" -H "Content-Type: application/json" \
  -d "{\"staff_id\":1,\"date_start\":\"2026-04-20\",\"date_end\":\"2026-04-20\",\"all_day\":1,\"recurrence\":\"none\"}" \
  "$BASE/api/unavailabilities")
echo "  Réponse: $R"
check "erreur 403" '"error"' "$R"

echo ""
echo "=== TEST 11 : DELETE par le salarié concerné ==="
R=$(curl -s -X DELETE -H "Authorization: Bearer $ST" "$BASE/api/unavailabilities/$ID_PARTIAL")
echo "  Réponse: $R"
check "ok:true" '"ok"' "$R"

echo ""
echo "=== TEST 12 : GET ?status=pending (admin) ==="
R=$(curl -s -H "Authorization: Bearer $AT" "$BASE/api/unavailabilities?status=pending")
echo "  → $(echo $R | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))') en attente"
check "tableau" '\[' "$R"

echo ""
echo "=============================="
echo "  RÉSULTAT : $PASS ✅ passé(s)  $FAIL ❌ échoué(s)"
echo "=============================="
