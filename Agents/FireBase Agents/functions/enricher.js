// ============================================================
// PARLAY BOT — Game Enrichment Engine
// Enriches each game with:
//   Phase 1: Schedule fatigue (rest days, games-in-window)
//   Phase 2: Injury data (from free API)
//   Phase 3: O/U intelligence (recency-weighted scoring trends)
//   Phase 4: Line movement detection
// ============================================================
require('dotenv').config();
const { query, queryOne } = require('./db');

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
    const recentGames = await query(
        `SELECT commence_time, home_team, away_team FROM games
         WHERE sport_key = $1 AND (home_team = $2 OR away_team = $2)
         AND commence_time >= $3 AND commence_time < $4
         ORDER BY commence_time DESC`,
        [sportKey, teamName, lookback14.toISOString(), gd.toISOString()]
    );

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
    if (sportKey === 'basketball_nba') {
        return await getNBAInjuries(teamName);
    }
    if (sportKey === 'icehockey_nhl') {
        return await getNHLInjuries(teamName);
    }
    // For NCAA, MLB — Gemini handles with its training knowledge
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

// Known star players who significantly move betting lines when injured
const STAR_PLAYERS = new Set([
    // NBA
    'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo',
    'Nikola Jokic', 'Luka Doncic', 'Joel Embiid', 'Jayson Tatum',
    'Shai Gilgeous-Alexander', 'Anthony Davis', 'Damian Lillard', 'Jimmy Butler',
    'Donovan Mitchell', 'De\'Aaron Fox', 'Tyrese Haliburton', 'Paolo Banchero',
    'Trae Young', 'Devin Booker', 'Kyrie Irving', 'Karl-Anthony Towns',
    'Ja Morant', 'Anthony Edwards', 'Jalen Brunson', 'Bam Adebayo',
    'Scottie Barnes', 'Chet Holmgren', 'Victor Wembanyama', 'Lauri Markkanen',
    // NHL
    'Connor McDavid', 'Nathan MacKinnon', 'Auston Matthews', 'Nikita Kucherov',
    'Leon Draisaitl', 'Cale Makar', 'David Pastrnak', 'Kirill Kaprizov',
    'Artemi Panarin', 'Mikko Rantanen', 'Igor Shesterkin', 'Connor Hellebuyck',
    'Andrei Vasilevskiy', 'Sidney Crosby', 'Alex Ovechkin', 'Matthew Tkachuk',
    'Jack Hughes', 'Jason Robertson', 'Aleksander Barkov', 'Mika Zibanejad',
]);

function classifyPlayerImpact(athlete) {
    if (!athlete) return 'Bench';
    const name = athlete.displayName || athlete.fullName || '';
    if (STAR_PLAYERS.has(name)) return 'Star';
    // Use ESPN position data as a starter heuristic when available
    const pos = athlete.position?.abbreviation;
    if (pos && ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'LW', 'RW', 'D'].includes(pos)) {
        return 'Starter';
    }
    return 'Rotation';
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

const NHL_TEAM_SLUGS = {
    'Toronto Maple Leafs': 'tor', 'New York Rangers': 'nyr', 'Boston Bruins': 'bos',
    'Tampa Bay Lightning': 'tb', 'Florida Panthers': 'fla', 'Buffalo Sabres': 'buf',
    'Pittsburgh Penguins': 'pit', 'Philadelphia Flyers': 'phi', 'Columbus Blue Jackets': 'cbj',
    'Nashville Predators': 'nsh', 'Winnipeg Jets': 'wpg', 'Calgary Flames': 'cgy',
    'Edmonton Oilers': 'edm', 'Vancouver Canucks': 'van', 'Colorado Avalanche': 'col',
    'Dallas Stars': 'dal', 'Minnesota Wild': 'min', 'St Louis Blues': 'stl',
    'Chicago Blackhawks': 'chi', 'Detroit Red Wings': 'det', 'Los Angeles Kings': 'la',
    'Anaheim Ducks': 'ana', 'San Jose Sharks': 'sj', 'Seattle Kraken': 'sea',
    'Carolina Hurricanes': 'car', 'New Jersey Devils': 'nj', 'New York Islanders': 'nyi',
    'Washington Capitals': 'wsh', 'Montreal Canadiens': 'mtl', 'Ottawa Senators': 'ott',
    'Vegas Golden Knights': 'vgk', 'Utah Hockey Club': 'uta',
};

async function getNHLInjuries(teamName) {
    try {
        const slug = NHL_TEAM_SLUGS[teamName];
        if (!slug) return { team: teamName, injuries: [], source: 'not_found' };

        const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${slug}`;
        const response = await fetch(url);
        if (!response.ok) return { team: teamName, injuries: [], source: 'api_error' };

        const data = await response.json();
        const injuries = [];

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
        console.log(`   ⚠️ NHL injury lookup failed for ${teamName}: ${e.message}`);
        return { team: teamName, injuries: [], source: 'error' };
    }
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

    const results = await query(
        `SELECT pr.home_final_score, pr.away_final_score, pr.game_id,
                g.home_team, g.away_team, g.sport_key, g.commence_time
         FROM pick_results pr
         JOIN games g ON g.game_id = pr.game_id
         WHERE g.sport_key = $1 AND g.commence_time >= $2
         AND (g.home_team = $3 OR g.away_team = $3)`,
        [sportKey, thirtyDaysAgo.toISOString(), teamName]
    );

    if (!results || results.length === 0) {
        return { team: teamName, gamesAnalyzed: 0, overHitRate: 50, avgTotal: 0, source: 'insufficient_data' };
    }

    // Convert to the same format as API scores
    const gameRecords = results.map(r => ({
        home_team: r.home_team,
        away_team: r.away_team,
        commence_time: r.commence_time,
        scores: [
            { name: r.home_team, score: String(r.home_final_score) },
            { name: r.away_team, score: String(r.away_final_score) }
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
// Compares opening vs current odds from odds_history table
// ============================================================
async function getLineMovement(game) {
    const odds = game.odds?.[0];
    if (!odds) return null;

    // Get the EARLIEST recorded odds snapshot (opening line)
    const opening = await query(
        `SELECT * FROM odds_history WHERE game_id = $1 ORDER BY captured_at ASC LIMIT 1`,
        [game.game_id]
    );

    // Get the LATEST recorded odds snapshot (current line)
    const latest = await query(
        `SELECT * FROM odds_history WHERE game_id = $1 ORDER BY captured_at DESC LIMIT 1`,
        [game.game_id]
    );

    if (!opening?.length || !latest?.length) return null;

    // If we only have one snapshot, no movement detectable yet
    if (opening[0].id === latest[0].id) return null;

    const open = opening[0];
    const current = latest[0];

    const spreadMove = (parseFloat(current.home_point) || 0) - (parseFloat(open.home_point) || 0);
    const totalMove = (parseFloat(current.over_point) || 0) - (parseFloat(open.over_point) || 0);
    const homeMLMove = (parseFloat(current.home_odds) || 0) - (parseFloat(open.home_odds) || 0);
    const awayMLMove = (parseFloat(current.away_odds) || 0) - (parseFloat(open.away_odds) || 0);

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
        openingSpread: parseFloat(open.home_point) || 0,
        currentSpread: parseFloat(current.home_point) || 0,
        openingTotal: parseFloat(open.over_point) || 0,
        currentTotal: parseFloat(current.over_point) || 0,
    };
}

// ============================================================
// PHASE 5: NBA REFEREE CREW DATA
// Fetches referee assignments from NBA.com on game day
// Cross-references with historical foul/pace tendencies
// ============================================================
async function getNBARefereeData(gameDate) {
    try {
        const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
        const response = await fetch(url);
        if (!response.ok) return {};

        const data = await response.json();
        const games = data.scoreboard?.games || [];

        const refMap = {};
        for (const game of games) {
            const officials = game.gameLeaders?.officials || game.officials || [];

            if (officials.length > 0) {
                refMap[game.gameId] = {
                    officials: officials.map(o => ({
                        name: o.name || `${o.firstName} ${o.familyName}`,
                        jerseyNum: o.jerseyNum || o.number,
                    })),
                    crewChief: officials[0]?.name || `${officials[0]?.firstName} ${officials[0]?.familyName}`,
                    homeTeam: game.homeTeam?.teamName,
                    awayTeam: game.awayTeam?.teamName,
                };
            }
        }

        return refMap;
    } catch (e) {
        console.log(`   ⚠️ NBA referee data fetch failed: ${e.message}`);
        return {};
    }
}

// REFEREE TENDENCIES — Update monthly from these sources:
// 1. Covers.com: https://www.covers.com/sport/basketball/nba/referees
//    → O/U records and ATS records per referee
// 2. RefMetrics.com: https://www.refmetrics.com/nba/foul-leaders
//    → Foul rates, crew assignments, game-day updates
// 3. DonaghyEffect.com: https://www.donaghyeffect.com/
//    → Advanced referee modeling with pace and bias adjustments
//
// To update: scrape current-season data from the sources above and
// recalculate foulRateDeviation as (referee's avg fouls/game - league avg fouls/game)
// and overPct as (games where total went Over / total games officiated)
//
// IMPORTANT: Referee assignments are published at 9:00 AM ET on game day on NBA.com.
const REFEREE_TENDENCIES = {
    'Tony Brothers': { foulRateDeviation: +3.2, overPct: 0.56, paceTendency: 'fast' },
    'Scott Foster': { foulRateDeviation: +2.8, overPct: 0.55, paceTendency: 'fast' },
    'Marc Davis': { foulRateDeviation: +1.5, overPct: 0.53, paceTendency: 'neutral' },
    'James Capers': { foulRateDeviation: +1.2, overPct: 0.52, paceTendency: 'neutral' },
    'Ed Malloy': { foulRateDeviation: -1.8, overPct: 0.47, paceTendency: 'slow' },
    'Rodney Mott': { foulRateDeviation: -1.5, overPct: 0.46, paceTendency: 'slow' },
    'John Goble': { foulRateDeviation: -2.1, overPct: 0.45, paceTendency: 'slow' },
    'Bennie Adams': { foulRateDeviation: +2.0, overPct: 0.54, paceTendency: 'fast' },
    'Kane Fitzgerald': { foulRateDeviation: +0.5, overPct: 0.51, paceTendency: 'neutral' },
    'Tre Maddox': { foulRateDeviation: -0.8, overPct: 0.48, paceTendency: 'neutral' },
};

function getRefereeTendency(crewChief) {
    if (!crewChief) return null;
    const tendency = REFEREE_TENDENCIES[crewChief];
    if (tendency) return { crewChief, ...tendency };

    // Partial match
    const key = Object.keys(REFEREE_TENDENCIES).find(k =>
        crewChief.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().includes(crewChief.toLowerCase())
    );
    if (key) return { crewChief, ...REFEREE_TENDENCIES[key] };

    return null;
}

// ============================================================
// PHASE 6: NHL GOALIE CONFIRMATION
// Checks injury status for goaltenders via BallDontLie NHL API
// ============================================================
async function getNHLGoalieStatus(teamName) {
    try {
        const url = `https://api.balldontlie.io/nhl/v1/player_injuries`;
        const response = await fetch(url, {
            headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });

        if (!response.ok) return null;
        const data = await response.json();

        // Filter injuries for this team's goalies
        const teamNameLower = teamName.toLowerCase();
        const teamInjuries = (data.data || []).filter(inj => {
            const playerTeam = inj.player?.teams?.[0]?.full_name || inj.team?.full_name || '';
            return playerTeam.toLowerCase().includes(teamNameLower) &&
                (inj.player?.position_code === 'G' || inj.position === 'G');
        });

        if (teamInjuries.length === 0) return { team: teamName, goalieStatus: 'starter_expected', source: 'no_injuries' };

        const injuredGoalies = teamInjuries.map(inj => ({
            name: inj.player?.full_name || inj.player_name,
            status: inj.status,
            injuryType: inj.injury_type || inj.description,
            returnDate: inj.return_date,
            comment: inj.comment,
        }));

        return {
            team: teamName,
            injuredGoalies,
            goalieStatus: injuredGoalies.some(g => g.status === 'Out' || g.status === 'IR')
                ? 'starter_possibly_out' : 'day_to_day',
            source: 'balldontlie_nhl',
        };
    } catch (e) {
        return null;
    }
}

// ============================================================
// PHASE 7: WEATHER DATA (NFL + MLB outdoor venues)
// ============================================================
const OUTDOOR_NFL_VENUES = {
    'Buffalo Bills': { lat: 42.7738, lon: -78.7870 },
    'Cleveland Browns': { lat: 41.5061, lon: -81.6995 },
    'Green Bay Packers': { lat: 44.5013, lon: -88.0622 },
    'New York Giants': { lat: 40.8128, lon: -74.0742 },
    'New York Jets': { lat: 40.8128, lon: -74.0742 },
    'Chicago Bears': { lat: 41.8623, lon: -87.6167 },
    'Denver Broncos': { lat: 39.7439, lon: -105.0201 },
    'Kansas City Chiefs': { lat: 39.0489, lon: -94.4839 },
    'Miami Dolphins': { lat: 25.9580, lon: -80.2389 },
    'New England Patriots': { lat: 42.0909, lon: -71.2643 },
    'Philadelphia Eagles': { lat: 39.9008, lon: -75.1675 },
    'Pittsburgh Steelers': { lat: 40.4468, lon: -80.0158 },
    'San Francisco 49ers': { lat: 37.4033, lon: -121.9694 },
    'Seattle Seahawks': { lat: 47.5952, lon: -122.3316 },
    'Tennessee Titans': { lat: 36.1665, lon: -86.7713 },
    'Washington Commanders': { lat: 38.9076, lon: -76.8645 },
    'Baltimore Ravens': { lat: 39.2780, lon: -76.6227 },
    'Carolina Panthers': { lat: 35.2258, lon: -80.8528 },
    'Cincinnati Bengals': { lat: 39.0954, lon: -84.5160 },
    'Jacksonville Jaguars': { lat: 30.3239, lon: -81.6373 },
    'Tampa Bay Buccaneers': { lat: 27.9759, lon: -82.5033 },
};

const MLB_VENUES = {
    'New York Yankees': { lat: 40.8296, lon: -73.9262, outdoor: true },
    'New York Mets': { lat: 40.7571, lon: -73.8458, outdoor: true },
    'Boston Red Sox': { lat: 42.3467, lon: -71.0972, outdoor: true },
    'Chicago Cubs': { lat: 41.9484, lon: -87.6553, outdoor: true },
    'Chicago White Sox': { lat: 41.8299, lon: -87.6338, outdoor: true },
    'Los Angeles Dodgers': { lat: 34.0739, lon: -118.2400, outdoor: true },
    'Los Angeles Angels': { lat: 33.8003, lon: -117.8827, outdoor: true },
    'San Francisco Giants': { lat: 37.7786, lon: -122.3893, outdoor: true },
    'San Diego Padres': { lat: 32.7076, lon: -117.1570, outdoor: true },
    'Colorado Rockies': { lat: 39.7559, lon: -104.9942, outdoor: true },
    'St. Louis Cardinals': { lat: 38.6226, lon: -90.1928, outdoor: true },
    'Atlanta Braves': { lat: 33.8907, lon: -84.4677, outdoor: true },
    'Philadelphia Phillies': { lat: 39.9061, lon: -75.1665, outdoor: true },
    'Washington Nationals': { lat: 38.8730, lon: -77.0074, outdoor: true },
    'Baltimore Orioles': { lat: 39.2838, lon: -76.6216, outdoor: true },
    'Pittsburgh Pirates': { lat: 40.4468, lon: -80.0057, outdoor: true },
    'Cincinnati Reds': { lat: 39.0975, lon: -84.5063, outdoor: true },
    'Cleveland Guardians': { lat: 41.4962, lon: -81.6852, outdoor: true },
    'Detroit Tigers': { lat: 42.3390, lon: -83.0485, outdoor: true },
    'Minnesota Twins': { lat: 44.9818, lon: -93.2775, outdoor: true },
    'Kansas City Royals': { lat: 39.0517, lon: -94.4803, outdoor: true },
    'Oakland Athletics': { lat: 37.7516, lon: -122.2005, outdoor: true },
    // Indoor/retractable: Houston, Miami, Milwaukee, Seattle, Toronto, Tampa Bay, Texas, Arizona
};

async function getWeatherForGame(homeTeam, sportKey, gameTime) {
    if (!process.env.OPENWEATHER_API_KEY) return null;

    let venue = null;
    if (sportKey === 'americanfootball_nfl') {
        venue = OUTDOOR_NFL_VENUES[homeTeam];
    } else if (sportKey === 'baseball_mlb') {
        const mlbVenue = MLB_VENUES[homeTeam];
        if (mlbVenue?.outdoor) venue = mlbVenue;
    }

    if (!venue) return null;

    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${venue.lat}&lon=${venue.lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();

        // Find forecast closest to game time
        const gameTimeMs = new Date(gameTime).getTime();
        let closest = null;
        let closestDiff = Infinity;

        for (const forecast of (data.list || [])) {
            const diff = Math.abs(forecast.dt * 1000 - gameTimeMs);
            if (diff < closestDiff) {
                closestDiff = diff;
                closest = forecast;
            }
        }

        if (!closest) return null;

        const temp = Math.round(closest.main?.temp || 0);
        const windSpeed = Math.round(closest.wind?.speed || 0);
        const windGust = Math.round(closest.wind?.gust || 0);
        const description = closest.weather?.[0]?.description || '';
        const precipitation = closest.pop || 0;

        const signals = [];
        if (windSpeed >= 15) signals.push(`High wind (${windSpeed} mph) — impacts passing/kicking, leans Under`);
        if (windGust >= 25) signals.push(`Wind gusts to ${windGust} mph — significant impact on outdoor play`);
        if (temp <= 32) signals.push(`Freezing conditions (${temp}°F) — ball handling affected, leans Under`);
        if (temp <= 20) signals.push(`Extreme cold (${temp}°F) — major impact on performance`);
        if (precipitation >= 0.5) signals.push(`${Math.round(precipitation * 100)}% chance of precipitation — affects footing and ball control`);
        if (description.includes('rain') || description.includes('snow')) signals.push(`${description} expected — wet conditions favor Under`);

        return {
            temperature: temp,
            windSpeed,
            windGust,
            description,
            precipitationChance: Math.round(precipitation * 100),
            signals,
            impactLevel: signals.length >= 2 ? 'high' : signals.length === 1 ? 'moderate' : 'minimal',
        };
    } catch (e) {
        console.log(`   ⚠️ Weather fetch failed for ${homeTeam}: ${e.message}`);
        return null;
    }
}

// ============================================================
// MASTER ENRICHMENT FUNCTION
// Enriches all games for a given sport with all available data
// ============================================================
async function enrichGames(games) {
    console.log(`   🔍 Enriching ${games.length} games with fatigue, injuries, O/U trends, line movement, refs, goalies, weather...`);

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

    // Fetch sport-specific enrichment data

    // NBA referee data (one call covers all games)
    let refereeMap = {};
    if (sportKey === 'basketball_nba') {
        try {
            refereeMap = await getNBARefereeData(games[0].commence_time);
        } catch (e) {
            console.log(`   ⚠️ Referee fetch failed: ${e.message}`);
        }
    }

    // NHL goalie status cache
    const goalieCache = {};
    if (sportKey === 'icehockey_nhl') {
        for (const team of teams) {
            try {
                goalieCache[team] = await getNHLGoalieStatus(team);
            } catch (e) { /* optional */ }
        }
    }

    // Enrich each game
    for (const game of games) {
        const lineMovement = await getLineMovement(game);

        const enrichmentData = {
            homeFatigue: fatigueCache[game.home_team] || null,
            awayFatigue: fatigueCache[game.away_team] || null,
            homeInjuries: injuryCache[game.home_team] || null,
            awayInjuries: injuryCache[game.away_team] || null,
            homeOUTrends: ouCache[game.home_team] || null,
            awayOUTrends: ouCache[game.away_team] || null,
            lineMovement,
        };

        // NBA: Add referee data
        if (sportKey === 'basketball_nba' && Object.keys(refereeMap).length > 0) {
            // Match by team names
            const refEntry = Object.values(refereeMap).find(r =>
                game.home_team.includes(r.homeTeam) || r.homeTeam?.includes(game.home_team.split(' ').pop()) ||
                game.away_team.includes(r.awayTeam) || r.awayTeam?.includes(game.away_team.split(' ').pop())
            );
            if (refEntry) {
                const tendency = getRefereeTendency(refEntry.crewChief);
                enrichmentData.refereeData = {
                    officials: refEntry.officials,
                    crewChief: refEntry.crewChief,
                    tendency,
                };
            }
        }

        // NHL: Add goalie status
        if (sportKey === 'icehockey_nhl') {
            enrichmentData.homeGoalie = goalieCache[game.home_team] || null;
            enrichmentData.awayGoalie = goalieCache[game.away_team] || null;
        }

        // NFL/MLB: Add weather data for outdoor venues
        if (sportKey === 'americanfootball_nfl' || sportKey === 'baseball_mlb') {
            try {
                enrichmentData.weather = await getWeatherForGame(game.home_team, sportKey, game.commence_time);
            } catch (e) { /* optional */ }
        }

        enriched.push({
            ...game,
            enrichment: enrichmentData,
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


    // Referee Data (NBA)
    if (e.refereeData) {
        text += '\n  👨‍⚖️ REFEREE CREW:';
        text += `\n    Crew Chief: ${e.refereeData.crewChief}`;
        if (e.refereeData.officials) {
            text += ` | Full crew: ${e.refereeData.officials.map(o => o.name).join(', ')}`;
        }
        if (e.refereeData.tendency) {
            const t = e.refereeData.tendency;
            text += `\n    Tendency: ${t.paceTendency} pace, foul rate ${t.foulRateDeviation > 0 ? '+' : ''}${t.foulRateDeviation} vs avg`;
            text += `, Over hit rate: ${Math.round(t.overPct * 100)}%`;
            if (t.foulRateDeviation > 2) text += ` ⚠️ HIGH-FOUL CREW — lean Over`;
            if (t.foulRateDeviation < -1.5) text += ` ⚠️ LOW-FOUL CREW — lean Under`;
        }
    }

    // Goalie Status (NHL)
    if (e.homeGoalie || e.awayGoalie) {
        text += '\n  🥅 GOALIE STATUS:';
        if (e.homeGoalie) {
            text += `\n    ${game.home_team}: ${e.homeGoalie.goalieStatus}`;
            if (e.homeGoalie.injuredGoalies?.length > 0) {
                text += ` — Injured: ${e.homeGoalie.injuredGoalies.map(g => `${g.name} (${g.status})`).join(', ')}`;
            }
        }
        if (e.awayGoalie) {
            text += `\n    ${game.away_team}: ${e.awayGoalie.goalieStatus}`;
            if (e.awayGoalie.injuredGoalies?.length > 0) {
                text += ` — Injured: ${e.awayGoalie.injuredGoalies.map(g => `${g.name} (${g.status})`).join(', ')}`;
            }
        }
    }

    // Weather (NFL/MLB outdoor)
    if (e.weather) {
        text += `\n  🌤️ WEATHER: ${e.weather.temperature}°F, wind ${e.weather.windSpeed} mph, ${e.weather.description}`;
        text += ` (precip: ${e.weather.precipitationChance}%, impact: ${e.weather.impactLevel})`;
        for (const signal of (e.weather.signals || [])) {
            text += `\n    ⚠️ ${signal}`;
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
    getLineMovement,
    getNBARefereeData,
    getRefereeTendency,
    getNHLGoalieStatus,
    getWeatherForGame,
};
