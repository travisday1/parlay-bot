// ============================================================
// PARLAY BOT — Mathematical Probability Model
// Generates independent win probabilities using:
//   - Dean Oliver's Four Factors (eFG%, TOV%, OREB%, FTR)
//   - Offensive & Defensive Rating (per 100 possessions)
//   - Pace for totals projection
//   - Rest differential adjustment
//   - Strength of schedule adjustment
//
// This model runs BEFORE the AI analyzer and provides the
// probability baseline. The AI can adjust by ±5% max with reasoning.
// ============================================================
require('dotenv').config();
const { BalldontlieAPI } = require('@balldontlie/sdk');
const { createClient } = require('@supabase/supabase-js');

const bdl = new BalldontlieAPI({ apiKey: process.env.BALLDONTLIE_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ============================================================
// SPORT-SPECIFIC CONFIGURATION
// ============================================================
const SPORT_CONFIG = {
    'basketball_nba': {
        homeAdvantage: 0.03,        // ~3% home win probability boost
        fourFactorsWeight: 0.30,    // weight of Four Factors in power rating
        netRatingWeight: 0.40,      // weight of Net Rating
        recentFormWeight: 0.20,     // weight of last-10-game performance
        restWeight: 0.05,           // weight of rest differential
        scheduleWeight: 0.05,       // weight of strength of schedule
        evThreshold: 0.03,          // minimum edge to recommend (raised floor, tier logic handles rest)
        useAdvancedStats: true,
    },
    'basketball_ncaab': {
        homeAdvantage: 0.04,            // Stronger home court in college
        fourFactorsWeight: 0.30,        // Same framework applies to college basketball
        netRatingWeight: 0.30,          // Slightly less reliable with smaller sample sizes
        recentFormWeight: 0.25,
        restWeight: 0.05,
        scheduleWeight: 0.10,           // SoS matters more in college (huge talent gaps)
        evThreshold: 0.06,              // Higher threshold — less efficient market but noisier data
        useAdvancedStats: true,         // BallDontLie has NCAAB box scores
        rankingWeight: 0.10,            // AP/Coaches Poll ranking differential
    },
    'icehockey_nhl': {
        homeAdvantage: 0.015,
        fourFactorsWeight: 0.00,    // Four Factors is basketball-specific
        netRatingWeight: 0.45,      // Goals For/Against differential (proxy for net rating)
        recentFormWeight: 0.30,
        restWeight: 0.10,           // Back-to-backs matter more in hockey
        scheduleWeight: 0.15,
        evThreshold: 0.05,
        useAdvancedStats: true,     // BallDontLie has NHL season stats
    },
    'americanfootball_nfl': {
        homeAdvantage: 0.025,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.45,
        recentFormWeight: 0.30,
        restWeight: 0.10,
        scheduleWeight: 0.15,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'baseball_mlb': {
        homeAdvantage: 0.01,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.45,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.15,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    // Soccer — generic config shared across all leagues
    // Lower home advantage than US sports, no Four Factors (basketball-specific)
    // Uses generic stats from Supabase history (no BallDontLie for soccer)
    'soccer_usa_mls': {
        homeAdvantage: 0.025,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'soccer_epl': {
        homeAdvantage: 0.02,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'soccer_spain_la_liga': {
        homeAdvantage: 0.02,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'soccer_germany_bundesliga': {
        homeAdvantage: 0.02,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'soccer_france_ligue_one': {
        homeAdvantage: 0.02,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
    'soccer_italy_serie_a': {
        homeAdvantage: 0.02,
        fourFactorsWeight: 0.00,
        netRatingWeight: 0.40,
        recentFormWeight: 0.35,
        restWeight: 0.05,
        scheduleWeight: 0.20,
        evThreshold: 0.05,
        useAdvancedStats: false,
    },
};

// ============================================================
// NBA ADVANCED STATS FETCHER
// Uses BallDontLie API for Four Factors and efficiency ratings
// ============================================================

// Cache team stats to avoid redundant API calls
const teamStatsCache = {};

// Rate-limit helper: small delay between BDL API calls
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getNBATeamAdvancedStats(teamName, season) {
    const cacheKey = `${teamName}_${season}`;
    if (teamStatsCache[cacheKey]) return teamStatsCache[cacheKey];

    try {
        await sleep(300); // respect BDL rate limits

        // Get all NBA teams to find the team ID
        const teamsResponse = await bdl.nba.getTeams();
        const team = teamsResponse.data.find(t =>
            t.full_name.toLowerCase() === teamName.toLowerCase() ||
            t.name.toLowerCase() === teamName.split(' ').pop().toLowerCase()
        );

        if (!team) {
            console.log(`   ⚠️ Could not find BDL team for: ${teamName}`);
            return null;
        }

        // Get team season averages (advanced stats)
        const statsUrl = `https://api.balldontlie.io/nba/v1/team_season_averages/advanced?season=${season}&team_ids[]=${team.id}`;
        const response = await fetch(statsUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!response.ok) {
            // Fallback: try to compute from recent game stats
            return await computeTeamStatsFromGames(team.id, season);
        }

        const data = await response.json();
        const stats = data.data?.[0];

        if (!stats) {
            return await computeTeamStatsFromGames(team.id, season);
        }

        const result = {
            teamId: team.id,
            teamName: team.full_name,
            offensiveRating: stats.offensive_rating || 0,
            defensiveRating: stats.defensive_rating || 0,
            netRating: stats.net_rating || (stats.offensive_rating - stats.defensive_rating) || 0,
            pace: stats.pace || 0,
            effectiveFGPct: stats.effective_field_goal_percentage || 0,
            turnoverPct: stats.turnover_ratio || 0,
            offRebPct: stats.offensive_rebound_percentage || 0,
            trueShootingPct: stats.true_shooting_percentage || 0,
            source: 'balldontlie_advanced',
        };

        teamStatsCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log(`   ⚠️ BDL advanced stats error for ${teamName}: ${e.message}`);
        return null;
    }
}

async function computeTeamStatsFromGames(teamId, season) {
    try {
        // Get recent game stats and compute averages
        const statsUrl = `https://api.balldontlie.io/nba/v1/stats?seasons[]=${season}&team_ids[]=${teamId}&per_page=100`;
        const response = await fetch(statsUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!response.ok) return null;
        const data = await response.json();

        if (!data.data || data.data.length === 0) return null;

        // Aggregate box score stats to compute team-level metrics
        // Group by game_id to get team totals per game
        const gameStats = {};
        for (const stat of data.data) {
            const gid = stat.game?.id;
            if (!gid) continue;
            if (!gameStats[gid]) {
                gameStats[gid] = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, turnover: 0, pts: 0 };
            }
            gameStats[gid].fgm += stat.fgm || 0;
            gameStats[gid].fga += stat.fga || 0;
            gameStats[gid].fg3m += stat.fg3m || 0;
            gameStats[gid].fg3a += stat.fg3a || 0;
            gameStats[gid].ftm += stat.ftm || 0;
            gameStats[gid].fta += stat.fta || 0;
            gameStats[gid].oreb += stat.oreb || 0;
            gameStats[gid].dreb += stat.dreb || 0;
            gameStats[gid].turnover += stat.turnover || 0;
            gameStats[gid].pts += stat.pts || 0;
        }

        const games = Object.values(gameStats);
        if (games.length === 0) return null;

        // Calculate Four Factors averages
        const avg = (arr, key) => arr.reduce((s, g) => s + g[key], 0) / arr.length;

        const avgFGA = avg(games, 'fga');
        const avgFGM = avg(games, 'fgm');
        const avgFG3M = avg(games, 'fg3m');
        const avgFTA = avg(games, 'fta');
        const avgFTM = avg(games, 'ftm');
        const avgOreb = avg(games, 'oreb');
        const avgTurnover = avg(games, 'turnover');
        const avgPts = avg(games, 'pts');

        // Dean Oliver's Four Factors
        const eFGPct = avgFGA > 0 ? (avgFGM + 0.5 * avgFG3M) / avgFGA : 0;
        const tovPct = avgFGA > 0 ? avgTurnover / (avgFGA + 0.44 * avgFTA + avgTurnover) : 0;
        const ftRate = avgFGA > 0 ? avgFTM / avgFGA : 0;

        // Estimate possessions per game (simplified)
        const possessions = avgFGA + 0.44 * avgFTA + avgTurnover - avgOreb;
        const offRating = possessions > 0 ? (avgPts / possessions) * 100 : 100;
        const pace = possessions; // possessions per game

        return {
            teamId,
            offensiveRating: Math.round(offRating * 10) / 10,
            defensiveRating: 0, // can't compute from own box scores alone
            // FIXED: netRating of 0 collapses the power differential calculation.
            // Use offensive rating relative to league average (≈112 ORtg in modern NBA) as a proxy.
            // This is imperfect but far better than 0, which makes the model treat this team as perfectly average.
            netRating: Math.round((offRating - 112) * 10) / 10,
            pace: Math.round(pace * 10) / 10,
            effectiveFGPct: Math.round(eFGPct * 1000) / 1000,
            turnoverPct: Math.round(tovPct * 1000) / 1000,
            offRebPct: 0, // needs opponent data
            freeThrowRate: Math.round(ftRate * 1000) / 1000,
            trueShootingPct: avgFGA > 0 ? Math.round((avgPts / (2 * (avgFGA + 0.44 * avgFTA))) * 1000) / 1000 : 0,
            gamesAnalyzed: games.length,
            source: 'computed_from_box_scores',
        };
    } catch (e) {
        console.log(`   ⚠️ Box score computation error: ${e.message}`);
        return null;
    }
}

// ============================================================
// NCAAB ADVANCED STATS FETCHER
// Uses BallDontLie NCAAB API for team box score stats
// Computes Four Factors from aggregated player box scores
// ============================================================
async function getNCAABTeamStats(teamName, season) {
    const cacheKey = `ncaab_${teamName}_${season}`;
    if (teamStatsCache[cacheKey]) return teamStatsCache[cacheKey];

    try {
        await sleep(300);

        // Step 1: Find the team ID
        const teamsUrl = `https://api.balldontlie.io/ncaab/v1/teams?per_page=100`;
        const teamsResponse = await fetch(teamsUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!teamsResponse.ok) return null;
        const teamsData = await teamsResponse.json();

        // Match by full_name or partial name match
        const teamNameLower = teamName.toLowerCase();
        const team = teamsData.data.find(t =>
            t.full_name?.toLowerCase() === teamNameLower ||
            t.name?.toLowerCase() === teamNameLower.split(' ').pop() ||
            t.full_name?.toLowerCase().includes(teamNameLower) ||
            teamNameLower.includes(t.full_name?.toLowerCase() || '')
        );

        if (!team) {
            console.log(`   ⚠️ Could not find NCAAB team for: ${teamName}`);
            return null;
        }

        await sleep(300);

        // Step 2: Get recent game scores to compute stats
        const gamesUrl = `https://api.balldontlie.io/ncaab/v1/games?seasons[]=${season}&team_ids[]=${team.id}&per_page=25`;
        const gamesResponse = await fetch(gamesUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!gamesResponse.ok) return null;
        const gamesData = await gamesResponse.json();

        // Get completed games
        const completedGames = (gamesData.data || []).filter(g =>
            g.status === 'post' || g.status === 'Final' || g.home_score > 0
        );

        if (completedGames.length === 0) return null;

        // Compute stats from game scores
        let totalPF = 0, totalPA = 0, wins = 0;
        for (const game of completedGames) {
            const isHome = game.home_team?.id === team.id;
            const pf = isHome ? game.home_score : game.away_score;
            const pa = isHome ? game.away_score : game.home_score;
            totalPF += pf || 0;
            totalPA += pa || 0;
            if (pf > pa) wins++;
        }

        const gamesPlayed = completedGames.length;
        const avgPF = totalPF / gamesPlayed;
        const avgPA = totalPA / gamesPlayed;

        // Step 3: Try to get box score stats for Four Factors computation
        let fourFactors = null;
        const recentGameIds = completedGames.slice(0, 5).map(g => g.id);

        if (recentGameIds.length > 0) {
            const statsPromises = recentGameIds.map(async (gameId) => {
                await sleep(200);
                const statsUrl = `https://api.balldontlie.io/ncaab/v1/stats?game_ids[]=${gameId}&team_ids[]=${team.id}&per_page=50`;
                const resp = await fetch(statsUrl, {
                    headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
                });
                if (!resp.ok) return [];
                const data = await resp.json();
                return data.data || [];
            });

            const allPlayerStats = (await Promise.all(statsPromises)).flat();

            if (allPlayerStats.length > 0) {
                const gameAgg = {};
                for (const stat of allPlayerStats) {
                    const gid = stat.game?.id;
                    if (!gid) continue;
                    if (!gameAgg[gid]) {
                        gameAgg[gid] = { fgm: 0, fga: 0, fg3m: 0, fta: 0, ftm: 0, oreb: 0, dreb: 0, turnover: 0, pts: 0 };
                    }
                    gameAgg[gid].fgm += stat.fgm || 0;
                    gameAgg[gid].fga += stat.fga || 0;
                    gameAgg[gid].fg3m += stat.fg3m || 0;
                    gameAgg[gid].fta += stat.fta || 0;
                    gameAgg[gid].ftm += stat.ftm || 0;
                    gameAgg[gid].oreb += stat.oreb || 0;
                    gameAgg[gid].dreb += stat.dreb || 0;
                    gameAgg[gid].turnover += stat.turnover || 0;
                    gameAgg[gid].pts += stat.pts || 0;
                }

                const games = Object.values(gameAgg);
                if (games.length >= 3) {
                    const avg = (arr, key) => arr.reduce((s, g) => s + g[key], 0) / arr.length;
                    const avgFGA = avg(games, 'fga');
                    const avgFGM = avg(games, 'fgm');
                    const avgFG3M = avg(games, 'fg3m');
                    const avgFTA = avg(games, 'fta');
                    const avgFTM = avg(games, 'ftm');
                    const avgOreb = avg(games, 'oreb');
                    const avgTOV = avg(games, 'turnover');

                    fourFactors = {
                        effectiveFGPct: avgFGA > 0 ? Math.round(((avgFGM + 0.5 * avgFG3M) / avgFGA) * 1000) / 1000 : 0,
                        turnoverPct: avgFGA > 0 ? Math.round((avgTOV / (avgFGA + 0.44 * avgFTA + avgTOV)) * 1000) / 1000 : 0,
                        freeThrowRate: avgFGA > 0 ? Math.round((avgFTM / avgFGA) * 1000) / 1000 : 0,
                        offRebRate: 0,
                    };

                    const possessions = avgFGA + 0.44 * avgFTA + avgTOV - avgOreb;
                    fourFactors.offensiveRating = possessions > 0 ? Math.round((avg(games, 'pts') / possessions) * 100 * 10) / 10 : 0;
                    fourFactors.pace = Math.round(possessions * 10) / 10;
                }
            }
        }

        // Step 4: Get AP/Coaches Poll ranking
        let ranking = null;
        try {
            await sleep(200);
            const rankingsUrl = `https://api.balldontlie.io/ncaab/v1/rankings?season=${season}`;
            const rankingsResponse = await fetch(rankingsUrl, {
                headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
            });
            if (rankingsResponse.ok) {
                const rankingsData = await rankingsResponse.json();
                const teamRanking = (rankingsData.data || []).find(r =>
                    r.team?.id === team.id || r.team?.full_name?.toLowerCase() === teamNameLower
                );
                if (teamRanking) {
                    ranking = teamRanking.rank;
                }
            }
        } catch (e) { /* rankings optional */ }

        const result = {
            teamId: team.id,
            teamName: team.full_name || teamName,
            avgPointsFor: Math.round(avgPF * 10) / 10,
            avgPointsAgainst: Math.round(avgPA * 10) / 10,
            pointDifferential: Math.round((avgPF - avgPA) * 10) / 10,
            winPct: Math.round((wins / gamesPlayed) * 1000) / 1000,
            gamesAnalyzed: gamesPlayed,
            apRanking: ranking,
            offensiveRating: fourFactors?.offensiveRating || 0,
            defensiveRating: 0,
            netRating: fourFactors?.offensiveRating ? fourFactors.offensiveRating - 100 : avgPF - avgPA,
            pace: fourFactors?.pace || 0,
            effectiveFGPct: fourFactors?.effectiveFGPct || 0,
            turnoverPct: fourFactors?.turnoverPct || 0,
            freeThrowRate: fourFactors?.freeThrowRate || 0,
            offRebPct: fourFactors?.offRebRate || 0,
            source: fourFactors ? 'balldontlie_ncaab_box_scores' : 'balldontlie_ncaab_scores',
        };

        teamStatsCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log(`   ⚠️ NCAAB stats error for ${teamName}: ${e.message}`);
        return null;
    }
}

// ============================================================
// NHL TEAM STATS FETCHER
// Uses BallDontLie NHL API for team season stats
// ============================================================
async function getNHLTeamStats(teamName, season) {
    const cacheKey = `nhl_${teamName}_${season}`;
    if (teamStatsCache[cacheKey]) return teamStatsCache[cacheKey];

    try {
        await sleep(300);

        // Find team
        const teamsUrl = `https://api.balldontlie.io/nhl/v1/teams`;
        const teamsResponse = await fetch(teamsUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });
        if (!teamsResponse.ok) return null;
        const teamsData = await teamsResponse.json();

        const teamNameLower = teamName.toLowerCase();
        const team = teamsData.data.find(t =>
            t.full_name?.toLowerCase() === teamNameLower ||
            t.full_name?.toLowerCase().includes(teamNameLower) ||
            teamNameLower.includes(t.full_name?.toLowerCase() || '')
        );

        if (!team) return null;

        await sleep(300);

        // Get recent games to compute stats
        const gamesUrl = `https://api.balldontlie.io/nhl/v1/games?seasons[]=${season}&team_ids[]=${team.id}&per_page=25`;
        const gamesResponse = await fetch(gamesUrl, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!gamesResponse.ok) return null;
        const gamesData = await gamesResponse.json();

        const completedGames = (gamesData.data || []).filter(g =>
            g.status === 'Final' || g.home_score > 0
        );

        if (completedGames.length === 0) return null;

        let totalGF = 0, totalGA = 0, wins = 0;
        for (const game of completedGames) {
            const isHome = game.home_team?.id === team.id;
            const gf = isHome ? game.home_score : game.away_score;
            const ga = isHome ? game.away_score : game.home_score;
            totalGF += gf || 0;
            totalGA += ga || 0;
            if (gf > ga) wins++;
        }

        const gamesPlayed = completedGames.length;

        const result = {
            teamId: team.id,
            teamName: team.full_name,
            goalsForPerGame: Math.round((totalGF / gamesPlayed) * 100) / 100,
            goalsAgainstPerGame: Math.round((totalGA / gamesPlayed) * 100) / 100,
            goalDifferentialPerGame: Math.round(((totalGF - totalGA) / gamesPlayed) * 100) / 100,
            avgPointsFor: Math.round((totalGF / gamesPlayed) * 100) / 100,
            avgPointsAgainst: Math.round((totalGA / gamesPlayed) * 100) / 100,
            pointDifferential: Math.round(((totalGF - totalGA) / gamesPlayed) * 100) / 100,
            netRating: Math.round(((totalGF - totalGA) / gamesPlayed) * 100) / 100,
            winPct: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 1000) / 1000 : 0,
            gamesAnalyzed: gamesPlayed,
            source: 'balldontlie_nhl',
        };

        teamStatsCache[cacheKey] = result;
        return result;
    } catch (e) {
        console.log(`   ⚠️ NHL stats error for ${teamName}: ${e.message}`);
        return null;
    }
}

// ============================================================
// GENERIC TEAM STATS (NON-NBA)
// Uses Supabase game history to compute basic power ratings
// ============================================================
async function getGenericTeamStats(teamName, sportKey) {
    // Query recent completed games from pick_results + games
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: results } = await supabase
        .from('pick_results')
        .select('home_final_score, away_final_score, game_id, daily_picks!inner(games!inner(home_team, away_team, sport_key, commence_time))')
        .eq('daily_picks.games.sport_key', sportKey)
        .gte('daily_picks.games.commence_time', thirtyDaysAgo.toISOString());

    if (!results || results.length === 0) return null;

    // Filter to games involving this team
    const teamGames = results.filter(r =>
        r.daily_picks.games.home_team === teamName || r.daily_picks.games.away_team === teamName
    );

    if (teamGames.length < 3) return null;

    // Compute basic metrics
    let wins = 0, totalPF = 0, totalPA = 0;
    for (const g of teamGames) {
        const isHome = g.daily_picks.games.home_team === teamName;
        const pf = isHome ? g.home_final_score : g.away_final_score;
        const pa = isHome ? g.away_final_score : g.home_final_score;
        totalPF += pf;
        totalPA += pa;
        if (pf > pa) wins++;
    }

    const gamesPlayed = teamGames.length;
    const avgPF = totalPF / gamesPlayed;
    const avgPA = totalPA / gamesPlayed;
    const winPct = wins / gamesPlayed;

    return {
        teamName,
        avgPointsFor: Math.round(avgPF * 10) / 10,
        avgPointsAgainst: Math.round(avgPA * 10) / 10,
        pointDifferential: Math.round((avgPF - avgPA) * 10) / 10,
        winPct: Math.round(winPct * 1000) / 1000,
        gamesAnalyzed: gamesPlayed,
        source: 'supabase_history',
    };
}

// ============================================================
// REST DIFFERENTIAL
// ============================================================
async function getRestDifferential(homeTeam, awayTeam, sportKey, gameDate) {
    // Reuse the existing fatigue data from enricher
    const { getScheduleFatigue } = require('./enricher');

    const homeFatigue = await getScheduleFatigue(homeTeam, sportKey, gameDate);
    const awayFatigue = await getScheduleFatigue(awayTeam, sportKey, gameDate);

    const homeRest = homeFatigue.daysSinceLastGame || 2;
    const awayRest = awayFatigue.daysSinceLastGame || 2;

    // Normalize rest differential to a -1 to +1 scale
    const restDiff = Math.max(-1, Math.min(1, (homeRest - awayRest) / 3));

    // Additional penalty for back-to-backs
    let b2bAdjustment = 0;
    if (homeFatigue.isBackToBack && !awayFatigue.isBackToBack) b2bAdjustment = -0.03;
    if (awayFatigue.isBackToBack && !homeFatigue.isBackToBack) b2bAdjustment = 0.03;

    return {
        homeRest,
        awayRest,
        restDiff,
        b2bAdjustment,
        totalAdjustment: restDiff * 0.015 + b2bAdjustment, // max ~±4.5%
    };
}

// ============================================================
// LOGISTIC WIN PROBABILITY MODEL
// Converts power rating differential to win probability
// ============================================================
function logisticWinProbability(powerDiff, homeAdvantage) {
    // k = 0.15 was too steep — created extreme probabilities from moderate power diffs.
    // NBA empirical data: ~2.5-3 net rating points per 10% win prob shift.
    // k = 0.10 maps +5 NRtg diff → ~62% (was ~68% before), which matches real-world data.
    // homeAdvantage is already a probability fraction (e.g. 0.03), so we convert it to
    // approximate net-rating-equivalent points (×33 ≈ 1 NRtg point per 3% prob).
    const k = 0.10;
    const x = powerDiff + (homeAdvantage * 33);
    return 1 / (1 + Math.exp(-k * x));
}

// ============================================================
// FOUR FACTORS DIFFERENTIAL (NBA-specific)
// Dean Oliver's framework: eFG% (40%), TOV% (25%), OREB% (20%), FTR (15%)
// ============================================================
function computeFourFactorsDiff(homeStats, awayStats) {
    if (!homeStats || !awayStats) return 0;

    const eFGDiff = (homeStats.effectiveFGPct || 0) - (awayStats.effectiveFGPct || 0);
    const tovDiff = (awayStats.turnoverPct || 0) - (homeStats.turnoverPct || 0); // reversed: lower is better
    const orebDiff = (homeStats.offRebPct || 0) - (awayStats.offRebPct || 0);
    const ftRateDiff = (homeStats.freeThrowRate || homeStats.trueShootingPct || 0)
        - (awayStats.freeThrowRate || awayStats.trueShootingPct || 0);

    // Weighted composite (Oliver's weights)
    const composite = (eFGDiff * 0.40) + (tovDiff * 0.25) + (orebDiff * 0.20) + (ftRateDiff * 0.15);

    // Scale to approximate net rating points
    return composite * 30;
}

// ============================================================
// EXPECTED VALUE CALCULATION
// ============================================================
function impliedProbFromOdds(americanOdds) {
    if (!americanOdds || americanOdds === 0) return 0.5;
    if (americanOdds < 0) return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    return 100 / (americanOdds + 100);
}

function calculateEV(modelProb, americanOdds) {
    const impliedProb = impliedProbFromOdds(americanOdds);
    let decimalOdds;
    if (americanOdds > 0) decimalOdds = (americanOdds / 100) + 1;
    else decimalOdds = (100 / Math.abs(americanOdds)) + 1;

    const profit = decimalOdds - 1;
    const ev = (modelProb * profit) - ((1 - modelProb) * 1);
    const edge = modelProb - impliedProb;

    return {
        modelProb: Math.round(modelProb * 1000) / 1000,
        impliedProb: Math.round(impliedProb * 1000) / 1000,
        edge: Math.round(edge * 1000) / 1000,
        ev: Math.round(ev * 1000) / 1000,
        isPositiveEV: ev > 0,
    };
}

// ============================================================
// PROJECTED TOTAL (for O/U bets)
// ============================================================
function projectTotal(homeStats, awayStats, sportKey, enrichment) {
    if (!homeStats || !awayStats) return null;

    if (sportKey === 'basketball_nba') {
        const homeORtg = homeStats.offensiveRating || 110;
        const awayORtg = awayStats.offensiveRating || 110;
        const matchupPace = ((homeStats.pace || 98) + (awayStats.pace || 98)) / 2;

        let homeProjected = (homeORtg / 100) * matchupPace;
        let awayProjected = (awayORtg / 100) * matchupPace;

        // Referee pace adjustment
        const refTendency = enrichment?.refereeData?.tendency;
        if (refTendency) {
            // High-foul crews add ~2-4 more free throw attempts per team
            // Each additional FTA ≈ 0.75 points on average (75% FT%)
            const foulImpact = refTendency.foulRateDeviation * 0.75;
            homeProjected += foulImpact / 2;
            awayProjected += foulImpact / 2;
        }

        return {
            projectedTotal: Math.round((homeProjected + awayProjected) * 10) / 10,
            homeProjected: Math.round(homeProjected * 10) / 10,
            awayProjected: Math.round(awayProjected * 10) / 10,
            matchupPace: Math.round(matchupPace * 10) / 10,
            refereeAdjustment: refTendency ? Math.round(refTendency.foulRateDeviation * 0.75 * 10) / 10 : 0,
        };
    }

    // For non-NBA sports: use simple average of recent scoring
    if (homeStats.avgPointsFor && awayStats.avgPointsFor) {
        const projected = (homeStats.avgPointsFor + awayStats.avgPointsFor + homeStats.avgPointsAgainst + awayStats.avgPointsAgainst) / 2;
        return {
            projectedTotal: Math.round(projected * 10) / 10,
            homeProjected: Math.round(((homeStats.avgPointsFor + awayStats.avgPointsAgainst) / 2) * 10) / 10,
            awayProjected: Math.round(((awayStats.avgPointsFor + homeStats.avgPointsAgainst) / 2) * 10) / 10,
        };
    }

    return null;
}

// ============================================================
// MASTER MODEL: Generate Probabilities for a Game
// ============================================================
async function generateGameProbabilities(game) {
    const sportKey = game.sport_key;
    const config = SPORT_CONFIG[sportKey];
    if (!config) return null;

    const odds = game.odds?.[0];
    if (!odds) return null;

    const homeTeam = game.home_team;
    const awayTeam = game.away_team;

    console.log(`   📐 Modeling: ${awayTeam} @ ${homeTeam}`);

    // Step 1: Gather team statistics
    let homeStats = null;
    let awayStats = null;

    if (sportKey === 'basketball_nba') {
        const season = new Date(game.commence_time).getFullYear();
        const nbaSeasonYear = new Date(game.commence_time).getMonth() < 8 ? season - 1 : season;
        homeStats = await getNBATeamAdvancedStats(homeTeam, nbaSeasonYear);
        awayStats = await getNBATeamAdvancedStats(awayTeam, nbaSeasonYear);
    } else if (sportKey === 'basketball_ncaab') {
        const season = new Date(game.commence_time).getFullYear();
        const ncaabSeasonYear = new Date(game.commence_time).getMonth() < 8 ? season - 1 : season;
        homeStats = await getNCAABTeamStats(homeTeam, ncaabSeasonYear);
        awayStats = await getNCAABTeamStats(awayTeam, ncaabSeasonYear);
    } else if (sportKey === 'icehockey_nhl') {
        const season = new Date(game.commence_time).getFullYear();
        const nhlSeasonYear = new Date(game.commence_time).getMonth() < 8 ? season - 1 : season;
        homeStats = await getNHLTeamStats(homeTeam, nhlSeasonYear);
        awayStats = await getNHLTeamStats(awayTeam, nhlSeasonYear);
    }

    // Fallback to generic stats from Supabase history for any sport
    if (!homeStats) homeStats = await getGenericTeamStats(homeTeam, sportKey);
    if (!awayStats) awayStats = await getGenericTeamStats(awayTeam, sportKey);

    // Step 2: Calculate power rating differential
    let powerDiff = 0;

    if (homeStats?.netRating && awayStats?.netRating) {
        powerDiff += (homeStats.netRating - awayStats.netRating) * config.netRatingWeight;
    } else if (homeStats?.pointDifferential && awayStats?.pointDifferential) {
        powerDiff += (homeStats.pointDifferential - awayStats.pointDifferential) * config.netRatingWeight;
    }

    // Four Factors component (basketball sports)
    if (config.fourFactorsWeight > 0 && homeStats && awayStats) {
        const ffDiff = computeFourFactorsDiff(homeStats, awayStats);
        powerDiff += ffDiff * config.fourFactorsWeight;
    }

    // NCAAB ranking adjustment
    if (sportKey === 'basketball_ncaab' && config.rankingWeight) {
        const homeRank = homeStats?.apRanking || 100; // unranked = 100
        const awayRank = awayStats?.apRanking || 100;
        // Ranked teams have an edge; bigger rank gap = bigger advantage
        // Normalize: rank 1 = +2.0 points, rank 25 = +0.5, unranked = 0
        const homeRankBonus = homeRank <= 25 ? (26 - homeRank) * 0.08 : 0;
        const awayRankBonus = awayRank <= 25 ? (26 - awayRank) * 0.08 : 0;
        powerDiff += (homeRankBonus - awayRankBonus) * config.rankingWeight * 10;
    }

    // Step 3: Rest differential
    const rest = await getRestDifferential(homeTeam, awayTeam, sportKey, game.commence_time);
    const restAdjustment = rest.totalAdjustment;

    // Step 4: Calculate win probability using logistic model
    const homeWinProb = logisticWinProbability(powerDiff, config.homeAdvantage + restAdjustment);
    const awayWinProb = 1 - homeWinProb;

    // Step 5: Calculate EV for each bet type
    const homeMLEV = calculateEV(homeWinProb, parseFloat(odds.home_odds));
    const awayMLEV = calculateEV(awayWinProb, parseFloat(odds.away_odds));

    // Step 6: Project total for O/U
    const totalProjection = projectTotal(homeStats, awayStats, sportKey, game.enrichment);
    let overEV = null;
    let underEV = null;

    if (totalProjection && odds.over_point) {
        const postedTotal = parseFloat(odds.over_point);
        const diff = totalProjection.projectedTotal - postedTotal;

        const overProb = 1 / (1 + Math.exp(-0.3 * diff));
        const underProb = 1 - overProb;

        overEV = calculateEV(overProb, parseFloat(odds.over_odds));
        underEV = calculateEV(underProb, parseFloat(odds.under_odds));
    }

    // Step 7: Determine best bet (highest EV)
    const bets = [
        { type: 'moneyline', side: 'home', team: homeTeam, ev: homeMLEV, odds: parseFloat(odds.home_odds) },
        { type: 'moneyline', side: 'away', team: awayTeam, ev: awayMLEV, odds: parseFloat(odds.away_odds) },
    ];

    if (overEV) bets.push({ type: 'over', side: 'over', team: 'Over', ev: overEV, odds: parseFloat(odds.over_odds), line: parseFloat(odds.over_point) });
    if (underEV) bets.push({ type: 'under', side: 'under', team: 'Under', ev: underEV, odds: parseFloat(odds.under_odds), line: parseFloat(odds.over_point) });

    // Filter to +EV bets that exceed the sport-specific threshold
    const positiveBets = bets.filter(b => b.ev.isPositiveEV && b.ev.edge >= config.evThreshold);
    const bestBet = positiveBets.sort((a, b) => b.ev.ev - a.ev.ev)[0] || null;

    // Step 8: Classify tier based on edge size
    // REVISED: Previous thresholds (10%/6%/5%) were far too aggressive.
    // Real sports betting edges are small. A true 6%+ edge is excellent.
    // With the recalibrated logistic function, these thresholds are more honest.
    let tier = 'skip';
    if (bestBet) {
        if (bestBet.ev.edge >= 0.08) tier = 'lock';       // was 0.10 — still high bar
        else if (bestBet.ev.edge >= 0.05) tier = 'value';  // was 0.06
        else if (bestBet.ev.edge >= 0.03) tier = 'longshot'; // was 0.05 (sport evThreshold)
        // Below 3% edge → skip. The estimation error is larger than the "edge".
    }

    return {
        game_id: game.game_id,
        homeTeam,
        awayTeam,
        sportKey,
        model: {
            homeWinProb: Math.round(homeWinProb * 1000) / 1000,
            awayWinProb: Math.round(awayWinProb * 1000) / 1000,
            powerDiff: Math.round(powerDiff * 100) / 100,
            restAdjustment: Math.round(restAdjustment * 1000) / 1000,
        },
        ev: {
            homeML: homeMLEV,
            awayML: awayMLEV,
            over: overEV,
            under: underEV,
        },
        totalProjection,
        bestBet,
        tier,
        homeStats: homeStats ? { source: homeStats.source, netRating: homeStats.netRating || homeStats.pointDifferential, eFGPct: homeStats.effectiveFGPct, pace: homeStats.pace } : null,
        awayStats: awayStats ? { source: awayStats.source, netRating: awayStats.netRating || awayStats.pointDifferential, eFGPct: awayStats.effectiveFGPct, pace: awayStats.pace } : null,
    };
}

// ============================================================
// BATCH MODEL: Process all games for a sport
// ============================================================
async function modelAllGames(games) {
    console.log(`\n📐 Running probability model on ${games.length} games...`);

    const results = [];
    for (const game of games) {
        try {
            const result = await generateGameProbabilities(game);
            if (result) {
                results.push(result);
                const bestBetStr = result.bestBet
                    ? `${result.bestBet.team} ${result.bestBet.type} (edge: ${(result.bestBet.ev.edge * 100).toFixed(1)}%, EV: ${(result.bestBet.ev.ev * 100).toFixed(1)}%)`
                    : 'No +EV bet found';
                const tierEmoji = result.tier === 'lock' ? '🔒' : result.tier === 'value' ? '✅' : result.tier === 'longshot' ? '🎲' : '⏭️';
                console.log(`   ${tierEmoji} ${result.awayTeam} @ ${result.homeTeam}: ${bestBetStr}`);
            }
        } catch (e) {
            console.log(`   ⚠️ Model error for ${game.away_team} @ ${game.home_team}: ${e.message}`);
        }
    }

    const evGames = results.filter(r => r.tier !== 'skip');
    console.log(`\n📊 Model complete: ${evGames.length} +EV games out of ${results.length} modeled`);

    return results;
}

module.exports = {
    generateGameProbabilities,
    modelAllGames,
    calculateEV,
    impliedProbFromOdds,
    getNBATeamAdvancedStats,
    getNCAABTeamStats,
    getNHLTeamStats,
    SPORT_CONFIG,
};