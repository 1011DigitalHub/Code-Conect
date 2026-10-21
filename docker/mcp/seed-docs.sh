#!/usr/bin/env bash
set -euo pipefail

DOCS_DIR="$(cd "$(dirname "$0")" && pwd)/docs"
mkdir -p "$DOCS_DIR"

clone_sparse() {
  local name=$1 repo=$2 path=$3
  local target="$DOCS_DIR/$name"
  if [ -d "$target/.git" ]; then
    echo "[$name] já existe — pulando"
    return
  fi
  echo "[$name] clonando $repo (sparse: $path)..."
  git clone --filter=blob:none --sparse --depth=1 \
    "https://github.com/$repo" "$target"
  git -C "$target" sparse-checkout set "$path"
}

clone_sparse typescript   microsoft/TypeScript        doc
clone_sparse nestjs       nestjs/nest                 packages
clone_sparse prisma       prisma/docs                 content
clone_sparse tailwindcss  tailwindlabs/tailwindcss    packages/tailwindcss
clone_sparse react        reactjs/react.dev           src/content
clone_sparse vite         vitejs/vite                 docs
clone_sparse react-router remix-run/react-router      docs
clone_sparse vitest       vitest-dev/vitest           docs

echo "Seed concluído. Docs em $DOCS_DIR"
