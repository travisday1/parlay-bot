// ============================================================
// PARLAY BOT — Dynamic Frontend (Powered by Supabase)
// Fetches live games, odds, AI picks, and recommended parlays
// from the Supabase database instead of hardcoded arrays.
// ============================================================

// ===== SUPABASE CLIENT =====
const SUPABASE_URL = 'https://civkjfswgtvjxxqquxqb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdmtqZnN3Z3R2anh4cXF1eHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjAzMTcsImV4cCI6MjA4ODMzNjMxN30.3ZB2UwBLXjXY8KPZGAo1vLs39_rhzZ6Jt4l_MhuSwhs';

// Try CDN supabase, fallback
let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.warn('Supabase client not loaded, falling back to REST API');
}

// ===== STATE =====
let GAMES = [];
let RECOMMENDED_PARLAYS = [];
let selectedPicks = [];
let authenticated = false;
let dataLoaded = false;
let activeConfFilters = new Set(); // multi-select confidence filter: 'lock', 'lean', 'tossup'

// ===== PASSWORD =====
const SITE_PASSWORD = 'parlay2026';

// ===== LEAGUE CONFIG =====
const LEAGUE_MAP = {
    'basketball_nba': { id: 'nba', icon: '🏀', label: 'NBA' },
    'basketball_ncaab': { id: 'ncaab', icon: '🏀', label: 'NCAAB' },
    'icehockey_nhl': { id: 'nhl', icon: '🏒', label: 'NHL' },
    'americanfootball_nfl': { id: 'nfl', icon: '🏈', label: 'NFL' },
    'baseball_mlb': { id: 'mlb', icon: '⚾', label: 'MLB' },
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Set dynamic date
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateEl = document.getElementById('header-date');
    if (dateEl) dateEl.textContent = dateStr;
    document.title = `Parlay Bot | ${dateStr}`;

    checkAuth();
});

// ===== AUTH =====
function checkAuth() {
    const stored = sessionStorage.getItem('parlay_auth');
    if (stored === 'true') { authenticated = true; showApp(); }
}

function attemptLogin() {
    const input = document.getElementById('pw-input');
    const error = document.getElementById('pw-error');
    if (input.value === SITE_PASSWORD) {
        authenticated = true;
        sessionStorage.setItem('parlay_auth', 'true');
        showApp();
    } else {
        error.style.display = 'block';
        input.value = '';
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
    }
}

async function showApp() {
    document.getElementById('password-gate').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';

    // Load data from Supabase
    await loadLiveData();

    renderFilterBar();
    renderGames();
    renderRecommendedParlays();
}

// ===== DATA LOADING FROM SUPABASE =====
async function loadLiveData() {
    try {
        const now = new Date();

        // Use UTC date for picks/parlays (analyzer stores in UTC)
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const todayUTC = `${utcYear}-${utcMonth}-${utcDay}`;

        // Also get local date in case picks were stored in local TZ
        const localYear = now.getFullYear();
        const localMonth = String(now.getMonth() + 1).padStart(2, '0');
        const localDay = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${localYear}-${localMonth}-${localDay}`;

        // Fetch games — look from 6 hours ago to 48 hours ahead
        const lookBack = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const lookAhead = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        // Fetch games with their odds
        const { data: games, error: gamesError } = await sb
            .from('games')
            .select('*, odds(*)')
            .gte('commence_time', lookBack.toISOString())
            .lte('commence_time', lookAhead.toISOString())
            .order('commence_time', { ascending: true });

        if (gamesError) throw gamesError;

        // Fetch daily picks for today (try both UTC and local dates)
        const { data: picksUTC, error: picksError } = await sb
            .from('daily_picks')
            .select('*')
            .eq('pick_date', todayUTC);

        if (picksError) throw picksError;

        let picks = picksUTC;
        if ((!picks || picks.length === 0) && todayLocal !== todayUTC) {
            const { data: picksLocal } = await sb
                .from('daily_picks')
                .select('*')
                .eq('pick_date', todayLocal);
            if (picksLocal && picksLocal.length > 0) picks = picksLocal;
        }

        // Fetch recommended parlays for today (try both dates)
        const { data: parlaysUTC, error: parlaysError } = await sb
            .from('recommended_parlays')
            .select('*')
            .eq('parlay_date', todayUTC);

        if (parlaysError) throw parlaysError;

        let parlays = parlaysUTC;
        if ((!parlays || parlays.length === 0) && todayLocal !== todayUTC) {
            const { data: parlaysLocal } = await sb
                .from('recommended_parlays')
                .select('*')
                .eq('parlay_date', todayLocal);
            if (parlaysLocal && parlaysLocal.length > 0) parlays = parlaysLocal;
        }

        if (parlaysError) throw parlaysError;

        // Transform data into frontend format
        GAMES = transformGames(games, picks);
        RECOMMENDED_PARLAYS = transformParlays(parlays);
        dataLoaded = true;

        console.log(`✅ Loaded ${GAMES.length} games, ${picks?.length || 0} picks, ${RECOMMENDED_PARLAYS.length} parlays from Supabase`);

        // Remove loading spinner
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'none';

        // Update "Last Updated" timestamp
        if (games && games.length > 0) {
            const latestUpdate = games.reduce((latest, g) => {
                const t = new Date(g.updated_at || g.created_at || 0);
                return t > latest ? t : latest;
            }, new Date(0));
            const lastUpdEl = document.getElementById('last-updated-time');
            if (lastUpdEl) {
                lastUpdEl.textContent = latestUpdate.toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                });
            }
        }

        // Load performance tracker data (default: last 7 days)
        const { startDate, endDate } = getDateRange(7);
        refreshPerformance(startDate, endDate);

    } catch (error) {
        console.error('❌ Error loading data from Supabase:', error);
        // Show error state
        const grid = document.getElementById('games-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="loading-state">
                    <p>⚠️ Unable to load live data. Please check your connection.</p>
                    <p style="font-size: 0.8rem; opacity: 0.6;">Error: ${error.message}</p>
                </div>
            `;
        }
    }
}

function transformGames(games, picks) {
    // Only include games from leagues we support
    const supportedGames = games.filter(game => LEAGUE_MAP[game.sport_key]);
    return supportedGames.map(game => {
        const leagueInfo = LEAGUE_MAP[game.sport_key] || { id: game.sport_key, icon: '🏟️', label: game.sport_title || game.sport_key };
        const odds = game.odds?.[0] || {};

        // Find any pick for this game
        const pick = picks?.find(p => p.game_id === game.game_id);

        // Determine spread favorite
        const homeSpread = odds.home_point || 0;
        const awaySpread = odds.away_point || 0;
        const spreadFavTeam = homeSpread < 0 ? abbreviate(game.home_team) : abbreviate(game.away_team);
        const spreadFavValue = Math.min(homeSpread, awaySpread);

        // === INDEPENDENT CONFIDENCE CALCULATION ===
        // Each bet type gets its own realistic probability

        // 1. MONEYLINE: Use implied probability from the actual odds
        //    -800 → ~89%, -150 → ~60%, +130 → ~43%, +300 → ~25%
        function impliedProb(americanOdds) {
            if (!americanOdds || americanOdds === 0) return 50;
            if (americanOdds < 0) return Math.round(Math.abs(americanOdds) / (Math.abs(americanOdds) + 100) * 100);
            return Math.round(100 / (americanOdds + 100) * 100);
        }

        let homeMLConf = impliedProb(homeML);
        let awayMLConf = impliedProb(awayML);

        // If AI picked a team on the moneyline, blend AI confidence with implied odds
        if (pick && (pick.pick_type === 'moneyline')) {
            if (pick.picked_team === game.home_team) {
                homeMLConf = Math.round((homeMLConf + pickConf) / 2); // blend implied + AI
                awayMLConf = 100 - homeMLConf;
            } else if (pick.picked_team === game.away_team) {
                awayMLConf = Math.round((awayMLConf + pickConf) / 2);
                homeMLConf = 100 - awayMLConf;
            }
        }

        // 2. SPREAD: AI's confidence that each team covers the spread
        //    When AI directly picks spread → use its confidence
        //    When AI picks ML → derive spread confidence (covering a spread is harder than winning outright)
        //    Formula: compress the AI's ML edge toward 50%: spreadConf = 50 + (mlConf - 50) * 0.35
        //    Examples: 80% ML → ~60% spread, 65% ML → ~55% spread, 50% ML → 50% spread
        let homeSpreadConf, awaySpreadConf;

        if (pick && pick.pick_type === 'spread') {
            // AI directly analyzed the spread — use its confidence
            if (pick.picked_team === game.home_team) {
                homeSpreadConf = pickConf;
                awaySpreadConf = 100 - pickConf;
            } else if (pick.picked_team === game.away_team) {
                awaySpreadConf = pickConf;
                homeSpreadConf = 100 - pickConf;
            } else {
                homeSpreadConf = 52;
                awaySpreadConf = 48;
            }
        } else {
            // Derive from AI's ML confidence — compress edge toward 50%
            homeSpreadConf = Math.round(50 + (homeMLConf - 50) * 0.35);
            awaySpreadConf = Math.round(50 + (awayMLConf - 50) * 0.35);
        }
        // Use the favorite's spread confidence as the primary "spread" confidence
        const spreadConf = homeSpread < 0 ? homeSpreadConf : awaySpreadConf;

        // 3. OVER/UNDER: AI's confidence on the total
        //    When AI directly picks O/U → use its confidence
        //    Otherwise → derive from implied odds with slight adjustment
        let overConf, underConf;
        const overOddsVal = odds.over_odds || -110;
        const underOddsVal = odds.under_odds || -110;

        if (pick && pick.pick_type === 'over') {
            overConf = pickConf;
            underConf = 100 - pickConf;
        } else if (pick && pick.pick_type === 'under') {
            underConf = pickConf;
            overConf = 100 - pickConf;
        } else {
            // No AI O/U pick — use implied probability from the odds
            overConf = impliedProb(overOddsVal);
            underConf = impliedProb(underOddsVal);
        }

        const gameTime = new Date(game.commence_time).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
        }) + ' ET';

        return {
            id: game.game_id,
            league: leagueInfo.id,
            time: gameTime,
            away: { name: shortName(game.away_team), abbr: abbreviate(game.away_team), record: '', city: cityName(game.away_team) },
            home: { name: shortName(game.home_team), abbr: abbreviate(game.home_team), record: '', city: cityName(game.home_team) },
            spread: { team: spreadFavTeam, value: spreadFavValue, odds: -110 },
            overUnder: {
                total: odds.over_point || 0,
                overOdds: odds.over_odds || -110,
                underOdds: odds.under_odds || -110
            },
            moneyline: { away: awayML, home: homeML },
            confidence: {
                awayML: awayMLConf,
                homeML: homeMLConf,
                spread: spreadConf,
                spreadHome: homeSpreadConf,
                spreadAway: awaySpreadConf,
                over: overConf,
                under: underConf,
            },
            pick: pick ? {
                team: abbreviate(pick.picked_team),
                type: pick.pick_type.toUpperCase(),
                reason: pick.rationale || 'AI analysis pending.'
            } : {
                team: homeMLConf > awayMLConf ? abbreviate(game.home_team) : abbreviate(game.away_team),
                type: 'ML',
                reason: 'No detailed AI analysis available for this game yet.'
            },
            injuries: buildIntelItems(pick, game),
            tier: pick?.tier || 'skip',
        };
    });
}

function buildIntelItems(pick, game) {
    const items = [];
    if (pick) {
        if (pick.tier === 'lock') {
            items.push({ icon: '🔒', text: `LOCK — ${pick.confidence}% AI confidence on ${pick.picked_team}` });
        } else if (pick.tier === 'value') {
            items.push({ icon: '💰', text: `VALUE PLAY — ${pick.confidence}% confidence on ${pick.picked_team}` });
        } else if (pick.tier === 'longshot') {
            items.push({ icon: '🎲', text: `LONG SHOT — ${pick.confidence}% confidence, high payoff potential` });
        }
        if (pick.rationale) {
            items.push({ icon: '🎯', text: pick.rationale });
        }
    } else {
        items.push({ icon: '📊', text: `${game.away_team} @ ${game.home_team}` });
    }
    return items;
}

function transformParlays(parlays) {
    if (!parlays || parlays.length === 0) return [];

    const tierOrder = { 'safe': 0, 'value': 1, 'longshot': 2 };
    const tierBadge = { 'safe': 'Highest Confidence', 'value': 'Best Value', 'longshot': 'High Risk / High Reward' };
    const tierName = { 'safe': '🔒 The Safe Bag', 'value': '⚡ The Value Play', 'longshot': '🎲 The Big Swing' };
    const tierClass = { 'safe': 'lock', 'value': 'strong', 'longshot': 'value' };

    // Helper: look up real confidence from GAMES array by matching team name + bet type + game
    function lookupConfidence(legTeam, legOdds, legGame) {
        const raw = (legTeam || '').toLowerCase().trim();
        const gameStr = (legGame || '').toLowerCase().trim();

        // Detect bet type from the leg label
        const isSpread = raw.includes('spread') || raw.includes('pts');
        const isOver = raw.startsWith('over') || raw.includes(' over');
        const isUnder = raw.startsWith('under') || raw.includes(' under');
        const isOUPick = isOver || isUnder;

        // Strip bet-type suffixes from the team name for matching
        const cleanTeam = raw
            .replace(/\s*(ml|moneyline|spread|pts|over|under)\s*/gi, '')
            .replace(/[+\-]\d+(\.\d+)?/g, '')
            .trim();

        // First, try to find the exact game using the leg.game field (e.g. "Away @ Home")
        // This is the most reliable match since it contains both team names
        let matchedGame = null;
        if (gameStr) {
            for (const game of GAMES) {
                const homeName = game.home.name.toLowerCase();
                const awayName = game.away.name.toLowerCase();
                const homeCity = (game.home.city || '').toLowerCase();
                const awayCity = (game.away.city || '').toLowerCase();
                const homeAbbr = game.home.abbr.toLowerCase();
                const awayAbbr = game.away.abbr.toLowerCase();

                // Check if both teams from the game description appear in this GAMES entry
                const homeMatch = gameStr.includes(homeName) || gameStr.includes(homeCity) || gameStr.includes(homeAbbr);
                const awayMatch = gameStr.includes(awayName) || gameStr.includes(awayCity) || gameStr.includes(awayAbbr);

                if (homeMatch && awayMatch) {
                    matchedGame = game;
                    break;
                }
                // Also try partial: "@ Kent State" or "Kent State @"
                if (gameStr.includes(homeName) || gameStr.includes(awayName)) {
                    matchedGame = game;
                    break;
                }
            }
        }

        // If no game matched by game string, try finding by team name only
        if (!matchedGame) {
            for (const game of GAMES) {
                const homeName = game.home.name.toLowerCase();
                const awayName = game.away.name.toLowerCase();
                const homeCity = (game.home.city || '').toLowerCase();
                const awayCity = (game.away.city || '').toLowerCase();

                if (cleanTeam && (homeName.includes(cleanTeam) || cleanTeam.includes(homeName) ||
                    awayName.includes(cleanTeam) || cleanTeam.includes(awayName) ||
                    (homeCity && cleanTeam.includes(homeCity)) ||
                    (awayCity && cleanTeam.includes(awayCity)))) {
                    matchedGame = game;
                    break;
                }
            }
        }

        if (!matchedGame) return null;

        // Now determine which side of the game this pick is for
        if (isOUPick) {
            return isOver ? (matchedGame.confidence.over || 50) : (matchedGame.confidence.under || 50);
        }

        const homeName = matchedGame.home.name.toLowerCase();
        const homeCity = (matchedGame.home.city || '').toLowerCase();
        const awayName = matchedGame.away.name.toLowerCase();
        const awayCity = (matchedGame.away.city || '').toLowerCase();

        const isHome = cleanTeam.includes(homeName) || homeName.includes(cleanTeam) ||
            (homeCity && cleanTeam.includes(homeCity));
        const isAway = cleanTeam.includes(awayName) || awayName.includes(cleanTeam) ||
            (awayCity && cleanTeam.includes(awayCity));

        if (isHome) {
            if (isSpread) return matchedGame.confidence.spreadHome || matchedGame.confidence.spread || 52;
            return matchedGame.confidence.homeML;
        }
        if (isAway) {
            if (isSpread) return matchedGame.confidence.spreadAway || matchedGame.confidence.spread || 52;
            return matchedGame.confidence.awayML;
        }

        // Fallback: return the higher confidence (the AI's pick)
        return Math.max(matchedGame.confidence.homeML, matchedGame.confidence.awayML);
    }

    return parlays
        .sort((a, b) => (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99))
        .map(p => ({
            name: p.name || tierName[p.tier] || p.tier,
            tier: tierClass[p.tier] || p.tier,
            badge: tierBadge[p.tier] || p.tier,
            legs: (p.legs || []).map(leg => {
                const teamName = leg.picked_team || leg.team || '?';
                const realConf = lookupConfidence(teamName, leg.odds, leg.game);
                return {
                    team: teamName,
                    odds: leg.odds || -110,
                    conf: realConf !== null ? realConf : (leg.confidence || p.confidence || 50),
                    game: leg.game || '',
                };
            }),
            rationale: p.rationale || 'AI-generated parlay combination.',
        }));
}

// ===== HELPER FUNCTIONS =====
function abbreviate(teamName) {
    if (!teamName) return '?';
    // Common abbreviations
    const abbrevMap = {
        'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'New York Knicks': 'NYK',
        'Philadelphia 76ers': 'PHI', 'Toronto Raptors': 'TOR', 'Chicago Bulls': 'CHI',
        'Cleveland Cavaliers': 'CLE', 'Detroit Pistons': 'DET', 'Indiana Pacers': 'IND',
        'Milwaukee Bucks': 'MIL', 'Atlanta Hawks': 'ATL', 'Charlotte Hornets': 'CHA',
        'Miami Heat': 'MIA', 'Orlando Magic': 'ORL', 'Washington Wizards': 'WAS',
        'Dallas Mavericks': 'DAL', 'Houston Rockets': 'HOU', 'Memphis Grizzlies': 'MEM',
        'New Orleans Pelicans': 'NOP', 'San Antonio Spurs': 'SAS', 'Denver Nuggets': 'DEN',
        'Minnesota Timberwolves': 'MIN', 'Oklahoma City Thunder': 'OKC', 'Portland Trail Blazers': 'POR',
        'Utah Jazz': 'UTA', 'Golden State Warriors': 'GSW', 'LA Clippers': 'LAC',
        'Los Angeles Lakers': 'LAL', 'Phoenix Suns': 'PHX', 'Sacramento Kings': 'SAC',
        // NHL
        'Toronto Maple Leafs': 'TOR', 'New York Rangers': 'NYR', 'Boston Bruins': 'BOS',
        'Tampa Bay Lightning': 'TBL', 'Florida Panthers': 'FLA', 'Buffalo Sabres': 'BUF',
        'Pittsburgh Penguins': 'PIT', 'Philadelphia Flyers': 'PHI', 'Columbus Blue Jackets': 'CBJ',
        'Nashville Predators': 'NSH', 'Winnipeg Jets': 'WPG', 'Calgary Flames': 'CGY',
        'Edmonton Oilers': 'EDM', 'Vancouver Canucks': 'VAN', 'Colorado Avalanche': 'COL',
        'Dallas Stars': 'DAL', 'Minnesota Wild': 'MIN', 'St Louis Blues': 'STL',
        'Chicago Blackhawks': 'CHI', 'Detroit Red Wings': 'DET', 'Los Angeles Kings': 'LAK',
        'Anaheim Ducks': 'ANA', 'San Jose Sharks': 'SJS', 'Seattle Kraken': 'SEA',
        'Carolina Hurricanes': 'CAR', 'New Jersey Devils': 'NJD', 'New York Islanders': 'NYI',
        'Washington Capitals': 'WSH', 'Montreal Canadiens': 'MTL', 'Ottawa Senators': 'OTT',
        // Soccer
        'Bayern Munich': 'BAY', 'Real Madrid': 'RMA', 'FC Barcelona': 'BAR',
        'Manchester City': 'MCI', 'Manchester United': 'MUN', 'Liverpool': 'LIV',
        'Arsenal': 'ARS', 'Chelsea': 'CHE', 'Tottenham Hotspur': 'TOT',
        'Inter Milan': 'INT', 'AC Milan': 'MIL', 'Juventus': 'JUV',
        'Borussia Dortmund': 'BVB', 'Atletico Madrid': 'ATM',
    };
    if (abbrevMap[teamName]) return abbrevMap[teamName];
    // Fallback: take first 3 letters of last word
    const words = teamName.split(' ');
    return words[words.length - 1].substring(0, 3).toUpperCase();
}

function shortName(teamName) {
    if (!teamName) return '?';
    const words = teamName.split(' ');
    return words[words.length - 1]; // Last word (e.g., "Celtics", "Knicks")
}

function cityName(teamName) {
    if (!teamName) return '?';
    const words = teamName.split(' ');
    if (words.length <= 1) return teamName;
    return words.slice(0, -1).join(' '); // Everything except last word
}

// ===== RENDER GAMES =====
function renderGames() {
    const grid = document.getElementById('games-grid');
    if (GAMES.length === 0 && dataLoaded) {
        grid.innerHTML = '<div class="loading-state"><p>No games scheduled for today. Check back later!</p></div>';
        return;
    }
    grid.innerHTML = GAMES.map(game => createGameCard(game)).join('');

    // Update tier counters on confidence filter buttons
    updateTierCounters();

    // Apply confidence filter after rendering
    applyConfidenceFilter();
}

function getConfidenceClass(conf) {
    if (conf >= 75) return 'conf-high';
    if (conf >= 55) return 'conf-med';
    return 'conf-low';
}

function getConfidenceLabel(conf) {
    if (conf >= 85) return '🔒';
    if (conf >= 70) return '✅';
    if (conf >= 55) return '👍';
    return '⚠️';
}

function getOverallConfidence(game) {
    return Math.max(game.confidence.awayML, game.confidence.homeML);
}

function getOverallConfidenceTag(game) {
    const c = getOverallConfidence(game);
    if (game.tier === 'lock' || c >= 85) return { label: '🔒 LOCK', cls: 'lock' };
    if (game.tier === 'value' || c >= 65) return { label: '✅ LEAN', cls: 'lean' };
    if (game.tier === 'longshot') return { label: '🎲 LONGSHOT', cls: 'tossup' };
    return { label: '⚠️ TOSS-UP', cls: 'tossup' };
}

function createGameCard(game) {
    const isNHL = game.league === 'nhl';
    const isSoccer = game.league === 'mls';
    const spreadLabel = isNHL ? 'Puck Line' : isSoccer ? 'Handicap' : 'Spread';
    const ouLabel = isNHL ? 'O/U Goals' : isSoccer ? 'O/U Goals' : 'O/U Points';
    const tag = getOverallConfidenceTag(game);

    const awayMLSel = isPickSelected(game.id, 'awayML');
    const homeMLSel = isPickSelected(game.id, 'homeML');
    const spreadFavSel = isPickSelected(game.id, 'spreadFav');
    const spreadDogSel = isPickSelected(game.id, 'spreadDog');
    const overSel = isPickSelected(game.id, 'over');
    const underSel = isPickSelected(game.id, 'under');

    const favTeam = game.spread.team;
    const dogTeam = favTeam === game.away.abbr ? game.home.abbr : game.away.abbr;
    const dogValue = -game.spread.value;
    const dogSpreadConf = 100 - game.confidence.spread;

    return `
        <div class="game-card" data-league="${game.league}" data-id="${game.id}">
            <div class="game-card-top">
                <span class="league-tag ${game.league}">${game.league.toUpperCase()}</span>
                <span class="confidence-badge ${tag.cls}">${tag.label}</span>
                <span class="game-time">${game.time}</span>
            </div>
            
            <div class="game-matchup">
                <div class="teams-row">
                    <div class="team">
                        <div class="team-name">${game.away.city}</div>
                        <div class="team-name" style="font-size: 1.2rem;">${game.away.name}</div>
                        <div class="team-record">${game.away.record}</div>
                    </div>
                    <div class="vs-badge">@</div>
                    <div class="team">
                        <div class="team-name">${game.home.city}</div>
                        <div class="team-name" style="font-size: 1.2rem;">${game.home.name}</div>
                        <div class="team-record">${game.home.record}</div>
                    </div>
                </div>
                
                <div class="odds-row">
                    <div class="odds-cell">
                        <div class="odds-cell-label">${spreadLabel}</div>
                        <div class="odds-cell-value">${game.spread.team} ${game.spread.value}</div>
                    </div>
                    <div class="odds-cell">
                        <div class="odds-cell-label">${ouLabel}</div>
                        <div class="odds-cell-value">${game.overUnder.total}</div>
                    </div>
                    <div class="odds-cell">
                        <div class="odds-cell-label">ML Fav</div>
                        <div class="odds-cell-value">${formatOdds(Math.min(game.moneyline.away, game.moneyline.home))}</div>
                    </div>
                </div>
            </div>
            
            <div class="intel-section">
                <div class="intel-items">
                    ${game.injuries.map(inj => `
                        <div class="intel-item">
                            <span class="intel-icon">${inj.icon}</span>
                            <span>${inj.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- PICK BUTTONS: ML / SPREAD / O-U -->
            <div class="pick-section-group">
                <div class="pick-row-label">Moneyline</div>
                <div class="pick-row">
                    <button class="pick-btn ${awayMLSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'awayML', '${game.away.abbr} ML', ${game.moneyline.away}, ${game.confidence.awayML})">
                        <div class="pick-btn-team">${game.away.abbr}</div>
                        <div class="pick-btn-odds">${formatOdds(game.moneyline.away)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.awayML)}">${getConfidenceLabel(game.confidence.awayML)} ${game.confidence.awayML}%</div>
                    </button>
                    <button class="pick-btn ${homeMLSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'homeML', '${game.home.abbr} ML', ${game.moneyline.home}, ${game.confidence.homeML})">
                        <div class="pick-btn-team">${game.home.abbr}</div>
                        <div class="pick-btn-odds">${formatOdds(game.moneyline.home)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.homeML)}">${getConfidenceLabel(game.confidence.homeML)} ${game.confidence.homeML}%</div>
                    </button>
                </div>
                
                <div class="pick-row-label">${spreadLabel}</div>
                <div class="pick-row">
                    <button class="pick-btn ${spreadFavSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'spreadFav', '${favTeam} ${game.spread.value}', ${game.spread.odds}, ${game.confidence.spread})">
                        <div class="pick-btn-team">${favTeam} ${game.spread.value}</div>
                        <div class="pick-btn-odds">${formatOdds(game.spread.odds)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.spread)}">${getConfidenceLabel(game.confidence.spread)} ${game.confidence.spread}%</div>
                    </button>
                    <button class="pick-btn ${spreadDogSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'spreadDog', '${dogTeam} +${dogValue}', -110, ${dogSpreadConf})">
                        <div class="pick-btn-team">${dogTeam} +${dogValue}</div>
                        <div class="pick-btn-odds">-110</div>
                        <div class="pick-conf ${getConfidenceClass(dogSpreadConf)}">${getConfidenceLabel(dogSpreadConf)} ${dogSpreadConf}%</div>
                    </button>
                </div>
                
                <div class="pick-row-label">Total ${isNHL || isSoccer ? 'Goals' : 'Points'}</div>
                <div class="pick-row">
                    <button class="pick-btn ${overSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'over', 'O${game.overUnder.total}', ${game.overUnder.overOdds}, ${game.confidence.over})">
                        <div class="pick-btn-team">OVER</div>
                        <div class="pick-btn-odds">${game.overUnder.total} (${formatOdds(game.overUnder.overOdds)})</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.over)}">${getConfidenceLabel(game.confidence.over)} ${game.confidence.over}%</div>
                    </button>
                    <button class="pick-btn ${underSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'under', 'U${game.overUnder.total}', ${game.overUnder.underOdds}, ${game.confidence.under})">
                        <div class="pick-btn-team">UNDER</div>
                        <div class="pick-btn-odds">${game.overUnder.total} (${formatOdds(game.overUnder.underOdds)})</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.under)}">${getConfidenceLabel(game.confidence.under)} ${game.confidence.under}%</div>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ===== RENDER RECOMMENDED PARLAYS =====
function renderRecommendedParlays() {
    const container = document.getElementById('recommended-parlays');
    if (RECOMMENDED_PARLAYS.length === 0) {
        container.innerHTML = '<div class="loading-state"><p>No recommended parlays available yet. Check back soon!</p></div>';
        return;
    }
    container.innerHTML = RECOMMENDED_PARLAYS.map(parlay => {
        const { combinedDecimal, payout } = calculateParlayOdds(parlay.legs.map(l => l.odds));
        const overallConf = calculateOverallConfidence(parlay.legs.map(l => l.conf));

        return `
            <div class="rec-card tier-${parlay.tier}">
                <div class="rec-header">
                    <div class="rec-title">${parlay.name}</div>
                    <span class="rec-badge ${parlay.tier}">${parlay.badge}</span>
                </div>
                <div class="rec-legs">
                    ${parlay.legs.map(leg => `
                        <div class="rec-leg">
                            <span class="rec-leg-team">${leg.team}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="pick-conf-inline ${getConfidenceClass(leg.conf)}">${leg.conf}%</span>
                                <span class="rec-leg-odds">${formatOdds(leg.odds)} · ${leg.game}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="rec-footer">
                    <div class="rec-payout">
                        <span class="rec-payout-label">$100 Payout</span>
                        <span class="rec-payout-value">$${payout.toFixed(2)}</span>
                    </div>
                    <div class="rec-payout">
                        <span class="rec-payout-label">Combined Odds</span>
                        <span class="stat-value" style="font-size: 1rem;">${combinedDecimal.toFixed(2)}x</span>
                    </div>
                    <div class="rec-payout">
                        <span class="rec-payout-label">Parlay Confidence</span>
                        <span class="stat-value ${getConfidenceClass(overallConf)}" style="font-size: 1rem;">${overallConf}%</span>
                    </div>
                </div>
            <div class="rec-rationale">${parlay.rationale}</div>
                <button class="rec-add-parlay-btn" onclick="addRecommendedToParlay(${JSON.stringify(parlay.legs).replace(/"/g, '&quot;')}, '${parlay.name}')">
                    ➕ Add to My Parlay
                </button>
            </div>
        `;
    }).join('');
}

// ===== ADD RECOMMENDED PARLAY TO MY PARLAY =====
function addRecommendedToParlay(legs, parlayName) {
    legs.forEach(leg => {
        const exists = selectedPicks.some(p => p.label === leg.team && p.odds === leg.odds);
        if (!exists) {
            selectedPicks.push({
                gameId: leg.game || leg.team,
                betType: 'homeML',
                label: leg.team,
                odds: leg.odds,
                confidence: leg.conf
            });
        }
    });

    updateParlayUI();
    renderGames();

    // Open sidebar to show the picks
    const sidebar = document.getElementById('parlay-sidebar');
    if (sidebar && !sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

// ===== PARLAY BUILDER LOGIC =====
function togglePick(gameId, betType, label, odds, confidence) {
    const existingIndex = selectedPicks.findIndex(p => p.gameId === gameId && p.betType === betType);

    if (existingIndex >= 0) {
        selectedPicks.splice(existingIndex, 1);
    } else {
        if (betType === 'over') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'under'));
        } else if (betType === 'under') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'over'));
        }
        if (betType === 'awayML') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'homeML'));
        } else if (betType === 'homeML') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'awayML'));
        }
        if (betType === 'spreadFav') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'spreadDog'));
        } else if (betType === 'spreadDog') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'spreadFav'));
        }

        selectedPicks.push({ gameId, betType, label, odds, confidence });
    }

    updateParlayUI();
    renderGames();
}

function isPickSelected(gameId, betType) {
    return selectedPicks.some(p => p.gameId === gameId && p.betType === betType);
}

function removePick(gameId, betType) {
    selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === betType));
    updateParlayUI();
    renderGames();
}

function clearParlay() {
    selectedPicks = [];
    updateParlayUI();
    renderGames();
}

function calculateOverallConfidence(confidences) {
    if (confidences.length === 0) return 0;
    const combined = confidences.reduce((acc, c) => acc * (c / 100), 1);
    return Math.round(combined * 100);
}

function updateParlayUI() {
    // Sidebar elements
    const picksContainer = document.getElementById('sidebar-picks');
    const legCount = document.getElementById('sidebar-leg-count');
    const combinedOddsEl = document.getElementById('sidebar-combined-odds');
    const payoutEl = document.getElementById('sidebar-payout');
    const confEl = document.getElementById('sidebar-confidence');
    const confBar = document.getElementById('sidebar-conf-fill');
    const navBadge = document.getElementById('nav-leg-badge');

    // Update nav badge
    if (navBadge) {
        if (selectedPicks.length > 0) {
            navBadge.style.display = 'flex';
            navBadge.textContent = selectedPicks.length;
        } else {
            navBadge.style.display = 'none';
        }
    }

    if (selectedPicks.length === 0) {
        if (picksContainer) picksContainer.innerHTML = '<p class="empty-slip">Click picks on game cards to build your parlay</p>';
        if (legCount) legCount.textContent = '0 legs';
        if (combinedOddsEl) combinedOddsEl.textContent = '—';
        if (payoutEl) payoutEl.textContent = '—';
        if (confEl) confEl.textContent = '—';
        if (confBar) { confBar.style.width = '0%'; confBar.className = 'conf-bar-fill'; }
        updateSidebarTierCounts();
        return;
    }

    if (legCount) legCount.textContent = `${selectedPicks.length} leg${selectedPicks.length > 1 ? 's' : ''}`;

    if (picksContainer) {
        picksContainer.innerHTML = selectedPicks.map(pick => {
            // Determine bet type badge
            let betLabel, badgeClass;
            if (pick.betType === 'homeML' || pick.betType === 'awayML') {
                betLabel = 'ML'; badgeClass = 'badge-ml';
            } else if (pick.betType === 'spreadFav' || pick.betType === 'spreadDog') {
                betLabel = 'PTS'; badgeClass = 'badge-pts';
            } else {
                betLabel = 'O/U'; badgeClass = 'badge-ou';
            }

            // Determine tier for chip coloring
            const conf = pick.confidence || 0;
            let chipClass, tierEmoji;
            if (conf >= 75) { chipClass = 'chip-lock'; tierEmoji = '\ud83d\udd12'; }
            else if (conf >= 60) { chipClass = 'chip-lean'; tierEmoji = '\u2705'; }
            else { chipClass = 'chip-tossup'; tierEmoji = '\u26a0\ufe0f'; }

            return `
            <div class="sidebar-pick-chip ${chipClass}">
                <span>
                    ${tierEmoji}
                    <span class="bet-type-badge ${badgeClass}">${betLabel}</span>
                    ${pick.label} (${formatOdds(pick.odds)}) \u00b7 ${pick.confidence}%
                </span>
                <span class="remove-pick" onclick="removePick('${pick.gameId}', '${pick.betType}')">✕</span>
            </div>
        `;
        }).join('');
    }

    const { combinedDecimal, payout } = calculateParlayOdds(selectedPicks.map(p => p.odds));
    const overallConf = calculateOverallConfidence(selectedPicks.map(p => p.confidence));

    if (combinedOddsEl) combinedOddsEl.textContent = `${combinedDecimal.toFixed(3)}x`;
    if (payoutEl) payoutEl.textContent = `$${payout.toFixed(2)}`;
    if (confEl) { confEl.textContent = `${overallConf}%`; confEl.className = `stat-value ${getConfidenceClass(overallConf)}`; }
    if (confBar) { confBar.style.width = `${overallConf}%`; confBar.className = `conf-bar-fill ${getConfidenceClass(overallConf)}`; }

    updateSidebarTierCounts();
}

// ===== PARLAY MATH =====
function americanToDecimal(odds) {
    if (odds > 0) return 1 + (odds / 100);
    return 1 + (100 / Math.abs(odds));
}

function calculateParlayOdds(oddsArray) {
    const combinedDecimal = oddsArray.reduce((acc, odds) => acc * americanToDecimal(odds), 1);
    return { combinedDecimal, payout: 100 * combinedDecimal };
}

function formatOdds(odds) {
    return odds > 0 ? `+${odds}` : `${odds}`;
}

// ===== CONFIDENCE FILTER =====
function toggleConfFilter(filter) {
    if (filter === 'all') {
        // 'All' clears specific filters
        activeConfFilters.clear();
    } else {
        // Toggle specific filter
        if (activeConfFilters.has(filter)) {
            activeConfFilters.delete(filter);
        } else {
            activeConfFilters.add(filter);
        }
    }

    // Update button states
    document.querySelectorAll('.conf-filter-btn').forEach(btn => {
        const f = btn.dataset.filter;
        if (f === 'all') {
            btn.classList.toggle('active', activeConfFilters.size === 0);
        } else {
            btn.classList.toggle('active', activeConfFilters.has(f));
        }
    });

    applyConfidenceFilter();
}

function applyConfidenceFilter() {
    // If no specific filters active, show all
    if (activeConfFilters.size === 0) {
        document.querySelectorAll('.game-card').forEach(card => {
            card.classList.remove('conf-hidden');
        });
        return;
    }

    // Check each card's confidence tag against active filters
    document.querySelectorAll('.game-card').forEach(card => {
        const badge = card.querySelector('.confidence-badge');
        if (!badge) return;

        const cls = badge.classList;
        let cardTier = 'tossup';
        if (cls.contains('lock')) cardTier = 'lock';
        else if (cls.contains('lean')) cardTier = 'lean';

        // Also respect the league filter — don't unhide league-filtered cards
        const isLeagueHidden = card.classList.contains('hidden');

        if (activeConfFilters.has(cardTier)) {
            card.classList.remove('conf-hidden');
        } else {
            card.classList.add('conf-hidden');
        }
    });
}

// ===== PARLAY LEG MIXER =====
function updateBuilderTotal() {
    const locks = parseInt(document.getElementById('mixer-locks')?.value || 0);
    const leans = parseInt(document.getElementById('mixer-leans')?.value || 0);
    const tossups = parseInt(document.getElementById('mixer-tossups')?.value || 0);
    const total = locks + leans + tossups;

    const btn = document.getElementById('mixer-gen-btn');
    if (btn) btn.disabled = total < 2;
}

function generateMixedParlay() {
    const locks = parseInt(document.getElementById('mixer-locks')?.value || 0);
    const leans = parseInt(document.getElementById('mixer-leans')?.value || 0);
    const tossups = parseInt(document.getElementById('mixer-tossups')?.value || 0);
    const total = locks + leans + tossups;

    if (total < 2) return;

    // Categorize all available picks by confidence tier
    const lockGames = GAMES.filter(g => {
        const tag = getOverallConfidenceTag(g);
        return tag.cls === 'lock';
    });
    const leanGames = GAMES.filter(g => {
        const tag = getOverallConfidenceTag(g);
        return tag.cls === 'lean';
    });
    const tossupGames = GAMES.filter(g => {
        const tag = getOverallConfidenceTag(g);
        return tag.cls === 'tossup';
    });

    // Shuffle and pick from each tier
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const pickFromTier = (games, count) => shuffle(games).slice(0, count);

    const selectedLocks = pickFromTier(lockGames, locks);
    const selectedLeans = pickFromTier(leanGames, leans);
    const selectedTossups = pickFromTier(tossupGames, tossups);

    const allSelected = [...selectedLocks, ...selectedLeans, ...selectedTossups];

    // Build suggestion display
    const container = document.getElementById('mixer-suggestion-area');
    if (!container) return;

    if (allSelected.length < total) {
        container.innerHTML = `
            <div class="builder-suggestion">
                <div class="builder-suggestion-title">⚠️ Not enough games available</div>
                <p style="color: var(--text-secondary); font-size: 0.85rem;">
                    Available: ${lockGames.length} locks, ${leanGames.length} leans, ${tossupGames.length} toss-ups.
                    Requested: ${locks} locks, ${leans} leans, ${tossups} toss-ups.
                </p>
            </div>`;
        return;
    }

    // For each game, pick the best bet (highest confidence pick)
    const legs = allSelected.map(game => {
        const tag = getOverallConfidenceTag(game);
        // Pick the moneyline favorite (highest confidence)
        const bestConf = Math.max(game.confidence.homeML, game.confidence.awayML);
        const bestTeam = game.confidence.homeML >= game.confidence.awayML
            ? game.home.abbr : game.away.abbr;
        const bestOdds = game.confidence.homeML >= game.confidence.awayML
            ? game.moneyline.home : game.moneyline.away;
        return {
            team: bestTeam,
            odds: bestOdds,
            confidence: bestConf,
            tier: tag.cls,
            betType: game.confidence.homeML >= game.confidence.awayML ? 'homeML' : 'awayML',
            game: `${game.away.abbr} @ ${game.home.abbr}`,
            gameId: game.id
        };
    });

    const { combinedDecimal, payout } = calculateParlayOdds(legs.map(l => l.odds));
    const overallConf = calculateOverallConfidence(legs.map(l => l.confidence));

    const chipClass = tier => tier === 'lock' ? 'chip-lock' : tier === 'lean' ? 'chip-lean' : 'chip-tossup';
    const tierEmoji = tier => tier === 'lock' ? '🔒' : tier === 'lean' ? '✅' : '⚠️';

    container.innerHTML = `
        <div class="builder-suggestion">
            <div class="builder-suggestion-title">🎯 Suggested ${total}-Leg Parlay</div>
            <div class="builder-suggestion-picks">
                ${legs.map(leg => `
                    <div class="sidebar-pick-chip ${chipClass(leg.tier)}" 
                         onclick="togglePick('${leg.gameId}', '${leg.betType}', '${leg.team}', ${leg.odds}, ${leg.confidence})">
                        <span>
                            ${tierEmoji(leg.tier)}
                            <span class="bet-type-badge badge-ml">ML</span>
                            ${leg.team} (${formatOdds(leg.odds)}) · ${leg.confidence}%
                        </span>
                    </div>
                `).join('')}
            </div>
            <div class="builder-odds-total">
                Combined: <strong>${combinedDecimal.toFixed(2)}x</strong> · 
                $100 pays <strong>$${payout.toFixed(2)}</strong> · 
                Parlay confidence: <strong>${overallConf}%</strong>
            </div>
        </div>`;
}

// ===== LEAGUE FILTER BAR =====
function renderFilterBar() {
    const bar = document.getElementById('filter-bar');

    // Build dynamic league list from actual data
    const leaguesInData = new Set(GAMES.map(g => g.league));
    const allLeagues = [{ id: 'all', icon: '', label: 'All Games' }];

    for (const [sportKey, info] of Object.entries(LEAGUE_MAP)) {
        if (leaguesInData.has(info.id)) {
            allLeagues.push(info);
        }
    }

    bar.innerHTML = allLeagues.map(league => {
        const count = league.id === 'all'
            ? GAMES.length
            : GAMES.filter(g => g.league === league.id).length;
        const label = `${league.icon || ''} ${league.label} (${count})`.trim();
        return `<button class="filter-btn ${league.id === 'all' ? 'active' : ''}" 
                        data-filter="${league.id}" 
                        onclick="filterGames('${league.id}')"
                        ${count === 0 && league.id !== 'all' ? 'style="opacity:0.4;"' : ''}>
                    ${label}
                </button>`;
    }).join('');
}

// ===== LEAGUE FILTER =====
function filterGames(league) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === league);
    });
    document.querySelectorAll('.game-card').forEach(card => {
        if (league === 'all' || card.dataset.league === league) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// ===== PERFORMANCE TRACKER =====
let currentPerfRange = 7;

async function loadPerformanceData(startDate, endDate) {
    try {
        // Query pick_results joined with daily_picks to get tier info
        const { data: results, error } = await sb
            .from('pick_results')
            .select('*, daily_picks!inner(tier, pick_date, picked_odds, pick_type, picked_team, confidence)')
            .gte('daily_picks.pick_date', startDate)
            .lte('daily_picks.pick_date', endDate);

        if (error) {
            console.error('Error loading performance data:', error);
            // Fallback: try querying separately
            return await loadPerformanceFallback(startDate, endDate);
        }

        return results || [];
    } catch (e) {
        console.error('Performance data error:', e);
        return [];
    }
}

async function loadPerformanceFallback(startDate, endDate) {
    // Fallback: query both tables and join client-side
    const { data: picks } = await sb
        .from('daily_picks')
        .select('id, tier, pick_date, picked_odds')
        .gte('pick_date', startDate)
        .lte('pick_date', endDate);

    if (!picks || picks.length === 0) return [];

    const pickIds = picks.map(p => p.id);
    const { data: results } = await sb
        .from('pick_results')
        .select('*')
        .in('pick_id', pickIds);

    if (!results) return [];

    // Join them
    const pickMap = {};
    picks.forEach(p => { pickMap[p.id] = p; });

    return results.map(r => ({
        ...r,
        daily_picks: pickMap[r.pick_id] || {}
    }));
}

function calculateTierStats(results, tier) {
    const tierResults = results.filter(r => {
        const pickTier = r.daily_picks?.tier;
        return pickTier === tier;
    });

    if (tierResults.length === 0) {
        return { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, profit: 0, roi: 0, totalWagered: 0, totalPayout: 0, avgConfidence: 0 };
    }

    let wins = 0, losses = 0, pushes = 0;
    let totalPayout = 0;
    let totalConfidence = 0;
    let confCount = 0;

    for (const r of tierResults) {
        if (r.result === 'win') {
            wins++;
            totalPayout += parseFloat(r.payout_on_100) || 0;
        } else if (r.result === 'loss') {
            losses++;
            totalPayout += 0;
        } else if (r.result === 'push') {
            pushes++;
            totalPayout += 100; // stake returned
        }
        const conf = parseFloat(r.daily_picks?.confidence);
        if (!isNaN(conf)) {
            totalConfidence += conf;
            confCount++;
        }
    }

    const total = wins + losses + pushes;
    const totalWagered = total * 100; // $100 per bet
    const profit = totalPayout - totalWagered;
    const winRate = total > 0 ? (wins / (wins + losses)) * 100 : 0;
    const roi = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
    const avgConfidence = confCount > 0 ? totalConfidence / confCount : 0;

    return { wins, losses, pushes, total, winRate, profit, roi, totalWagered, totalPayout, avgConfidence };
}

function renderPerformanceCard(prefix, stats) {
    const recordEl = document.getElementById(`${prefix}-record`);
    const winrateEl = document.getElementById(`${prefix}-winrate`);
    const profitEl = document.getElementById(`${prefix}-profit`);
    const roiEl = document.getElementById(`${prefix}-roi`);
    const barEl = document.getElementById(`${prefix}-bar`);

    if (!recordEl) return;

    if (stats.total === 0) {
        recordEl.textContent = '0-0';
        winrateEl.textContent = '—';
        profitEl.textContent = '—';
        profitEl.className = 'perf-stat-value perf-profit';
        roiEl.textContent = '—';
        barEl.style.width = '0%';
        return;
    }

    recordEl.textContent = `${stats.wins}-${stats.losses}${stats.pushes > 0 ? `-${stats.pushes}` : ''}`;
    winrateEl.textContent = `${stats.winRate.toFixed(1)}%`;

    const profitStr = stats.profit >= 0
        ? `+$${stats.profit.toFixed(0)}`
        : `-$${Math.abs(stats.profit).toFixed(0)}`;
    profitEl.textContent = profitStr;
    profitEl.className = `perf-stat-value perf-profit ${stats.profit >= 0 ? 'positive' : 'negative'}`;

    const roiStr = stats.roi >= 0
        ? `+${stats.roi.toFixed(1)}%`
        : `${stats.roi.toFixed(1)}%`;
    roiEl.textContent = roiStr;

    barEl.style.width = `${Math.min(stats.winRate, 100)}%`;
}

function renderPerformanceTableRow(prefix, stats) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set(`perf-${prefix}-wagers`, stats.total > 0 ? stats.total : '—');
    set(`perf-${prefix}-wagered`, stats.total > 0 ? `$${stats.totalWagered.toLocaleString()}` : '—');
    set(`perf-${prefix}-payout`, stats.total > 0 ? `$${stats.totalPayout.toFixed(0)}` : '—');

    const profitEl = document.getElementById(`perf-${prefix}-profit`);
    if (profitEl) {
        if (stats.total > 0) {
            const sign = stats.profit >= 0 ? '+' : '';
            profitEl.textContent = `${sign}$${stats.profit.toFixed(0)}`;
            profitEl.className = `perf-profit ${stats.profit >= 0 ? 'positive' : 'negative'}`;
        } else {
            profitEl.textContent = '—';
            profitEl.className = 'perf-profit';
        }
    }

    set(`perf-${prefix}-winrate`, stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : '—');
    set(`perf-${prefix}-confidence`, stats.avgConfidence > 0 ? `${stats.avgConfidence.toFixed(0)}%` : '—');
}

function renderPerformanceTable(lockStats, valueStats, longshotStats) {
    renderPerformanceTableRow('lock', lockStats);
    renderPerformanceTableRow('value', valueStats);
    renderPerformanceTableRow('longshot', longshotStats);

    // Compute totals
    const totalStats = {
        total: lockStats.total + valueStats.total + longshotStats.total,
        totalWagered: lockStats.totalWagered + valueStats.totalWagered + longshotStats.totalWagered,
        totalPayout: lockStats.totalPayout + valueStats.totalPayout + longshotStats.totalPayout,
        profit: lockStats.profit + valueStats.profit + longshotStats.profit,
        winRate: 0,
        avgConfidence: 0,
    };

    const totalWins = lockStats.wins + valueStats.wins + longshotStats.wins;
    const totalLosses = lockStats.losses + valueStats.losses + longshotStats.losses;
    totalStats.winRate = (totalWins + totalLosses) > 0
        ? (totalWins / (totalWins + totalLosses)) * 100 : 0;

    // Weighted average confidence
    const confSum = (lockStats.avgConfidence * lockStats.total)
        + (valueStats.avgConfidence * valueStats.total)
        + (longshotStats.avgConfidence * longshotStats.total);
    totalStats.avgConfidence = totalStats.total > 0 ? confSum / totalStats.total : 0;

    renderPerformanceTableRow('total', totalStats);
}

// ===== PARLAY-LEVEL PERFORMANCE DATA =====
async function loadParlayPerformanceData(startDate, endDate) {
    try {
        const { data: parlays, error } = await sb
            .from('recommended_parlays')
            .select('*')
            .gte('parlay_date', startDate)
            .lte('parlay_date', endDate)
            .neq('result', 'pending');

        if (error) {
            console.error('Error loading parlay performance:', error);
            return [];
        }
        return parlays || [];
    } catch (e) {
        console.error('Parlay performance error:', e);
        return [];
    }
}

function calculateParlayTierStats(parlays, tier) {
    // Map table tiers to recommended_parlays tier values
    const tierMap = { lock: 'safe', value: 'value', longshot: 'longshot' };
    const matchTier = tierMap[tier] || tier;
    const tierParlays = parlays.filter(p => p.tier === matchTier);

    if (tierParlays.length === 0) {
        return { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, profit: 0, roi: 0, totalWagered: 0, totalPayout: 0, avgConfidence: 0 };
    }

    let wins = 0, losses = 0;
    let totalPayout = 0;
    let totalConfidence = 0;
    let confCount = 0;

    for (const p of tierParlays) {
        if (p.result === 'win') {
            wins++;
            totalPayout += parseFloat(p.actual_payout) || parseFloat(p.payout_on_100) || 0;
        } else if (p.result === 'loss') {
            losses++;
        }
        const conf = parseFloat(p.confidence);
        if (!isNaN(conf)) {
            totalConfidence += conf;
            confCount++;
        }
    }

    const total = wins + losses;
    const totalWagered = total * 100; // $100 per parlay
    const profit = totalPayout - totalWagered;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const roi = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
    const avgConfidence = confCount > 0 ? totalConfidence / confCount : 0;

    return { wins, losses, pushes: 0, total, winRate, profit, roi, totalWagered, totalPayout, avgConfidence };
}

async function refreshPerformance(startDate, endDate) {
    const emptyMsg = document.getElementById('perf-empty');
    // Always hide cards, table only
    const cardsGrid = document.querySelector('.perf-cards-grid');
    if (cardsGrid) cardsGrid.style.display = 'none';

    const emptyStats = { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, profit: 0, roi: 0, totalWagered: 0, totalPayout: 0, avgConfidence: 0 };

    if (currentPerfView === 'parlay') {
        // Parlay-level stats from recommended_parlays
        const parlays = await loadParlayPerformanceData(startDate, endDate);

        if (parlays.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            renderPerformanceTable(emptyStats, emptyStats, emptyStats);
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';

        const lockStats = calculateParlayTierStats(parlays, 'lock');
        const valueStats = calculateParlayTierStats(parlays, 'value');
        const longshotStats = calculateParlayTierStats(parlays, 'longshot');

        // Update cards (kept for future)
        renderPerformanceCard('lock', lockStats);
        renderPerformanceCard('value', valueStats);
        renderPerformanceCard('longshot', longshotStats);
        renderPerformanceTable(lockStats, valueStats, longshotStats);

        console.log(`📈 Parlay performance loaded: ${parlays.length} settled parlays in range`);
    } else {
        // Individual game stats from pick_results
        const results = await loadPerformanceData(startDate, endDate);

        if (results.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            renderPerformanceCard('lock', emptyStats);
            renderPerformanceCard('value', emptyStats);
            renderPerformanceCard('longshot', emptyStats);
            renderPerformanceTable(emptyStats, emptyStats, emptyStats);
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';

        const lockStats = calculateTierStats(results, 'lock');
        const valueStats = calculateTierStats(results, 'value');
        const longshotStats = calculateTierStats(results, 'longshot');

        renderPerformanceCard('lock', lockStats);
        renderPerformanceCard('value', valueStats);
        renderPerformanceCard('longshot', longshotStats);
        renderPerformanceTable(lockStats, valueStats, longshotStats);

        console.log(`📈 Individual performance loaded: ${results.length} settled picks in range`);
    }
}

function getDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const fmt = d => d.toISOString().split('T')[0];
    return { startDate: fmt(start), endDate: fmt(end) };
}

function setPerformanceRange(days) {
    currentPerfRange = days;

    // Update button states
    document.querySelectorAll('.perf-range-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.range) === days);
    });

    // Hide custom inputs
    const customInputs = document.getElementById('custom-range-inputs');
    if (customInputs) customInputs.style.display = 'none';

    const { startDate, endDate } = getDateRange(days);
    refreshPerformance(startDate, endDate);
}

function showCustomRange() {
    // Activate custom button
    document.querySelectorAll('.perf-range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === 'custom');
    });

    const customInputs = document.getElementById('custom-range-inputs');
    if (customInputs) customInputs.style.display = 'flex';

    // Set default dates
    const endInput = document.getElementById('perf-end-date');
    const startInput = document.getElementById('perf-start-date');
    if (endInput && !endInput.value) endInput.value = new Date().toISOString().split('T')[0];
    if (startInput && !startInput.value) {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startInput.value = d.toISOString().split('T')[0];
    }
}

// ===== TOGGLE PERFORMANCE TRACKER COLLAPSE =====
function togglePerfTracker() {
    const content = document.getElementById('perf-tracker-content');
    const icon = document.getElementById('perf-collapse-icon');
    if (!content) return;
    content.classList.toggle('collapsed');
    const isExpanded = !content.classList.contains('collapsed');
    if (icon) {
        icon.textContent = isExpanded ? '− Collapse' : '+ Expand';
    }
}

function applyCustomRange() {
    const startDate = document.getElementById('perf-start-date')?.value;
    const endDate = document.getElementById('perf-end-date')?.value;
    if (startDate && endDate) {
        refreshPerformance(startDate, endDate);
    }
}

// ===== SIDEBAR TOGGLE (PUSH LAYOUT) =====
function toggleSidebar() {
    const sidebar = document.getElementById('parlay-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', sidebar.classList.contains('open'));
}

// ===== SMOOTH NAV =====
function smoothNav(event, sectionId) {
    event.preventDefault();
    const section = document.getElementById(sectionId);
    if (!section) return;

    // Offset for sticky nav height
    const navHeight = document.getElementById('sticky-nav')?.offsetHeight || 60;
    const y = section.getBoundingClientRect().top + window.pageYOffset - navHeight - 10;
    window.scrollTo({ top: y, behavior: 'smooth' });

    // Update active link
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    event.target.classList.add('active');
}

// ===== TIER COUNTERS =====
function updateTierCounters() {
    let lockCount = 0, leanCount = 0, tossupCount = 0;
    GAMES.forEach(game => {
        const tag = getOverallConfidenceTag(game);
        if (tag.cls === 'lock') lockCount++;
        else if (tag.cls === 'lean') leanCount++;
        else tossupCount++;
    });

    const allEl = document.getElementById('conf-count-all');
    const lockEl = document.getElementById('conf-count-lock');
    const leanEl = document.getElementById('conf-count-lean');
    const tossupEl = document.getElementById('conf-count-tossup');

    if (allEl) allEl.textContent = `(${GAMES.length})`;
    if (lockEl) lockEl.textContent = `(${lockCount})`;
    if (leanEl) leanEl.textContent = `(${leanCount})`;
    if (tossupEl) tossupEl.textContent = `(${tossupCount})`;
}

// ===== SIDEBAR TIER COUNTS =====
function updateSidebarTierCounts() {
    let locks = 0, leans = 0, tossups = 0;
    selectedPicks.forEach(pick => {
        const conf = pick.confidence || 0;
        if (conf >= 75) locks++;
        else if (conf >= 60) leans++;
        else tossups++;
    });

    const lockEl = document.getElementById('sidebar-lock-count');
    const leanEl = document.getElementById('sidebar-lean-count');
    const tossupEl = document.getElementById('sidebar-tossup-count');

    if (lockEl) lockEl.textContent = locks;
    if (leanEl) leanEl.textContent = leans;
    if (tossupEl) tossupEl.textContent = tossups;
}

// ===== PERFORMANCE TIER & VIEW TOGGLES =====
let currentPerfTier = 'all';
let currentPerfView = 'individual';

function setPerfTier(tier) {
    currentPerfTier = tier;
    document.querySelectorAll('.perf-tier-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tier === tier);
    });

    // Show/hide perf cards based on tier
    document.querySelectorAll('.perf-card').forEach(card => {
        if (tier === 'all') {
            card.style.display = '';
        } else if (tier === 'lock') {
            card.style.display = card.classList.contains('perf-card-lock') ? '' : 'none';
        } else if (tier === 'value') {
            card.style.display = card.classList.contains('perf-card-value') ? '' : 'none';
        } else if (tier === 'longshot') {
            card.style.display = card.classList.contains('perf-card-longshot') ? '' : 'none';
        }
    });

    // Show/hide table rows based on tier
    const tableBody = document.getElementById('perf-table-body');
    if (tableBody) {
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach((row, i) => {
            if (tier === 'all') {
                row.style.display = '';
            } else {
                const tierMap = ['lock', 'value', 'longshot'];
                row.style.display = tierMap[i] === tier ? '' : 'none';
            }
        });
    }
}

function setPerfView(view) {
    currentPerfView = view;
    document.querySelectorAll('.perf-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    // Re-load performance data with the current date range and new view
    const { startDate, endDate } = getDateRange(currentPerfRange);
    refreshPerformance(startDate, endDate);
}

// ===== SAVE PARLAY (localStorage Foundation) =====
function saveParlay() {
    if (selectedPicks.length === 0) {
        alert('Add picks to your parlay before saving!');
        return;
    }

    const savedParlays = JSON.parse(localStorage.getItem('parlayBot_savedParlays') || '[]');
    const parlayData = {
        id: Date.now(),
        date: new Date().toISOString(),
        picks: selectedPicks.map(p => ({
            label: p.label,
            odds: p.odds,
            confidence: p.confidence,
            gameId: p.gameId,
            betType: p.betType
        })),
        combinedOdds: calculateParlayOdds(selectedPicks.map(p => p.odds)).combinedDecimal,
        payout: calculateParlayOdds(selectedPicks.map(p => p.odds)).payout,
        confidence: calculateOverallConfidence(selectedPicks.map(p => p.confidence))
    };

    savedParlays.push(parlayData);
    localStorage.setItem('parlayBot_savedParlays', JSON.stringify(savedParlays));

    // Visual feedback
    const saveBtn = document.querySelector('.sidebar-save-btn');
    if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✅ Saved!';
        saveBtn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)';
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '';
        }, 2000);
    }
}

// ===== INTERSECTION OBSERVER FOR NAV ACTIVE STATE =====
if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });

    // Wait for DOM to be ready before observing
    document.addEventListener('DOMContentLoaded', () => {
        ['performance-section', 'recommended-section', 'games-section'].forEach(id => {
            const el = document.getElementById(id);
            if (el) navObserver.observe(el);
        });
    });
}
