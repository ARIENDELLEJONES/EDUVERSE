#!/bin/bash
# EDUVERSE Installer — Linux / macOS
set -e

echo "============================================"
echo "  EDUVERSE — Hybrid Educational Platform"
echo "  Installer v1.0  |  2026"
echo "============================================"
echo ""

# ── 1. Check Node.js ────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[ERROR] Node.js is not installed."
  echo "  Please install Node.js 18+ from https://nodejs.org and re-run this script."
  exit 1
fi
NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo "[ERROR] Node.js 18 or higher is required. Found: v$(node -v)"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

# ── 2. Check pnpm ────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo "[INFO] Installing pnpm..."
  npm install -g pnpm
fi
echo "[OK] pnpm $(pnpm -v)"

# ── 3. Install dependencies ──────────────────────────────────────
echo ""
echo "[INFO] Installing dependencies (this may take a minute)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── 4. Build API server ──────────────────────────────────────────
echo ""
echo "[INFO] Building API server..."
pnpm --filter @workspace/api-server run build

echo ""
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo ""
echo "To start EDUVERSE, open TWO terminal windows:"
echo ""
echo "  Terminal 1 — API Server:"
echo "    cd artifacts/api-server"
echo "    PORT=5000 node dist/index.mjs"
echo ""
echo "  Terminal 2 — Frontend:"
echo "    cd artifacts/eduverse"
echo "    pnpm run dev"
echo ""
echo "Then open your browser at: http://localhost:5173"
echo ""
echo "  Default admin password: admin123"
echo "  Change it immediately in ADMIN > Settings."
echo "============================================"
