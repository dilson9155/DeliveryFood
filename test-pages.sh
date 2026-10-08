#!/usr/bin/env bash
# Testa varias paginas autenticado como admin
set -u
BASE="${1:-https://delivery-food-red.vercel.app}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

# login
csrf=$(curl -s --max-time 40 -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -s -o /dev/null --max-time 40 -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "identifier=admin" \
  --data-urlencode "password=admin123" \
  --data-urlencode "callbackUrl=$BASE/admin/dashboard"
echo "login: ok"
echo ""

for path in /admin/dashboard /admin/pedidos /admin/produtos /admin/colaboradores /admin/entregadores /admin/delivery /entregador /admin/financeiro/receber /admin/relatorios /admin/configuracoes; do
  out=$(curl -s -o /tmp/p.html -w '%{http_code}|%{url_effective}' --max-time 40 -b "$JAR" -L "$BASE$path")
  code=${out%%|*}
  final=${out##*|}
  size=$(wc -c < /tmp/p.html)
  # procura por texto de erro
  err=$(grep -o 'Application error\|Erro interno\|Something went wrong' /tmp/p.html | head -1)
  redirect=""
  echo "$final" | grep -q '/login' && redirect=" -> REDIRECT PRO LOGIN"
  printf '%-28s HTTP %s  %s bytes%s%s\n' "$path" "$code" "$size" "${err:+  ERRO:$err}" "$redirect"
done
