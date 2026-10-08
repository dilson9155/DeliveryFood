#!/usr/bin/env bash
# Testa login de um usuario e acesso a uma pagina
set -u
BASE="${1:-https://delivery-food-red.vercel.app}"
IDENT="${2:-motoboy}"
SENHA="${3:-motoboy123}"
ALVO="${4:-/entregador}"

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

csrf=$(curl -s --max-time 40 -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "identifier=$IDENT" \
  --data-urlencode "password=$SENHA" \
  --data-urlencode "callbackUrl=$BASE$ALVO")
echo "login [$IDENT] -> HTTP $code"

out=$(curl -s -o /tmp/t.html -w '%{http_code}|%{url_effective}' --max-time 40 -b "$JAR" -L "$BASE$ALVO")
hcode=${out%%|*}; final=${out##*|}
echo "GET $ALVO -> HTTP $hcode"
echo "URL final: $final"
echo "titulo: $(grep -o '<title>[^<]*</title>' /tmp/t.html | head -1)"
if echo "$final" | grep -q '/login'; then
  echo "RESULTADO: BLOQUEADO (mandou pro login)"
else
  echo "RESULTADO: OK"
fi
# mostra pedacos de texto visivel
echo "--- texto da pagina (1o 400 chars de texto) ---"
sed -e 's/<[^>]*>/ /g' /tmp/t.html | tr -s ' \n' ' ' | cut -c1-400
