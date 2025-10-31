#!/usr/bin/env bash
set -euo pipefail
echo "== termux-code v1.0.0 installer (patched) =="
PKG=pkg
if ! command -v $PKG >/dev/null 2>&1; then PKG=apt; fi
$PKG update -y || true
$PKG upgrade -y || true
$PKG install -y git nodejs python curl wget -y || true
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --no-audit --no-fund || true
fi
TARGET="$HOME/termux-code"
mkdir -p "$TARGET"
cp -r . "$TARGET/.."
cd "$TARGET/.."
if [ -d "backend" ]; then
  cd backend || true
  npm install --no-audit --no-fund --silent || true
  cd ..
fi
DB="$HOME/.termux-code/db.json"
if [ ! -f "$DB" ]; then
  mkdir -p "$(dirname "$DB")"
  node -e "const fs=require('fs'); const p=process.env.HOME+'/.termux-code/db.json'; fs.writeFileSync(p, JSON.stringify({users:[],plugins:[],settings:{}}, null, 2)); console.log('created',p)"
fi
pm2 start ecosystem.config.js --update-env || pm2 start backend/server.js --name termux-code || true
pm2 save || true
if ! grep -q "pm2 resurrect" "$HOME/.bashrc" 2>/dev/null; then
  echo "pm2 resurrect || true" >> "$HOME/.bashrc"
fi
echo "Install complete. Open http://localhost:4000"
