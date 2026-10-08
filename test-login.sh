#!/usr/bin/env bash
# Testa login end-to-end no Vercel
set -u
BASE="${1:-https://delivery-food-red.vercel.app}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

echo "=== 1. Pagina de login ==="
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 -L "$BASE/login")
echo "GET /login -> $code"

echo ""
echo "=== 2. Pega CSRF token ==="
csrf_json=$(curl -s --max-time 40 -c "$JAR" "$BASE/api/auth/csrf")
echo "resposta: $csrf_json"
csrf=$(echo "$csrf_json" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
if [ -z "$csrf" ]; then echo "FALHOU: sem csrfToken"; exit 1; fi
echo "csrfToken: ${csrf:0:25}..."

echo ""
echo "=== 3. POST login (admin/admin123) ==="
code=$(curl -s -o /tmp/login_resp.txt -w '%{http_code}' --max-time 40 -b "$JAR" -c "$JAR" \
  -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "identifier=admin" \
  --data-urlencode "password=admin123" \
  --data-urlencode "callbackUrl=$BASE/admin/dashboard")
echo "POST callback -> $code"
echo "corpo: $(head -c 300 /tmp/login_resp.txt)"

echo ""
echo "=== 4. Cookies salvos ==="
grep -i 'authjs\|next-auth' "$JAR" | awk '{print "  " $6}' || echo "  (nenhum cookie de sessao)"

echo ""
echo "=== 5. Acessa /admin/dashboard autenticado ==="
out=$(curl -s -o /tmp/dash.txt -w '%{http_code}|%{url_effective}' --max-time 40 -b "$JAR" -c "$JAR" -L "$BASE/admin/dashboard")
code=${out%%|*}
final=${out##*|}
echo "GET /admin/dashboard -> HTTP $code"
echo "URL final: $final"
if echo "$final" | grep -q '/login'; then
  echo "RESULTADO: FALHOU (redirecionou pro login)"
else
  echo "RESULTADO: LOGIN FUNCIONOU"
  echo "titulo: $(grep -o '<title>[^<]*</title>' /tmp/dash.txt | head -1)"
fi
