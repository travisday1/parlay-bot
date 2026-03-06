// ============================================================
// PARLAY BOT — Dynamic Frontend (Powered by Supabase)
// Fetches live games, odds, AI picks, and recommended parlays
// from the Supabase database instead of hardcoded arrays.
// ============================================================

// ===== SUPABASE CLIENT =====
const SUPABASE_URL = 'https://civkjfswgtvjxxqquxqb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdmtqZnN3Z3R2anh4cXF1eHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjAzMTcsImV4cCI6MjA4ODMzNjMxN30.3ZB2UwBLLXjXY8KPZGAo1vLs39_rhzZ6Jt4l_MhuSwhs';

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

// ===== PASSWORD =====
const SITE_PASSWORD = 'parlay2026';

// ===== LEAGUE CONFIG =====
const LEAGUE_MAP = {
    'basketball_nba': { id: 'nba', icon: '🏀', label: 'NBA' },
    'basketball_ncaab': { id: 'ncaab', icon: '🏀', label: 'NCAAB' },
    'basketball_wncaab': { id: 'wncaab', icon: '🏀', label: 'WNCAAB' },
    'icehockey_nhl': { id: 'nhl', icon: '🏒', label: 'NHL' },
    'americanfootball_nfl': { id: 'nfl', icon: '🏈', label: 'NFL' },
    'americanfootball_ncaaf': { id: 'ncaaf', icon: '🏈', label: 'NCAAF' },
    'baseball_mlb': { id: 'mlb', icon: '⚾', label: 'MLB' },
    'soccer_usa_mls': { id: 'mls', icon: '⚽', label: 'MLS' },
    'soccer_epl': { id: 'epl', icon: '⚽', label: 'EPL' },
    'soccer_spain_la_liga': { id: 'laliga', icon: '⚽', label: 'La Liga' },
    'soccer_italy_serie_a': { id: 'seriea', icon: '⚽', label: 'Serie A' },
    'soccer_germany_bundesliga': { id: 'bundesliga', icon: '⚽', label: 'Bundesliga' },
    'soccer_uefa_champs_league': { id: 'ucl', icon: '⚽', label: 'UCL' },
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);

        // Fetch games with their odds
        const { data: games, error: gamesError } = await sb
            .from('games')
            .select('*, odds(*)')
            .gte('commence_time', today.toISOString())
            .lte('commence_time', tomorrow.toISOString())
            .order('commence_time', { ascending: true });

        if (gamesError) throw gamesError;

        // Fetch daily picks for today  
        const todayStr = today.toISOString().split('T')[0];
        const { data: picks, error: picksError } = await sb
            .from('daily_picks')
            .select('*')
            .eq('pick_date', todayStr);

        if (picksError) throw picksError;

        // Fetch recommended parlays for today
        const { data: parlays, error: parlaysError } = await sb
            .from('recommended_parlays')
            .select('*')
            .eq('parlay_date', todayStr);

        if (parlaysError) throw parlaysError;

        // Transform data into frontend format
        GAMES = transformGames(games, picks);
        RECOMMENDED_PARLAYS = transformParlays(parlays);
        dataLoaded = true;

        console.log(`✅ Loaded ${GAMES.length} games, ${picks?.length || 0} picks, ${RECOMMENDED_PARLAYS.length} parlays from Supabase`);

        // Remove loading spinner
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'none';

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
    return games.map(game => {
        const leagueInfo = LEAGUE_MAP[game.sport_key] || { id: game.sport_key, icon: '🏟️', label: game.sport_title || game.sport_key };
        const odds = game.odds?.[0] || {};

        // Find any pick for this game
        const pick = picks?.find(p => p.game_id === game.game_id);

        // Determine spread favorite
        const homeSpread = odds.home_point || 0;
        const awaySpread = odds.away_point || 0;
        const spreadFavTeam = homeSpread < 0 ? abbreviate(game.home_team) : abbreviate(game.away_team);
        const spreadFavValue = Math.min(homeSpread, awaySpread);

        // Derive confidence from the pick
        const pickConf = pick?.confidence || 50;
        const homeML = odds.home_odds || -150;
        const awayML = odds.away_odds || +130;
        const homeIsFav = homeML < awayML;

        // Distribute confidence based on who the AI picked
        let awayMLConf = 50, homeMLConf = 50;
        if (pick) {
            if (pick.picked_team === game.home_team) {
                homeMLConf = pickConf;
                awayMLConf = 100 - pickConf;
            } else if (pick.picked_team === game.away_team) {
                awayMLConf = pickConf;
                homeMLConf = 100 - pickConf;
            } else {
                // Pick is spread or total
                homeMLConf = homeIsFav ? 60 : 40;
                awayMLConf = homeIsFav ? 40 : 60;
            }
        } else {
            homeMLConf = homeIsFav ? 60 : 40;
            awayMLConf = homeIsFav ? 40 : 60;
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
                spread: pick?.pick_type === 'spread' ? pickConf : 50,
                over: pick?.pick_type === 'over' ? pickConf : 50,
                under: pick?.pick_type === 'under' ? pickConf : 50,
            },
            pick: pick ? {
                team: abbreviate(pick.picked_team),
                type: pick.pick_type.toUpperCase(),
                reason: pick.rationale || 'AI analysis pending.'
            } : {
                team: homeIsFav ? abbreviate(game.home_team) : abbreviate(game.away_team),
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

    return parlays
        .sort((a, b) => (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99))
        .map(p => ({
            name: p.name || tierName[p.tier] || p.tier,
            tier: tierClass[p.tier] || p.tier,
            badge: tierBadge[p.tier] || p.tier,
            legs: (p.legs || []).map(leg => ({
                team: leg.picked_team || leg.team || '?',
                odds: leg.odds || -110,
                conf: leg.confidence || p.confidence || 50,
                game: leg.game || '',
            })),
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
    const isSoccer = ['mls', 'epl', 'laliga', 'seriea', 'bundesliga', 'ucl'].includes(game.league);
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
            </div>
        `;
    }).join('');
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
    const builder = document.getElementById('parlay-builder');
    const picksContainer = document.getElementById('parlay-picks');
    const legCount = document.getElementById('leg-count');
    const combinedOddsEl = document.getElementById('combined-odds');
    const payoutEl = document.getElementById('payout');
    const confEl = document.getElementById('parlay-confidence');
    const confBar = document.getElementById('conf-bar-fill');

    if (selectedPicks.length === 0) {
        builder.classList.remove('has-picks');
        picksContainer.innerHTML = '<p class="empty-slip">Click picks below to add them to your parlay</p>';
        legCount.textContent = '0 legs';
        combinedOddsEl.textContent = '—';
        payoutEl.textContent = '—';
        confEl.textContent = '—';
        confBar.style.width = '0%';
        confBar.className = 'conf-bar-fill';
        return;
    }

    builder.classList.add('has-picks');
    legCount.textContent = `${selectedPicks.length} leg${selectedPicks.length > 1 ? 's' : ''}`;

    picksContainer.innerHTML = selectedPicks.map(pick => `
        <div class="parlay-pick-chip">
            <span class="pick-conf-dot ${getConfidenceClass(pick.confidence)}"></span>
            <span>${pick.label} (${formatOdds(pick.odds)})</span>
            <span class="pick-conf-tag">${pick.confidence}%</span>
            <span class="remove-pick" onclick="removePick('${pick.gameId}', '${pick.betType}')">✕</span>
        </div>
    `).join('');

    const { combinedDecimal, payout } = calculateParlayOdds(selectedPicks.map(p => p.odds));
    const overallConf = calculateOverallConfidence(selectedPicks.map(p => p.confidence));

    combinedOddsEl.textContent = `${combinedDecimal.toFixed(3)}x`;
    payoutEl.textContent = `$${payout.toFixed(2)}`;
    confEl.textContent = `${overallConf}%`;
    confEl.className = `stat-value ${getConfidenceClass(overallConf)}`;
    confBar.style.width = `${overallConf}%`;
    confBar.className = `conf-bar-fill ${getConfidenceClass(overallConf)}`;
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
