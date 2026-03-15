// ============================================================
// PARLAY BOT — Daily Pipeline Orchestrator
// Single entry point for daily analysis. Runs once per morning.
// Includes idempotency check to prevent duplicate analysis.
//
// Pipeline: updater.js → settler.js → refiner.js → analyzer.js
// ============================================================
require('dotenv').config();
const { execSync } = require('child_process');
const { query, queryOne, execute, closePool } = require('./db');
const path = require('path');

const MODEL_USED = 'gemini-3.1-flash-lite-preview (with fallback)';

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

async function hasAlreadyRunToday() {
    const today = getTodayDate();
    const row = await queryOne(
        `SELECT id FROM daily_picks WHERE pick_date = $1 LIMIT 1`,
        [today]
    );
    return !!row;
}

function runScript(scriptName) {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`▶️  Running ${scriptName}...`);
    console.log(`${'─'.repeat(60)}\n`);

    try {
        execSync(`node "${scriptPath}"`, {
            stdio: 'inherit',
            cwd: __dirname,
            env: process.env
        });
        console.log(`\n✅ ${scriptName} completed successfully.`);
        return true;
    } catch (error) {
        console.error(`\n❌ ${scriptName} failed with exit code ${error.status}`);
        return false;
    }
}

async function getRunStats() {
    const today = getTodayDate();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [picks, parlays, games] = await Promise.all([
        query(`SELECT id FROM daily_picks WHERE pick_date = $1`, [today]),
        query(`SELECT id FROM recommended_parlays WHERE parlay_date = $1`, [today]),
        query(`SELECT game_id FROM games WHERE commence_time >= $1 AND commence_time < $2`, [today, tomorrow])
    ]);

    return {
        gamesAnalyzed: games?.length || 0,
        picksGenerated: picks?.length || 0,
        parlaysGenerated: parlays?.length || 0
    };
}

async function logPipelineRun(startedAt, stats, status) {
    try {
        await execute(
            `INSERT INTO pipeline_runs (run_date, started_at, completed_at, games_updated, picks_generated, picks_settled, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [getTodayDate(), startedAt.toISOString(), new Date().toISOString(),
             stats.gamesAnalyzed, stats.picksGenerated, stats.parlaysGenerated, status]
        );
    } catch (e) {
        console.log(`⚠️ Pipeline run logging failed: ${e.message}`);
    }
}

async function main() {
    console.log('🔄 PARLAY BOT — Daily Pipeline Orchestrator');
    console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
    console.log(`🤖 Model: ${MODEL_USED}`);
    console.log('='.repeat(60));

    // Check for --force flag
    const forceRun = process.argv.includes('--force');

    // Idempotency check
    if (!forceRun) {
        const alreadyRan = await hasAlreadyRunToday();
        if (alreadyRan) {
            console.log('\n✅ Analysis already completed for today. Skipping.');
            console.log('   (Use --force to override and re-run)');
            await closePool();
            process.exit(0);
        }
    } else {
        console.log('\n⚠️  --force flag detected. Skipping idempotency check.');
    }

    const startedAt = new Date();
    let overallStatus = 'success';

    // Phase 1: Fetch latest odds
    const updaterOK = runScript('updater.js');
    if (!updaterOK) {
        console.error('\n💥 Updater failed — aborting pipeline.');
        await logPipelineRun(startedAt, { gamesAnalyzed: 0, picksGenerated: 0, parlaysGenerated: 0 }, 'failed_updater');
        await closePool();
        process.exit(1);
    }

    // Phase 2: Settle yesterday's picks
    const settlerOK = runScript('settler.js');
    if (!settlerOK) {
        console.log('\n⚠️ Settler had issues — continuing with analysis anyway.');
        overallStatus = 'partial_settler_failure';
    }

    // Phase 2.5: Model Refinement (reviews settled results, adjusts parameters)
    const refinerOK = runScript('refiner.js');
    if (!refinerOK) {
        console.log('\n⚠️ Refiner had issues — continuing with analysis anyway.');
        if (overallStatus === 'success') overallStatus = 'partial_refiner_failure';
    }

    // Phase 3: AI Analysis + Parlay Construction
    const analyzerOK = runScript('analyzer.js');
    if (!analyzerOK) {
        console.error('\n💥 Analyzer failed.');
        await logPipelineRun(startedAt, await getRunStats(), 'failed_analyzer');
        await closePool();
        process.exit(1);
    }

    // Get stats and log
    const stats = await getRunStats();
    await logPipelineRun(startedAt, stats, overallStatus);

    const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);

    console.log(`\n${'='.repeat(60)}`);
    console.log('🎯 Daily Pipeline Complete!');
    console.log(`   ⏱️  Duration: ${elapsed}s`);
    console.log(`   📊 Games analyzed: ${stats.gamesAnalyzed}`);
    console.log(`   🎯 Picks generated: ${stats.picksGenerated}`);
    console.log(`   🎲 Parlays generated: ${stats.parlaysGenerated}`);
    console.log(`   🤖 Model: ${MODEL_USED}`);
    console.log(`   📅 Run date: ${getTodayDate()}`);
    console.log('='.repeat(60));
    await closePool();
}

main().catch(async err => {
    console.error('💥 Pipeline crashed:', err);
    await closePool();
    process.exit(1);
});
