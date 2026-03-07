#!/bin/bash
# ============================================================
# PARLAY BOT — Daily Pipeline
# Run in order: updater → settler → analyzer
# settler runs BEFORE analyzer so calibration data is fresh
# ============================================================

echo "🚀 Parlay Bot Daily Pipeline"
echo "=============================="

echo ""
echo "Step 1: Fetching odds..."
node updater.js
echo ""

echo "Step 2: Settling picks..."
node settler.js
echo ""

echo "Step 3: Running AI analysis..."
node analyzer.js
echo ""

echo "✅ Pipeline complete!"
