#!/usr/bin/env bash
set -euo pipefail

EXCLUDE_DIRS=(
  node_modules
  dist
  .next
  coverage
  plan
  apps/api/src/generated
  postman
  .git
)

EXCLUDE_ARGS=()
for dir in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS+=(--exclude-dir="$dir")
done

echo "=== Varredura de TODO / FIXME ==="
echo ""

RESULTS=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' \
  --include='*.jsx' --include='*.yml' --include='*.yaml' --include='*.sh' \
  "${EXCLUDE_ARGS[@]}" \
  -E '\b(TODO|FIXME)\b' . 2>/dev/null || true)

if [ -z "$RESULTS" ]; then
  echo "Nenhum TODO ou FIXME encontrado. Codebase limpo!"
  exit 0
fi

COUNT=$(echo "$RESULTS" | wc -l)
echo "Encontrados $COUNT marcadores:"
echo ""
echo "$RESULTS" | while IFS= read -r line; do
  FILE=$(echo "$line" | cut -d: -f1)
  LINE_NUM=$(echo "$line" | cut -d: -f2)
  CONTENT=$(echo "$line" | cut -d: -f3-)
  printf "  %s:%s →%s\n" "$FILE" "$LINE_NUM" "$CONTENT"
done
echo ""
echo "=== Fim da varredura ==="
