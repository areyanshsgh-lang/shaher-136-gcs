#!/bin/bash
# Shaher-136 GCS — double-click launcher (macOS)
# Double-click this file in Finder to start the app. No typing needed.
# On first run it installs Bun automatically (needs internet), then the app.
# Keep the window that opens; closing it stops the GCS.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "   Shaher-136 GCS"
echo "=================================================="
echo ""

# Make bun reachable even when launched from Finder
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Install Bun automatically if it isn't already there (one-time, needs internet)
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun (the app's engine) isn't installed yet — installing it now."
  echo "This is a one-time step and needs an internet connection..."
  echo ""
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    echo ""
    echo "ERROR: Bun install failed. Please check your internet connection and try again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  echo ""
  echo "Bun installed."
  echo ""
fi

# First run: install dependencies
if [ ! -d node_modules ]; then
  echo "[1/3] Installing dependencies (first run, ~1-2 min)..."
  bun install || { echo "Install failed."; read -r -p "Press Enter to close..."; exit 1; }
else
  echo "[1/3] Dependencies OK"
fi

# Ensure the database exists
echo "[2/3] Setting up database..."
bun run setup >/dev/null 2>&1

# Start the drone relay service (port 3004) in the background
echo "[3/3] Starting drone service (port 3004)..."
(
  cd mini-services/drone-service 2>/dev/null || exit 0
  bun run dev
) &
DRONE_PID=$!

# Open the browser once the web server has had a moment to boot
( sleep 4; open "http://localhost:3000" ) &

# Stop the drone service when this window is closed
cleanup() { kill "$DRONE_PID" >/dev/null 2>&1; }
trap cleanup EXIT

echo ""
echo "=================================================="
echo "  App opening at http://localhost:3000"
echo "  KEEP THIS WINDOW OPEN while using the app."
echo "  Close it (or press Ctrl+C) to stop the GCS."
echo "=================================================="
echo ""

# Run the web app in the foreground (this holds the window open)
bun run dev
