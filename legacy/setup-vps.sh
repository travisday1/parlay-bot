#!/bin/bash
# ============================================================
# PARLAY BOT — One-Shot VPS Setup
# Run this on your VPS: bash setup-vps.sh
#
# Prerequisites:
#   - Copy your .env file to /home/travis/parlay-bot/.env FIRST
#   - Or create it manually with your API keys
# ============================================================
set -e

INSTALL_DIR="/home/travis/parlay-bot"
REPO_URL="https://github.com/travisday1/parlay-bot.git"

echo "🚀 Parlay Bot — VPS Setup"
echo "========================="

# 1. Ensure Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
    echo "✅ Node.js $(node -v) installed"
else
    echo "✅ Node.js $(node -v) found"
fi

NODE_BIN=$(dirname "$(which node)")
echo "   Node binary dir: $NODE_BIN"

# 2. Clone or pull the repo
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "📂 Repo already exists, pulling latest..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "📥 Cloning repo..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 3. Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 4. Check for .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo ""
    echo "⚠️  No .env file found!"
    echo "   Please create $INSTALL_DIR/.env with your API keys."
    echo "   Copy it from your local machine:"
    echo "     scp .env travis@<vps-ip>:$INSTALL_DIR/.env"
    echo ""
    echo "   Required keys:"
    echo "     SUPABASE_URL"
    echo "     SUPABASE_SERVICE_ROLE_KEY"
    echo "     ODDS_API_KEY"
    echo "     GEMINI_API_KEY"
    echo "     BALLDONTLIE_API_KEY"
    echo "     OPENWEATHER_API_KEY"
    echo ""
    read -p "   Press Enter after creating .env, or Ctrl+C to abort..."
fi

if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "❌ .env still not found. Aborting."
    exit 1
fi
echo "✅ .env found"

# 5. Make pipeline script executable
chmod +x "$INSTALL_DIR/run-pipeline.sh"

# 6. Set timezone to Eastern (games are published in ET)
CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "unknown")
if [ "$CURRENT_TZ" != "America/New_York" ]; then
    echo "🕐 Setting timezone to America/New_York (currently: $CURRENT_TZ)..."
    sudo timedatectl set-timezone America/New_York 2>/dev/null || echo "⚠️  Could not set timezone automatically. Run: sudo timedatectl set-timezone America/New_York"
else
    echo "✅ Timezone already set to America/New_York"
fi

# 7. Set up cron jobs
echo "⏰ Setting up cron jobs..."
CRON_MARKER="# PARLAY_BOT_CRON"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
    echo "   Cron jobs already configured. Skipping."
else
    (crontab -l 2>/dev/null; cat <<CRONEOF

$CRON_MARKER
# ============================================================
# PARLAY BOT — Automated Daily Pipeline
# ============================================================
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin:$NODE_BIN

# --- WEEKDAY (Mon-Fri) ---
# 10:00 AM ET — Full pipeline (updater -> settler -> analyzer)
0 10 * * 1-5 cd $INSTALL_DIR && ./run-pipeline.sh morning >> /dev/null 2>&1

# 4:00 PM ET — Odds refresh only
0 16 * * 1-5 cd $INSTALL_DIR && ./run-pipeline.sh refresh >> /dev/null 2>&1

# 11:30 PM ET — Settle + post results
30 23 * * 1-5 cd $INSTALL_DIR && ./run-pipeline.sh evening >> /dev/null 2>&1

# --- WEEKEND (Sat-Sun) ---
# 8:30 AM ET — Full pipeline (earlier for noon games)
30 8 * * 6,0 cd $INSTALL_DIR && ./run-pipeline.sh morning >> /dev/null 2>&1

# 11:00 AM ET — Odds refresh
0 11 * * 6,0 cd $INSTALL_DIR && ./run-pipeline.sh refresh >> /dev/null 2>&1

# 11:30 PM ET — Settle + post results
30 23 * * 6,0 cd $INSTALL_DIR && ./run-pipeline.sh evening >> /dev/null 2>&1

# --- MAINTENANCE ---
# Weekly log cleanup (Sun 3 AM)
0 3 * * 0 find $INSTALL_DIR/logs -name "*.log" -mtime +30 -delete 2>/dev/null
$CRON_MARKER
CRONEOF
    ) | crontab -

    echo "✅ Cron jobs installed"
fi

# 8. Create logs directory
mkdir -p "$INSTALL_DIR/logs"

# 9. Verify
echo ""
echo "========================================="
echo "✅ SETUP COMPLETE"
echo "========================================="
echo "Install dir:  $INSTALL_DIR"
echo "Node version: $(node -v)"
echo "Timezone:     $(timedatectl show --property=Timezone --value 2>/dev/null || date +%Z)"
echo ""
echo "Cron jobs installed:"
crontab -l 2>/dev/null | grep -E "run-pipeline|PARLAY" | head -10
echo ""
echo "========================================="
echo "🏃 Running first full pipeline NOW..."
echo "========================================="
echo ""

# 10. Run the first pipeline RIGHT NOW
cd "$INSTALL_DIR"

echo "Step 1/3: Fetching odds..."
node updater.js
echo ""

echo "Step 2/3: Settling yesterday's picks..."
node settler.js
echo ""

echo "Step 3/3: Running AI analysis..."
node analyzer.js
echo ""

echo "========================================="
echo "🎯 DONE! Pipeline is now running daily."
echo "📁 Logs: $INSTALL_DIR/logs/"
echo "📋 Verify cron: crontab -l"
echo "🔄 Manual re-run: cd $INSTALL_DIR && ./run-pipeline.sh morning"
echo "========================================="
