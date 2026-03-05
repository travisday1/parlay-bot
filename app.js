// ===== GAME DATA - MARCH 4, 2026 =====
// Confidence: 0-100 per bet type based on research analysis
const GAMES = [
    // ===== NBA GAMES =====
    {
        id: 'nba-1', league: 'nba', time: '7:00 PM ET',
        away: { name: 'Thunder', abbr: 'OKC', record: '46-15', city: 'Oklahoma City' },
        home: { name: 'Knicks', abbr: 'NYK', record: '38-22', city: 'New York' },
        spread: { team: 'OKC', value: -4.5, odds: -110 },
        overUnder: { total: 222, overOdds: -110, underOdds: -110 },
        moneyline: { away: -180, home: +150 },
        confidence: { awayML: 68, homeML: 32, spread: 52, over: 62, under: 38 },
        pick: { team: 'OKC', type: 'ML', reason: 'Thunder are the best team in the NBA at 46-15 and lead the West by 3 games. MSG is a tough road spot but OKC has the talent edge. Spread at -4.5 is a coin flip. OVER looks good \u2014 model projects 227.6.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'OKC 31-31-1 ATS | NYK 32-30 ATS' },
            { icon: '\ud83d\udca1', text: 'Computer model projects 227.6 total points (OVER 222)' },
            { icon: '\ud83c\udfdf\ufe0f', text: 'MSG is one of the toughest road environments' },
        ]
    },
    {
        id: 'nba-2', league: 'nba', time: '7:30 PM ET',
        away: { name: 'Hornets', abbr: 'CHA', record: '31-31', city: 'Charlotte' },
        home: { name: 'Celtics', abbr: 'BOS', record: '39-20', city: 'Boston' },
        spread: { team: 'BOS', value: -6.5, odds: -110 },
        overUnder: { total: 214, overOdds: -110, underOdds: -110 },
        moneyline: { away: +192, home: -234 },
        confidence: { awayML: 38, homeML: 62, spread: 42, over: 45, under: 55 },
        pick: { team: 'BOS', type: 'ML', reason: '\u26a0\ufe0f TRAP GAME. Charlotte is 12-3 in L15 and 10-2 ATS on back-to-backs. Boston ML is safer than the spread. UNDER looks good \u2014 both teams can grind defensively.' },
        injuries: [
            { icon: '\ud83d\udd25', text: 'CHA 12-3 in last 15, 9-game win streak earlier' },
            { icon: '\ud83d\udcca', text: 'Hornets 10-2 ATS on 2nd night of back-to-back' },
            { icon: '\u2b50', text: 'Jaylen Brown averaging 29 PPG this season' },
        ]
    },
    {
        id: 'nba-3', league: 'nba', time: '7:30 PM ET',
        away: { name: 'Jazz', abbr: 'UTA', record: '18-42', city: 'Utah' },
        home: { name: '76ers', abbr: 'PHI', record: '33-26', city: 'Philadelphia' },
        spread: { team: 'PHI', value: -9.5, odds: -110 },
        overUnder: { total: 240, overOdds: -110, underOdds: -110 },
        moneyline: { away: +330, home: -418 },
        confidence: { awayML: 12, homeML: 88, spread: 65, over: 58, under: 42 },
        pick: { team: 'PHI', type: 'ML', reason: 'Utah 18-42, full rebuild. Traded JJJ. Philly at home should dominate. Spread -9.5 is coverable with this talent gap. OVER 240 leans yes \u2014 both play fast.' },
        injuries: [
            { icon: '\u2b07\ufe0f', text: 'UTA 18-42 \u2014 2nd worst record in the West' },
            { icon: '\ud83d\udd04', text: 'Jazz traded Jaren Jackson Jr. on Feb 3 in tank' },
            { icon: '\ud83d\udcca', text: 'O/U at 240 \u2014 both teams play at a fast pace' },
        ]
    },
    {
        id: 'nba-4', league: 'nba', time: '8:00 PM ET',
        away: { name: 'Trail Blazers', abbr: 'POR', record: '29-33', city: 'Portland' },
        home: { name: 'Grizzlies', abbr: 'MEM', record: '23-37', city: 'Memphis' },
        spread: { team: 'POR', value: -9.5, odds: -110 },
        overUnder: { total: 236, overOdds: -110, underOdds: -110 },
        moneyline: { away: -355, home: +280 },
        confidence: { awayML: 88, homeML: 12, spread: 72, over: 40, under: 60 },
        pick: { team: 'POR', type: 'ML', reason: 'Memphis is GUTTED. No Ja (18 games), no Edey (season), no Aldama, Clarke, KCP. Portland is a 10-pt road favorite \u2014 that says it all. UNDER 236 \u2014 MEM won\'t have the firepower.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'MEM: Ja Morant OUT (elbow, 18 games missed)' },
            { icon: '\ud83d\udea8', text: 'MEM: Zach Edey OUT for season (ankle)' },
            { icon: '\ud83d\udd34', text: 'MEM: Aldama, Clarke, KCP, Jerome all OUT' },
        ]
    },
    {
        id: 'nba-5', league: 'nba', time: '8:00 PM ET',
        away: { name: 'Hawks', abbr: 'ATL', record: '30-31', city: 'Atlanta' },
        home: { name: 'Bucks', abbr: 'MIL', record: '26-32', city: 'Milwaukee' },
        spread: { team: 'MIL', value: -1, odds: -110 },
        overUnder: { total: 232, overOdds: -110, underOdds: -110 },
        moneyline: { away: -105, home: -115 },
        confidence: { awayML: 50, homeML: 50, spread: 48, over: 55, under: 45 },
        pick: { team: 'ATL', type: 'ML', reason: 'True toss-up. Giannis is BACK but on a 25-min restriction. Bucks 26-32 and struggling. Hawks are fully healthy. At pick-em odds, ATL is a live dog \u2014 slight lean ATL.' },
        injuries: [
            { icon: '\u26a0\ufe0f', text: 'MIL: Giannis BACK but on 25-min restriction' },
            { icon: '\ud83d\udd34', text: 'MIL: Prince OUT (neck), Porter Jr. OUT (knee)' },
            { icon: '\u2705', text: 'ATL: Fully healthy \u2014 no major injuries' },
        ]
    },
    {
        id: 'nba-6', league: 'nba', time: '10:00 PM ET',
        away: { name: 'Pacers', abbr: 'IND', record: '15-46', city: 'Indiana' },
        home: { name: 'Clippers', abbr: 'LAC', record: '27-31', city: 'Los Angeles' },
        spread: { team: 'LAC', value: -12.5, odds: -110 },
        overUnder: { total: 226.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: +490, home: -671 },
        confidence: { awayML: 8, homeML: 92, spread: 75, over: 45, under: 55 },
        pick: { team: 'LAC', type: 'ML', reason: 'Indiana is 15-46. Haliburton out for season (torn Achilles). Zubac OUT, Siakam questionable. 6-game losing streak. This is the safest ML on the board. Spread -12.5 is also coverable.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'IND: Haliburton OUT for season (torn Achilles)' },
            { icon: '\ud83d\udd34', text: 'IND: Zubac OUT; Siakam, Nembhard questionable' },
            { icon: '\ud83d\udcc9', text: 'IND 15-46, worst in East, 6-game losing streak' },
        ]
    },
    {
        id: 'nba-7', league: 'nba', time: '10:00 PM ET',
        away: { name: 'Rockets', abbr: 'HOU', record: '37-22', city: 'Houston' },
        home: { name: 'Warriors', abbr: 'GSW', record: '31-29', city: 'Golden State' },
        spread: { team: 'HOU', value: -5.5, odds: -110 },
        overUnder: { total: 223, overOdds: -110, underOdds: -110 },
        moneyline: { away: -220, home: +180 },
        confidence: { awayML: 72, homeML: 28, spread: 58, over: 48, under: 52 },
        pick: { team: 'HOU', type: 'ML', reason: 'Houston 37-22, 4-1 in last 5. Warriors without Curry (knee, out til ~3/13) and Butler (ACL). GSW is 8-13 without Curry. Houston should control this game.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'GSW: Steph Curry OUT (knee, return ~Mar 13)' },
            { icon: '\ud83d\udd34', text: 'GSW: Jimmy Butler OUT for season (ACL)' },
            { icon: '\ud83d\udcca', text: 'HOU 4-1 in L5 | GSW 8-13 without Curry' },
        ]
    },
    {
        id: 'nba-8', league: 'nba', time: '10:00 PM ET',
        away: { name: 'Magic', abbr: 'ORL', record: '31-27', city: 'Orlando' },
        home: { name: 'Mavericks', abbr: 'DAL', record: '33-28', city: 'Dallas' },
        spread: { team: 'DAL', value: -3.5, odds: -110 },
        overUnder: { total: 216, overOdds: -110, underOdds: -110 },
        moneyline: { away: +145, home: -170 },
        confidence: { awayML: 38, homeML: 62, spread: 55, over: 45, under: 55 },
        pick: { team: 'DAL', type: 'ML', reason: 'Dallas at home with Luka is favored. Orlando is a solid defensive team but inconsistent on the road. UNDER 216 \u2014 both defenses can slow the pace.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'DAL at home \u2014 strong with Luka' },
            { icon: '\ud83d\udfe2', text: 'ORL: Strong defense, inconsistent offense' },
        ]
    },

    // ===== NHL GAMES =====
    {
        id: 'nhl-1', league: 'nhl', time: '7:00 PM ET',
        away: { name: 'Golden Knights', abbr: 'VGK', record: '33-22-6', city: 'Vegas' },
        home: { name: 'Red Wings', abbr: 'DET', record: '30-24-7', city: 'Detroit' },
        spread: { team: 'DET', value: -1.5, odds: +185 },
        overUnder: { total: 6, overOdds: -105, underOdds: -115 },
        moneyline: { away: +115, home: -136 },
        confidence: { awayML: 42, homeML: 58, spread: 35, over: 48, under: 52 },
        pick: { team: 'DET', type: 'ML', reason: 'Detroit is a slight home favorite. Both playoff-bound. DET at home with a small edge, but VGK is always dangerous. Lean DET ML, skip the puck line.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'DET home ML -136, VGK road ML +115' },
            { icon: '\ud83c\udfd2', text: 'Both teams fighting for playoff positioning' },
        ]
    },
    {
        id: 'nhl-2', league: 'nhl', time: '10:00 PM ET',
        away: { name: 'Kraken', abbr: 'SEA', record: '28-27-5', city: 'Seattle' },
        home: { name: 'Blues', abbr: 'STL', record: '27-28-7', city: 'St. Louis' },
        spread: { team: 'SEA', value: -1.5, odds: +178 },
        overUnder: { total: 6, overOdds: -112, underOdds: -108 },
        moneyline: { away: -148, home: +124 },
        confidence: { awayML: 55, homeML: 45, spread: 32, over: 50, under: 50 },
        pick: { team: 'SEA', type: 'ML', reason: 'Seattle favored on the road. Both below .500. Slight edge to SEA but this is basically a toss-up. Skip this game for parlay safety.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'SEA road favorite at -148' },
            { icon: '\ud83c\udfd2', text: 'Both teams fighting for wild card spots' },
        ]
    },
    {
        id: 'nhl-3', league: 'nhl', time: '10:00 PM ET',
        away: { name: 'Hurricanes', abbr: 'CAR', record: '38-16-6', city: 'Carolina' },
        home: { name: 'Canucks', abbr: 'VAN', record: '25-25-10', city: 'Vancouver' },
        spread: { team: 'CAR', value: -1.5, odds: -128 },
        overUnder: { total: 6.5, overOdds: +102, underOdds: -122 },
        moneyline: { away: -291, home: +234 },
        confidence: { awayML: 85, homeML: 15, spread: 68, over: 52, under: 48 },
        pick: { team: 'CAR', type: 'ML', reason: 'Carolina is #1 in the East (38-16-6, 82 pts). Vancouver is .500 and fading. The Hurricanes are dominant \u2014 this is the safest NHL pick tonight. Even -1.5 puck line at -128 is strong.' },
        injuries: [
            { icon: '\ud83c\udfc6', text: 'CAR: 1st in Eastern Conference (82 pts)' },
            { icon: '\u2b07\ufe0f', text: 'VAN: 25-25-10, below playoff line, fading' },
            { icon: '\ud83d\udcca', text: 'CAR puck line -1.5 at -128 \u2014 coverable' },
        ]
    },
];

// ===== RECOMMENDED PARLAYS =====
const RECOMMENDED_PARLAYS = [
    {
        name: '\ud83d\udd12 The Safe Bag', tier: 'lock', badge: 'Highest Confidence',
        legs: [
            { team: 'Clippers ML', odds: -671, conf: 92, game: 'IND @ LAC' },
            { team: 'Trail Blazers ML', odds: -355, conf: 88, game: 'POR @ MEM' },
            { team: '76ers ML', odds: -418, conf: 88, game: 'UTA @ PHI' },
            { team: 'Hurricanes ML', odds: -291, conf: 85, game: 'CAR @ VAN' },
        ],
        rationale: 'All four picks target the most lopsided matchups. LAC faces a 15-46 Pacers squad. Portland faces a gutted Memphis. Philly hosts tanking Jazz. Carolina is #1 in the East visiting fading Vancouver.',
    },
    {
        name: '\u26a1 The Value Play', tier: 'strong', badge: 'Best Value',
        legs: [
            { team: 'Thunder ML', odds: -180, conf: 68, game: 'OKC @ NYK' },
            { team: 'Rockets ML', odds: -220, conf: 72, game: 'HOU @ GSW' },
            { team: 'Hurricanes ML', odds: -291, conf: 85, game: 'CAR @ VAN' },
        ],
        rationale: 'Better payout with solid picks. OKC is the NBA\'s best team. Houston faces a depleted Warriors squad missing Curry and Butler. Carolina is the NHL lock of the night.',
    },
    {
        name: '\ud83c\udfb2 The Big Swing', tier: 'value', badge: 'High Risk / High Reward',
        legs: [
            { team: 'Clippers -12.5', odds: -110, conf: 75, game: 'IND @ LAC' },
            { team: 'Blazers -9.5', odds: -110, conf: 72, game: 'POR @ MEM' },
            { team: 'Hawks ML', odds: -105, conf: 50, game: 'ATL @ MIL' },
            { team: 'Hurricanes -1.5', odds: -128, conf: 68, game: 'CAR @ VAN' },
        ],
        rationale: 'Spreads instead of MLs on the blowouts for much better payout. The spicy leg: Atlanta vs a Bucks team with Giannis on a minutes restriction. If MIL fades late, this parlay prints.',
    },
];

// ===== PASSWORD =====
const SITE_PASSWORD = 'parlay2026';

// ===== STATE =====
let selectedPicks = [];
let authenticated = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => { checkAuth(); });

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

function showApp() {
    document.getElementById('password-gate').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';
    renderFilterBar();
    renderGames();
    renderRecommendedParlays();
}

// ===== RENDER GAMES =====
function renderGames() {
    const grid = document.getElementById('games-grid');
    grid.innerHTML = GAMES.map(game => createGameCard(game)).join('');
}

function getConfidenceClass(conf) {
    if (conf >= 75) return 'conf-high';
    if (conf >= 55) return 'conf-med';
    return 'conf-low';
}

function getConfidenceLabel(conf) {
    if (conf >= 85) return '\ud83d\udd12';
    if (conf >= 70) return '\u2705';
    if (conf >= 55) return '\ud83d\udc4d';
    return '\u26a0\ufe0f';
}

function getOverallConfidence(game) {
    return Math.max(game.confidence.awayML, game.confidence.homeML);
}

function getOverallConfidenceTag(game) {
    const c = getOverallConfidence(game);
    if (c >= 85) return { label: '\ud83d\udd12 LOCK', cls: 'lock' };
    if (c >= 65) return { label: '\u2705 LEAN', cls: 'lean' };
    return { label: '\u26a0\ufe0f TOSS-UP', cls: 'tossup' };
}

function createGameCard(game) {
    const isNHL = game.league === 'nhl';
    const spreadLabel = isNHL ? 'Puck Line' : 'Spread';
    const ouLabel = isNHL ? 'O/U Goals' : 'O/U Points';
    const tag = getOverallConfidenceTag(game);

    // Determine which picks are selected
    const awayMLSel = isPickSelected(game.id, 'awayML');
    const homeMLSel = isPickSelected(game.id, 'homeML');
    const spreadFavSel = isPickSelected(game.id, 'spreadFav');
    const spreadDogSel = isPickSelected(game.id, 'spreadDog');
    const overSel = isPickSelected(game.id, 'over');
    const underSel = isPickSelected(game.id, 'under');

    // Spread: derive underdog from favorite
    const favTeam = game.spread.team;
    const dogTeam = favTeam === game.away.abbr ? game.home.abbr : game.away.abbr;
    const dogValue = -game.spread.value; // flip the sign (e.g., -4.5 -> +4.5)
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
                    <div class="intel-item" style="margin-top: 4px; padding: 6px 10px; background: rgba(59,130,246,0.06); border-radius: 6px;">
                        <span class="intel-icon">\ud83c\udfaf</span>
                        <span style="color: var(--accent-blue);"><strong>Bot Pick:</strong> ${game.pick.reason}</span>
                    </div>
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
                
                <div class="pick-row-label">Spread</div>
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
                
                <div class="pick-row-label">Total ${isNHL ? 'Goals' : 'Points'}</div>
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
                                <span class="rec-leg-odds">${formatOdds(leg.odds)} \u00b7 ${leg.game}</span>
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
        // Remove pick
        selectedPicks.splice(existingIndex, 1);
    } else {
        // For O/U, remove opposite if selected
        if (betType === 'over') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'under'));
        } else if (betType === 'under') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'over'));
        }
        // For ML, remove opposite ML if selected
        if (betType === 'awayML') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'homeML'));
        } else if (betType === 'homeML') {
            selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'awayML'));
        }
        // For Spread, remove opposite spread if selected
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
        combinedOddsEl.textContent = '\u2014';
        payoutEl.textContent = '\u2014';
        confEl.textContent = '\u2014';
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
            <span class="remove-pick" onclick="removePick('${pick.gameId}', '${pick.betType}')">\u2715</span>
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

// ===== LEAGUE CONFIG =====
const LEAGUES = [
    { id: 'all', icon: '', label: 'All Games' },
    { id: 'nba', icon: '\ud83c\udfc0', label: 'NBA' },
    { id: 'nhl', icon: '\ud83c\udfd2', label: 'NHL' },
    { id: 'nfl', icon: '\ud83c\udfc8', label: 'NFL' },
    { id: 'ncaab', icon: '\ud83c\udfc0', label: 'NCAAB' },
    { id: 'ncaaf', icon: '\ud83c\udfc8', label: 'NCAAF' },
];

function renderFilterBar() {
    const bar = document.getElementById('filter-bar');
    bar.innerHTML = LEAGUES.map(league => {
        const count = league.id === 'all'
            ? GAMES.length
            : GAMES.filter(g => g.league === league.id).length;
        const label = `${league.icon} ${league.label} (${count})`.trim();
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