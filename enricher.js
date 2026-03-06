// ============================================================
// PARLAY BOT — Game Enrichment Engine
// Enriches each game with:
//   Phase 1: Schedule fatigue (rest days, games-in-window)
//   Phase 2: Injury data (from free API)
//   Phase 3: O/U intelligence (recency-weighted scoring trends)
//   Phase 4: Line movement detection
// ============================================================
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// ============================================================
// PHASE 1: SCHEDULE FATIGUE
// Uses existing games table to calculate rest and fatigue
// ============================================================
async function getScheduleFatigue(teamName, sportKey, gameDate) {
    const gd = new Date(gameDate);
    const lookback14 = new Date(gd);
    lookback14.setDate(lookback14.getDate() - 14);

    // Find all games this team played in the last 14 days
    const { data: recentGames } = await supabase
        .from('games')
        .select('commence_time, home_team, away_team')
        .eq('sport_key', sportKey)
        .or(`home_team.eq.${teamName},away_team.eq.${teamName}`)
        .gte('commence_time', lookback14.toISOString())
        .lt('commence_time', gd.toISOString())
        .order('commence_time', { ascending: false });

    if (!recentGames || recentGames.length === 0) {
        return {
            team: teamName,
            daysSinceLastGame: null,
            gamesLast5Days: 0,
            gamesLast7Days: 0,
            gamesLast14Days: 0,
            isBackToBack: false,
            homeAwayStreak: 'unknown',
            fatigueRating: '🟢 Fresh',
            fatigueScore: 0   // 0 = fresh, 100 = exhausted
        };
    }

    // Days since last game
    const lastGameDate = new Date(recentGames[0].commence_time);
    const daysSinceLast = Math.floor((gd - lastGameDate) / (1000 * 60 * 60 * 24));
    const isBackToBack = daysSinceLast <= 1;

    // Games in windows
    const daysAgo = (d) => Math.floor((gd - new Date(d)) / (1000 * 60 * 60 * 24));
    const gamesLast5 = recentGames.filter(g => daysAgo(g.commence_time) <= 5).length;
    const gamesLast7 = recentGames.filter(g => daysAgo(g.commence_time) <= 7).length;
    const gamesLast14 = recentGames.length;

    // Home/away streak for this team
    let homeAwayStreak = '';
    let streakCount = 0;
    let streakType = null;
    for (const g of recentGames.slice(0, 5)) {
        const isHome = g.home_team === teamName;
        const type = isHome ? 'home' : 'away';
        if (streakType === null) {
            streakType = type;
            streakCount = 1;
        } else if (type === streakType) {
            streakCount++;
        } else {
            break;
        }
    }
    homeAwayStreak = streakCount > 1 ? `${streakCount} ${streakType} in a row` : '';

    // Calculate fatigue score (0-100)
    let fatigueScore = 0;
    if (isBackToBack) fatigueScore += 35;
    else if (daysSinceLast <= 1) fatigueScore += 25;

    if (gamesLast5 >= 4) fatigueScore += 30;
    else if (gamesLast5 >= 3) fatigueScore += 20;
    else if (gamesLast5 >= 2) fatigueScore += 10;

    if (gamesLast7 >= 5) fatigueScore += 20;
    else if (gamesLast7 >= 4) fatigueScore += 10;

    if (streakCount >= 4 && streakType === 'away') fatigueScore += 15;

    fatigueScore = Math.min(fatigueScore, 100);

    let fatigueRating;
    if (fatigueScore >= 50) fatigueRating = '🔴 Fatigued';
    else if (fatigueScore >= 25) fatigueRating = '🟡 Normal';
    else fatigueRating = '🟢 Fresh';

    return {
        team: teamName,
        daysSinceLastGame: daysSinceLast,
        gamesLast5Days: gamesLast5,
        gamesLast7Days: gamesLast7,
        gamesLast14Days: gamesLast14,
        isBackToBack,
        homeAwayStreak,
        fatigueRating,
        fatigueScore
    };
}

// ============================================================
// PHASE 2: INJURY DATA
// Fetches injury reports from free APIs
// ============================================================
async function getInjuryReport(teamName, sportKey) {
    // Use balldontlie.io for NBA injuries
    // For other sports, we rely on Gemini's training knowledge
    if (sportKey === 'basketball_nba') {
        return await getNBAInjuries(teamName);
    }
    // For NCAA, NHL, MLB — Gemini handles with its own knowledge
    return { team: teamName, injuries: [], source: 'ai_knowledge' };
}

async function getNBAInjuries(teamName) {
    try {
        // Use the free NBA injury endpoint
        const url = `https://cdn.nba.com/static/json/liveData/odds/odds_todaysGames.json`;
        // Fallback: Try ESPN's public injury feed
        const espnTeamSlug = teamNameToESPNSlug(teamName);
        if (!espnTeamSlug) return { team: teamName, injuries: [], source: 'not_found' };

        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamSlug}`;
        const response = await fetch(espnUrl);

        if (!response.ok) {
            return { team: teamName, injuries: [], source: 'api_error' };
        }

        const data = await response.json();
        const injuries = [];

        // ESPN team response includes injuries in the team data
        if (data.team?.injuries) {
            for (const inj of data.team.injuries) {
                injuries.push({
                    player: inj.athlete?.displayName || 'Unknown',
                    status: inj.status || 'Unknown',
                    detail: inj.type?.description || inj.details?.detail || '',
                    impact: classifyPlayerImpact(inj.athlete)
                });
            }
        }

        return { team: teamName, injuries, source: 'espn' };
    } catch (e) {
        console.log(`   ⚠️ Injury lookup failed for ${teamName}: ${e.message}`);
        return { team: teamName, injuries: [], source: 'error' };
    }
}

function classifyPlayerImpact(athlete) {
    // Simple heuristic — could be enhanced with stats
    if (!athlete) return 'Bench';
    // ESPN doesn't always provide position ranking, so we classify simply
    return 'Rotation'; // Default to rotation, Gemini can further assess
}

const NBA_TEAM_SLUGS = {
    'Atlanta Hawks': 'atl', 'Boston Celtics': 'bos', 'Brooklyn Nets': 'bkn',
    'Charlotte Hornets': 'cha', 'Chicago Bulls': 'chi', 'Cleveland Cavaliers': 'cle',
    'Dallas Mavericks': 'dal', 'Denver Nuggets': 'den', 'Detroit Pistons': 'det',
    'Golden State Warriors': 'gs', 'Houston Rockets': 'hou', 'Indiana Pacers': 'ind',
    'Los Angeles Clippers': 'lac', 'Los Angeles Lakers': 'lal', 'LA Clippers': 'lac',
    'Memphis Grizzlies': 'mem', 'Miami Heat': 'mia', 'Milwaukee Bucks': 'mil',
    'Minnesota Timberwolves': 'min', 'New Orleans Pelicans': 'no', 'New York Knicks': 'ny',
    'Oklahoma City Thunder': 'okc', 'Orlando Magic': 'orl', 'Philadelphia 76ers': 'phi',
    'Phoenix Suns': 'phx', 'Portland Trail Blazers': 'por', 'Sacramento Kings': 'sac',
    'San Antonio Spurs': 'sa', 'Toronto Raptors': 'tor', 'Utah Jazz': 'uta',
    'Washington Wizards': 'wsh'
};

function teamNameToESPNSlug(teamName) {
    return NBA_TEAM_SLUGS[teamName] || null;
}

// ============================================================
// PHASE 3: OVER/UNDER INTELLIGENCE (Recency-Weighted)
// Fetches completed scores and calculates O/U trends
// ============================================================
async function getOUTrends(teamName, sportKey) {
    // Fetch completed games with scores from The-Odds-API
    try {
        const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`);
        url.searchParams.append('apiKey', ODDS_API_KEY);
        url.searchParams.append('daysFrom', '3');  // API max lookback
        url.searchParams.append('dateFormat', 'iso');

        const response = await fetch(url.toString());
        if (!response.ok) return getOUFromDB(teamName, sportKey);

        const scores = await response.json();
        const completed = scores.filter(s => s.completed);

        // Find games involving this team
        const teamGames = completed.filter(g =>
            g.home_team === teamName || g.away_team === teamName
        );

        if (teamGames.length === 0) return getOUFromDB(teamName, sportKey);

        return calculateOUStats(teamGames, teamName);
    } catch (e) {
        console.log(`   ⚠️ O/U API lookup failed for ${teamName}, using DB fallback`);
        return getOUFromDB(teamName, sportKey);
    }
}

async function getOUFromDB(teamName, sportKey) {
    // Fallback: use our pick_results + games tables
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: results } = await supabase
        .from('pick_results')
        .select('home_final_score, away_final_score, game_id, games!inner(home_team, away_team, sport_key, commence_time)')
        .eq('games.sport_key', sportKey)
        .gte('games.commence_time', thirtyDaysAgo.toISOString())
        .or(`games.home_team.eq.${teamName},games.away_team.eq.${teamName}`);

    if (!results || results.length === 0) {
        return { team: teamName, gamesAnalyzed: 0, overHitRate: 50, avgTotal: 0, source: 'insufficient_data' };
    }

    // Convert to the same format as API scores
    const gameRecords = results.map(r => ({
        home_team: r.games.home_team,
        away_team: r.games.away_team,
        commence_time: r.games.commence_time,
        scores: [
            { name: r.games.home_team, score: String(r.home_final_score) },
            { name: r.games.away_team, score: String(r.away_final_score) }
        ]
    }));

    return calculateOUStats(gameRecords, teamName);
}

function calculateOUStats(games, teamName) {
    // Sort by date (most recent first)
    games.sort((a, b) => new Date(b.commence_time) - new Date(a.commence_time));

    // Recency weighting: last 5 = 3x, last 10 = 2x, rest = 1x
    let weightedTotalSum = 0;
    let weightSum = 0;
    const totals = [];

    for (let i = 0; i < games.length; i++) {
        const g = games[i];
        const homeScore = parseInt(g.scores?.find(s => s.name === g.home_team)?.score) || 0;
        const awayScore = parseInt(g.scores?.find(s => s.name === g.away_team)?.score) || 0;
        const total = homeScore + awayScore;

        let weight;
        if (i < 5) weight = 3;       // Last 5 games: heavy weight
        else if (i < 10) weight = 2;  // Games 6-10: medium weight
        else weight = 1;              // Games 11+: base weight

        weightedTotalSum += total * weight;
        weightSum += weight;
        totals.push(total);
    }

    const weightedAvgTotal = weightSum > 0 ? weightedTotalSum / weightSum : 0;
    const simpleAvgTotal = totals.length > 0
        ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;

    // Calculate team's points per game (recent weighted)
    let weightedPPG = 0;
    let ppgWeightSum = 0;
    for (let i = 0; i < games.length; i++) {
        const g = games[i];
        const teamScore = parseInt(g.scores?.find(s => s.name === teamName)?.score) || 0;
        const weight = i < 5 ? 3 : i < 10 ? 2 : 1;
        weightedPPG += teamScore * weight;
        ppgWeightSum += weight;
    }
    const avgTeamPPG = ppgWeightSum > 0 ? weightedPPG / ppgWeightSum : 0;

    // Recent form: last 5 games trend (going up or down?)
    const last5Totals = totals.slice(0, 5);
    const older5Totals = totals.slice(5, 10);
    const recentAvg = last5Totals.length > 0 ? last5Totals.reduce((a, b) => a + b, 0) / last5Totals.length : 0;
    const olderAvg = older5Totals.length > 0 ? older5Totals.reduce((a, b) => a + b, 0) / older5Totals.length : 0;
    const scoringTrend = recentAvg > olderAvg ? 'Trending UP' : recentAvg < olderAvg ? 'Trending DOWN' : 'Stable';

    return {
        team: teamName,
        gamesAnalyzed: games.length,
        weightedAvgTotal: Math.round(weightedAvgTotal * 10) / 10,
        simpleAvgTotal: Math.round(simpleAvgTotal * 10) / 10,
        avgTeamPPG: Math.round(avgTeamPPG * 10) / 10,
        scoringTrend,
        recentAvg: Math.round(recentAvg * 10) / 10,
        source: 'calculated'
    };
}

// ============================================================
// PHASE 4: LINE MOVEMENT DETECTION
// Stores opening odds and detects significant movement
// ============================================================
async function getLineMovement(game) {
    const odds = game.odds?.[0];
    if (!odds) return null;

    // Check if we have a previously stored opening line
    const { data: history } = await supabase
        .from('odds')
        .select('home_odds, away_odds, home_point, away_point, over_point, under_point, updated_at')
        .eq('game_id', game.game_id)
        .order('updated_at', { ascending: true })
        .limit(1);

    if (!history || history.length === 0) return null;

    const opening = history[0];
    const current = odds;

    const spreadMove = (parseFloat(current.home_point) || 0) - (parseFloat(opening.home_point) || 0);
    const totalMove = (parseFloat(current.over_point) || 0) - (parseFloat(opening.over_point) || 0);
    const homeMLMove = (parseFloat(current.home_odds) || 0) - (parseFloat(opening.home_odds) || 0);
    const awayMLMove = (parseFloat(current.away_odds) || 0) - (parseFloat(opening.away_odds) || 0);

    const signals = [];
    if (Math.abs(spreadMove) >= 1.5) {
        signals.push(`Spread moved ${spreadMove > 0 ? '+' : ''}${spreadMove} pts${spreadMove > 0 ? ' (away getting more points)' : ' (home favored more)'}`);
    }
    if (Math.abs(totalMove) >= 1.5) {
        signals.push(`O/U moved ${totalMove > 0 ? '+' : ''}${totalMove} pts (toward ${totalMove > 0 ? 'Over' : 'Under'})`);
    }
    if (Math.abs(homeMLMove) >= 30) {
        signals.push(`Home ML shifted ${homeMLMove > 0 ? '+' : ''}${homeMLMove} (${homeMLMove > 0 ? 'less favored' : 'more favored'})`);
    }

    return {
        spreadMovement: spreadMove,
        totalMovement: totalMove,
        homeMLMovement: homeMLMove,
        awayMLMovement: awayMLMove,
        significantMovement: signals.length > 0,
        signals,
        openingSpread: parseFloat(opening.home_point) || 0,
        currentSpread: parseFloat(current.home_point) || 0,
        openingTotal: parseFloat(opening.over_point) || 0,
        currentTotal: parseFloat(current.over_point) || 0,
    };
}

// ============================================================
// MASTER ENRICHMENT FUNCTION
// Enriches all games for a given sport with all available data
// ============================================================
async function enrichGames(games) {
    console.log(`   🔍 Enriching ${games.length} games with fatigue, injuries, O/U trends, line movement...`);

    const enriched = [];
    // Collect unique teams for batch queries
    const teams = new Set();
    for (const g of games) {
        teams.add(g.home_team);
        teams.add(g.away_team);
    }

    // Build a cache of fatigue data per team
    const fatigueCache = {};
    const injuryCache = {};
    const ouCache = {};

    for (const team of teams) {
        const sportKey = games[0].sport_key;
        const gameDate = games[0].commence_time;

        fatigueCache[team] = await getScheduleFatigue(team, sportKey, gameDate);
        injuryCache[team] = await getInjuryReport(team, sportKey);
    }

    // O/U trends — one API call per sport (not per team)
    const sportKey = games[0].sport_key;
    try {
        const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/scores`);
        url.searchParams.append('apiKey', ODDS_API_KEY);
        url.searchParams.append('daysFrom', '3');
        url.searchParams.append('dateFormat', 'iso');

        const response = await fetch(url.toString());
        if (response.ok) {
            const scores = await response.json();
            const completed = scores.filter(s => s.completed);

            for (const team of teams) {
                const teamGames = completed.filter(g =>
                    g.home_team === team || g.away_team === team
                );
                ouCache[team] = teamGames.length > 0
                    ? calculateOUStats(teamGames, team)
                    : { team, gamesAnalyzed: 0, source: 'insufficient_data' };
            }
        }
    } catch (e) {
        console.log(`   ⚠️ O/U scores fetch failed: ${e.message}`);
    }

    // Enrich each game
    for (const game of games) {
        const lineMovement = await getLineMovement(game);

        enriched.push({
            ...game,
            enrichment: {
                homeFatigue: fatigueCache[game.home_team] || null,
                awayFatigue: fatigueCache[game.away_team] || null,
                homeInjuries: injuryCache[game.home_team] || null,
                awayInjuries: injuryCache[game.away_team] || null,
                homeOUTrends: ouCache[game.home_team] || null,
                awayOUTrends: ouCache[game.away_team] || null,
                lineMovement
            }
        });
    }

    // Summary
    const fatigued = Object.values(fatigueCache).filter(f => f.fatigueScore >= 50).length;
    const injured = Object.values(injuryCache).filter(i => i.injuries?.length > 0).length;
    const ouData = Object.values(ouCache).filter(o => o.gamesAnalyzed > 0).length;
    console.log(`   ✅ Enrichment complete: ${fatigued} fatigued teams, ${injured} teams with injuries, ${ouData} teams with O/U data`);

    return enriched;
}

// ============================================================
// FORMAT ENRICHMENT FOR PROMPT
// Converts enrichment data into human-readable text for Gemini
// ============================================================
function formatEnrichmentForPrompt(game) {
    const e = game.enrichment;
    if (!e) return '';

    let text = '';

    // Fatigue
    if (e.homeFatigue || e.awayFatigue) {
        text += '\n  📊 FATIGUE:';
        if (e.homeFatigue) {
            const f = e.homeFatigue;
            const rest = f.daysSinceLastGame !== null ? `${f.daysSinceLastGame} day${f.daysSinceLastGame !== 1 ? 's' : ''} rest` : 'unknown rest';
            text += `\n    ${game.home_team}: ${rest}, ${f.gamesLast5Days} games in 5 days, ${f.gamesLast7Days} in 7 days ${f.fatigueRating}`;
            if (f.isBackToBack) text += ` ⚠️ BACK-TO-BACK`;
            if (f.homeAwayStreak) text += ` (${f.homeAwayStreak})`;
        }
        if (e.awayFatigue) {
            const f = e.awayFatigue;
            const rest = f.daysSinceLastGame !== null ? `${f.daysSinceLastGame} day${f.daysSinceLastGame !== 1 ? 's' : ''} rest` : 'unknown rest';
            text += `\n    ${game.away_team}: ${rest}, ${f.gamesLast5Days} games in 5 days, ${f.gamesLast7Days} in 7 days ${f.fatigueRating}`;
            if (f.isBackToBack) text += ` ⚠️ BACK-TO-BACK`;
            if (f.homeAwayStreak) text += ` (${f.homeAwayStreak})`;
        }
    }

    // Injuries
    if (e.homeInjuries?.injuries?.length > 0 || e.awayInjuries?.injuries?.length > 0) {
        text += '\n  🏥 INJURIES:';
        if (e.homeInjuries?.injuries?.length > 0) {
            const injs = e.homeInjuries.injuries.map(i => `${i.player} (${i.status}${i.detail ? ' - ' + i.detail : ''})`).join(', ');
            text += `\n    ${game.home_team}: ${injs}`;
        } else {
            text += `\n    ${game.home_team}: No reported injuries`;
        }
        if (e.awayInjuries?.injuries?.length > 0) {
            const injs = e.awayInjuries.injuries.map(i => `${i.player} (${i.status}${i.detail ? ' - ' + i.detail : ''})`).join(', ');
            text += `\n    ${game.away_team}: ${injs}`;
        } else {
            text += `\n    ${game.away_team}: No reported injuries`;
        }
    }

    // O/U Trends (recency-weighted)
    if ((e.homeOUTrends?.gamesAnalyzed > 0) || (e.awayOUTrends?.gamesAnalyzed > 0)) {
        const ouLine = parseFloat(game.odds?.[0]?.over_point) || 0;
        text += '\n  📈 O/U TRENDS (Recency-Weighted):';

        if (e.homeOUTrends?.gamesAnalyzed > 0) {
            const o = e.homeOUTrends;
            const edge = ouLine > 0 ? (o.weightedAvgTotal - ouLine).toFixed(1) : 'N/A';
            text += `\n    ${game.home_team}: avg total ${o.weightedAvgTotal} (${o.gamesAnalyzed} games), ${o.avgTeamPPG} PPG, ${o.scoringTrend}`;
            if (ouLine > 0) text += `, edge vs line: ${edge > 0 ? '+' : ''}${edge}`;
        }
        if (e.awayOUTrends?.gamesAnalyzed > 0) {
            const o = e.awayOUTrends;
            const edge = ouLine > 0 ? (o.weightedAvgTotal - ouLine).toFixed(1) : 'N/A';
            text += `\n    ${game.away_team}: avg total ${o.weightedAvgTotal} (${o.gamesAnalyzed} games), ${o.avgTeamPPG} PPG, ${o.scoringTrend}`;
            if (ouLine > 0) text += `, edge vs line: ${edge > 0 ? '+' : ''}${edge}`;
        }
    }

    // Line Movement
    if (e.lineMovement?.significantMovement) {
        text += '\n  📉 LINE MOVEMENT:';
        for (const signal of e.lineMovement.signals) {
            text += `\n    ${signal}`;
        }
    }

    return text;
}

module.exports = {
    enrichGames,
    formatEnrichmentForPrompt,
    getScheduleFatigue,
    getInjuryReport,
    getOUTrends,
    getLineMovement
};
