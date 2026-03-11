// ============================================================
// PARLAY BOT — Daily Pipeline Orchestrator
// Single entry point for daily analysis. Runs once per morning.
// Includes idempotency check to prevent duplicate analysis.
//
// Pipeline: updater.js → settler.js → analyzer.js
// ============================================================
require('dotenv').config();
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODEL_USED = 'gemini-3.1-pro-preview';

async function ensurePipelineRunsTable() {
    // Create pipeline_runs table if it doesn't exist
    const { error } = await supabase.rpc('exec_sql', {
        sql: `CREATE TABLE IF NOT EXISTS pipeline_runs (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            run_date date NOT NULL DEFAULT CURRENT_DATE,
            started_at timestamptz NOT NULL,
            completed_at timestamptz,
            games_analyzed int,
            picks_generated int,
            parlays_generated int,
            model_used text DEFAULT 'gemini-3.1-pro-preview',
            status text DEFAULT 'running'
        );`
    });
    // RPC may not exist — try direct insert to see if table exists
    if (error) {
        // Table likely already exists or RPC doesn't exist — that's fine
        // We'll handle errors at insert time
    }
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

async function hasAlreadyRunToday() {
    const today = getTodayDate();
    const { data, error } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('pick_date', today)
        .limit(1);

    if (error) {
        console.log(`⚠️ Could not check for existing picks: ${error.message}`);
        return false; // Proceed if we can't check
    }

    return data && data.length > 0;
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

    const { data: picks } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('pick_date', today);

    const { data: parlays } = await supabase
        .from('recommended_parlays')
        .select('id')
        .eq('parlay_date', today);

    const { data: games } = await supabase
        .from('games')
        .select('id')
        .gte('commence_time', new Date().toISOString().split('T')[0])
        .lte('commence_time', new Date(Date.now() + 86400000).toISOString().split('T')[0]);

    return {
        gamesAnalyzed: games?.length || 0,
        picksGenerated: picks?.length || 0,
        parlaysGenerated: parlays?.length || 0
    };
}

async function logPipelineRun(startedAt, stats, status) {
    try {
        const { error } = await supabase
            .from('pipeline_runs')
            .insert({
                run_date: getTodayDate(),
                started_at: startedAt.toISOString(),
                completed_at: new Date().toISOString(),
                games_analyzed: stats.gamesAnalyzed,
                picks_generated: stats.picksGenerated,
                parlays_generated: stats.parlaysGenerated,
                model_used: MODEL_USED,
                status: status
            });
        if (error) {
            console.log(`⚠️ Could not log pipeline run: ${error.message}`);
            console.log('   (This is non-critical — the pipeline_runs table may not exist yet.)');
            console.log('   Create it with: CREATE TABLE pipeline_runs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, run_date date, started_at timestamptz, completed_at timestamptz, games_analyzed int, picks_generated int, parlays_generated int, model_used text, status text);');
        }
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
        process.exit(1);
    }

    // Phase 2: Settle yesterday's picks
    const settlerOK = runScript('settler.js');
    if (!settlerOK) {
        console.log('\n⚠️ Settler had issues — continuing with analysis anyway.');
        overallStatus = 'partial_settler_failure';
    }

    // Phase 3: AI Analysis + Parlay Construction
    const analyzerOK = runScript('analyzer.js');
    if (!analyzerOK) {
        console.error('\n💥 Analyzer failed.');
        await logPipelineRun(startedAt, await getRunStats(), 'failed_analyzer');
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
}

main().catch(err => {
    console.error('💥 Pipeline crashed:', err);
    process.exit(1);
});
