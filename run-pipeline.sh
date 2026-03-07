#!/bin/bash
# ============================================================
# Parlay Bot — Daily Pipeline Runner
# Usage: ./run-pipeline.sh [morning|refresh|evening]
# ============================================================

cd "$(dirname "$0")"
LOGDIR="./logs"
mkdir -p "$LOGDIR"

# Date for log file naming
DATE=$(date +"%Y-%m-%d")
TIME=$(date +"%H:%M:%S")
MODE=${1:-morning}

LOGFILE="$LOGDIR/pipeline-${DATE}-${MODE}.log"

echo "========================================" | tee -a "$LOGFILE"
echo "Parlay Bot Pipeline — $MODE run" | tee -a "$LOGFILE"
echo "Started: $DATE $TIME" | tee -a "$LOGFILE"
echo "========================================" | tee -a "$LOGFILE"

case $MODE in
    morning)
        echo "" | tee -a "$LOGFILE"
        echo "Step 1/4: Updating odds..." | tee -a "$LOGFILE"
        node updater.js >> "$LOGFILE" 2>&1
        UPDATER_EXIT=$?

        echo "" | tee -a "$LOGFILE"
        echo "Step 2/4: Settling picks..." | tee -a "$LOGFILE"
        node settler.js >> "$LOGFILE" 2>&1
        SETTLER_EXIT=$?

        echo "" | tee -a "$LOGFILE"
        echo "Step 3/4: Running analysis..." | tee -a "$LOGFILE"
        node analyzer.js >> "$LOGFILE" 2>&1
        ANALYZER_EXIT=$?

        echo "" | tee -a "$LOGFILE"
        echo "Step 4/4: Posting to social..." | tee -a "$LOGFILE"
        if [ -f poster.js ]; then
            node poster.js --morning >> "$LOGFILE" 2>&1
            POSTER_EXIT=$?
        else
            echo "poster.js not found, skipping social post" | tee -a "$LOGFILE"
            POSTER_EXIT=0
        fi

        # Summary
        echo "" | tee -a "$LOGFILE"
        echo "========================================" | tee -a "$LOGFILE"
        echo "Pipeline complete at $(date +"%H:%M:%S")" | tee -a "$LOGFILE"
        echo "Updater:  exit code $UPDATER_EXIT" | tee -a "$LOGFILE"
        echo "Settler:  exit code $SETTLER_EXIT" | tee -a "$LOGFILE"
        echo "Analyzer: exit code $ANALYZER_EXIT" | tee -a "$LOGFILE"
        echo "Poster:   exit code $POSTER_EXIT" | tee -a "$LOGFILE"
        echo "========================================" | tee -a "$LOGFILE"

        # Alert on failure (optional: send push notification)
        if [ $UPDATER_EXIT -ne 0 ] || [ $ANALYZER_EXIT -ne 0 ]; then
            echo "⚠️  WARNING: Pipeline had errors. Check $LOGFILE" | tee -a "$LOGFILE"
            # Uncomment below to send push notification on failure:
            # curl -s -d "Parlay Bot pipeline error ($MODE). Check logs." ntfy.sh/parlay-bot-alerts > /dev/null
        fi
        ;;

    refresh)
        echo "Odds refresh only..." | tee -a "$LOGFILE"
        node updater.js >> "$LOGFILE" 2>&1
        echo "Refresh complete at $(date +"%H:%M:%S")" | tee -a "$LOGFILE"
        ;;

    evening)
        echo "" | tee -a "$LOGFILE"
        echo "Step 1/2: Settling today's games..." | tee -a "$LOGFILE"
        node settler.js >> "$LOGFILE" 2>&1
        SETTLER_EXIT=$?

        echo "" | tee -a "$LOGFILE"
        echo "Step 2/2: Posting results..." | tee -a "$LOGFILE"
        if [ -f poster.js ]; then
            node poster.js --evening >> "$LOGFILE" 2>&1
            POSTER_EXIT=$?
        else
            echo "poster.js not found, skipping social post" | tee -a "$LOGFILE"
            POSTER_EXIT=0
        fi

        echo "" | tee -a "$LOGFILE"
        echo "========================================" | tee -a "$LOGFILE"
        echo "Evening run complete at $(date +"%H:%M:%S")" | tee -a "$LOGFILE"
        echo "Settler: exit code $SETTLER_EXIT" | tee -a "$LOGFILE"
        echo "Poster:  exit code $POSTER_EXIT" | tee -a "$LOGFILE"
        echo "========================================" | tee -a "$LOGFILE"
        ;;

    *)
        echo "Unknown mode: $MODE. Use morning, refresh, or evening." | tee -a "$LOGFILE"
        exit 1
        ;;
esac
