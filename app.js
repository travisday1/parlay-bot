// ===== GAME DATA - MARCH 5, 2026 =====
// Confidence: 0-100 per bet type based on research analysis
const GAMES = [
    // ===== NBA GAMES (9) =====
    {
        id: 'nba-1', league: 'nba', time: '7:00 PM ET',
        away: { name: 'Mavericks', abbr: 'DAL', record: '21-40', city: 'Dallas' },
        home: { name: 'Magic', abbr: 'ORL', record: '32-28', city: 'Orlando' },
        spread: { team: 'ORL', value: -8.5, odds: -110 },
        overUnder: { total: 228.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: +280, home: -360 },
        confidence: { awayML: 15, homeML: 85, spread: 62, over: 48, under: 52 },
        pick: { team: 'ORL', type: 'ML', reason: 'Dallas is gutted: Kyrie Irving OUT (knee surgery), Dereck Lively OUT (foot surgery), Cooper Flagg questionable (midfoot). Orlando at home without Franz Wagner but still heavy favorites. ORL ML is safe. Spread -8.5 is coverable.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'DAL: Kyrie Irving OUT (knee surgery), Lively OUT (foot)' },
            { icon: '\u26a0\ufe0f', text: 'DAL: Cooper Flagg questionable (midfoot sprain)' },
            { icon: '\ud83d\udd34', text: 'ORL: Franz Wagner OUT (high ankle sprain)' },
        ]
    },
    {
        id: 'nba-2', league: 'nba', time: '7:00 PM ET',
        away: { name: 'Jazz', abbr: 'UTA', record: '18-44', city: 'Utah' },
        home: { name: 'Wizards', abbr: 'WAS', record: '16-45', city: 'Washington' },
        spread: { team: 'UTA', value: -1.5, odds: -110 },
        overUnder: { total: 228, overOdds: -110, underOdds: -110 },
        moneyline: { away: -130, home: +110 },
        confidence: { awayML: 55, homeML: 45, spread: 50, over: 55, under: 45 },
        pick: { team: 'UTA', type: 'ML', reason: 'Tank Bowl. Both bottom-3 teams. Utah slight road favorites. Washington missing Anthony Davis, Alex Sarr, D\'Angelo Russell. Lean UTA but this is a genuine coin flip \u2014 SKIP for parlay safety.' },
        injuries: [
            { icon: '\ud83d\udd34', text: 'WAS: A. Davis, Sarr, Russell, George, Whitmore all OUT' },
            { icon: '\ud83d\udd34', text: 'UTA: Markkanen, Kessler, Nurkic, JJJ all OUT' },
            { icon: '\u26a0\ufe0f', text: 'Tank Bowl \u2014 both teams 18-44 and 16-45' },
        ]
    },
    {
        id: 'nba-3', league: 'nba', time: '7:30 PM ET',
        away: { name: 'Nets', abbr: 'BKN', record: '15-46', city: 'Brooklyn' },
        home: { name: 'Heat', abbr: 'MIA', record: '33-29', city: 'Miami' },
        spread: { team: 'MIA', value: -12.5, odds: -115 },
        overUnder: { total: 218, overOdds: -110, underOdds: -110 },
        moneyline: { away: +550, home: -800 },
        confidence: { awayML: 8, homeML: 92, spread: 70, over: 45, under: 55 },
        pick: { team: 'MIA', type: 'ML', reason: 'Brooklyn at 15-46 is the worst in the East. Miami at home fighting for playoffs. This is the safest NBA ML today. Even the -12.5 spread is coverable against a full-tank Nets squad.' },
        injuries: [
            { icon: '\ud83d\udcc9', text: 'BKN 15-46 \u2014 worst record in Eastern Conference' },
            { icon: '\ud83d\udd25', text: 'MIA fighting for playoff positioning (33-29)' },
            { icon: '\ud83d\udcca', text: 'MIA -12.5 spread \u2014 large but coverable vs tanking BKN' },
        ]
    },
    {
        id: 'nba-4', league: 'nba', time: '7:30 PM ET',
        away: { name: 'Warriors', abbr: 'GSW', record: '31-30', city: 'Golden State' },
        home: { name: 'Rockets', abbr: 'HOU', record: '38-22', city: 'Houston' },
        spread: { team: 'HOU', value: -9.5, odds: -110 },
        overUnder: { total: 215.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: +320, home: -410 },
        confidence: { awayML: 12, homeML: 88, spread: 65, over: 52, under: 48 },
        pick: { team: 'HOU', type: 'ML', reason: 'Houston is dominant at 38-22. Warriors are decimated: Curry OUT (knee), Butler OUT (ACL, season), Porzingis OUT (illness), Moody OUT. GSW is 8-13 without Curry. Sengun & Amen Thompson questionable for HOU but depth advantage is massive.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'GSW: Curry OUT (knee), Butler OUT (ACL, season)' },
            { icon: '\ud83d\udd34', text: 'GSW: Porzingis OUT (illness), Moody OUT (wrist)' },
            { icon: '\u26a0\ufe0f', text: 'HOU: Sengun (illness), Amen Thompson (ankle) questionable' },
        ]
    },
    {
        id: 'nba-5', league: 'nba', time: '7:30 PM ET',
        away: { name: 'Raptors', abbr: 'TOR', record: '35-26', city: 'Toronto' },
        home: { name: 'Timberwolves', abbr: 'MIN', record: '39-23', city: 'Minnesota' },
        spread: { team: 'MIN', value: -7, odds: -110 },
        overUnder: { total: 218, overOdds: -110, underOdds: -110 },
        moneyline: { away: +230, home: -280 },
        confidence: { awayML: 30, homeML: 70, spread: 55, over: 48, under: 52 },
        pick: { team: 'MIN', type: 'ML', reason: 'Minnesota 39-23 and on a 4-game win streak. Toronto is solid at 35-26 but on the road without Brandon Ingram (questionable, thumb). MIN at home should handle this. Spread -7 is playable.' },
        injuries: [
            { icon: '\ud83d\udd25', text: 'MIN on a 4-game winning streak' },
            { icon: '\u26a0\ufe0f', text: 'TOR: Brandon Ingram questionable (thumb sprain)' },
            { icon: '\ud83d\udcca', text: 'MIN 39-23 at home vs TOR 35-26 on road' },
        ]
    },
    {
        id: 'nba-6', league: 'nba', time: '8:00 PM ET',
        away: { name: 'Pistons', abbr: 'DET', record: '45-15', city: 'Detroit' },
        home: { name: 'Spurs', abbr: 'SAS', record: '44-17', city: 'San Antonio' },
        spread: { team: 'SAS', value: -3.5, odds: -106 },
        overUnder: { total: 228, overOdds: -110, underOdds: -110 },
        moneyline: { away: +140, home: -165 },
        confidence: { awayML: 42, homeML: 58, spread: 52, over: 55, under: 45 },
        pick: { team: 'SAS', type: 'ML', reason: '\ud83d\udd25 GAME OF THE NIGHT. #1 East (DET 45-15) vs #2 West (SAS 44-17). Spurs have home court. Both elite teams. This is a pick-em with slight home edge. OVER 228 leans yes \u2014 both teams score efficiently.' },
        injuries: [
            { icon: '\ud83c\udfc6', text: 'DET: #1 in East (45-15) \u2014 best record in NBA' },
            { icon: '\ud83c\udfc6', text: 'SAS: #2 overall (44-17) \u2014 dominant at home' },
            { icon: '\ud83d\udd25', text: 'Marquee matchup \u2014 potential Finals preview' },
        ]
    },
    {
        id: 'nba-7', league: 'nba', time: '9:00 PM ET',
        away: { name: 'Bulls', abbr: 'CHI', record: '25-37', city: 'Chicago' },
        home: { name: 'Suns', abbr: 'PHX', record: '35-26', city: 'Phoenix' },
        spread: { team: 'PHX', value: -11.5, odds: -108 },
        overUnder: { total: 232, overOdds: -110, underOdds: -110 },
        moneyline: { away: +450, home: -600 },
        confidence: { awayML: 10, homeML: 90, spread: 68, over: 52, under: 48 },
        pick: { team: 'PHX', type: 'ML', reason: 'Phoenix 35-26 at home vs a struggling Chicago (25-37). The Suns should dominate this mismatch. Spread -11.5 is big but PHX has the firepower. Safe ML pick.' },
        injuries: [
            { icon: '\ud83d\udcc9', text: 'CHI 25-37 \u2014 below .500 and fading' },
            { icon: '\u2b50', text: 'PHX at home with full squad, 35-26' },
            { icon: '\ud83d\udcca', text: 'PHX -11.5 \u2014 large spread but coverable vs CHI' },
        ]
    },
    {
        id: 'nba-8', league: 'nba', time: '9:00 PM ET',
        away: { name: 'Lakers', abbr: 'LAL', record: '37-24', city: 'Los Angeles' },
        home: { name: 'Nuggets', abbr: 'DEN', record: '38-24', city: 'Denver' },
        spread: { team: 'DEN', value: -5, odds: -110 },
        overUnder: { total: 228, overOdds: -110, underOdds: -110 },
        moneyline: { away: +180, home: -220 },
        confidence: { awayML: 35, homeML: 65, spread: 55, over: 52, under: 48 },
        pick: { team: 'DEN', type: 'ML', reason: 'Denver at home in the altitude is always tough. Nearly identical records (38-24 vs 37-24). Nuggets have the altitude advantage and Jokic factor. LAL competitive but DEN should win at home.' },
        injuries: [
            { icon: '\ud83c\udfd4\ufe0f', text: 'DEN: Mile-high altitude advantage at home' },
            { icon: '\ud83d\udcca', text: 'DEN 38-24 vs LAL 37-24 \u2014 near-identical records' },
            { icon: '\u2b50', text: 'Jokic vs LeBron/AD \u2014 premium matchup' },
        ]
    },
    {
        id: 'nba-9', league: 'nba', time: '10:00 PM ET',
        away: { name: 'Pelicans', abbr: 'NOP', record: '19-44', city: 'New Orleans' },
        home: { name: 'Kings', abbr: 'SAC', record: '14-49', city: 'Sacramento' },
        spread: { team: 'NOP', value: -4.5, odds: -110 },
        overUnder: { total: 230, overOdds: -110, underOdds: -110 },
        moneyline: { away: -190, home: +160 },
        confidence: { awayML: 62, homeML: 38, spread: 55, over: 55, under: 45 },
        pick: { team: 'NOP', type: 'ML', reason: 'Sacramento is the worst team in the NBA at 14-49. New Orleans is bad at 19-44 but clearly better. NOP ML is safer. OVER 230 leans yes \u2014 both teams play loose with no defensive urgency.' },
        injuries: [
            { icon: '\ud83d\udcc9', text: 'SAC 14-49 \u2014 worst record in the NBA' },
            { icon: '\u2b07\ufe0f', text: 'NOP 19-44 \u2014 bad but better than SAC' },
            { icon: '\ud83d\udcca', text: 'Tank Bowl #2 \u2014 both teams playing for lottery' },
        ]
    },

    // ===== NHL GAMES (8) =====
    {
        id: 'nhl-1', league: 'nhl', time: '7:00 PM ET',
        away: { name: 'Maple Leafs', abbr: 'TOR', record: '34-20-6', city: 'Toronto' },
        home: { name: 'Rangers', abbr: 'NYR', record: '29-22-9', city: 'New York' },
        spread: { team: 'NYR', value: -1.5, odds: +175 },
        overUnder: { total: 6, overOdds: -110, underOdds: -110 },
        moneyline: { away: +110, home: -130 },
        confidence: { awayML: 45, homeML: 55, spread: 30, over: 50, under: 50 },
        pick: { team: 'NYR', type: 'ML', reason: 'Rangers at MSG slight favorites. Toronto without Chris Tanev (season-ending surgery). NYR also missing J.T. Miller (IR, upper body). Close game \u2014 lean NYR at home but this is a toss-up. Skip puck line.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'TOR: Chris Tanev OUT rest of season (core surgery)' },
            { icon: '\ud83d\udd34', text: 'NYR: J.T. Miller on IR (upper-body injury)' },
            { icon: '\ud83c\udfdf\ufe0f', text: 'MSG home ice advantage for Rangers' },
        ]
    },
    {
        id: 'nhl-2', league: 'nhl', time: '7:00 PM ET',
        away: { name: 'Utah HC', abbr: 'UTA', record: '27-25-8', city: 'Utah' },
        home: { name: 'Flyers', abbr: 'PHI', record: '26-27-8', city: 'Philadelphia' },
        spread: { team: 'UTA', value: -1.5, odds: +170 },
        overUnder: { total: 6, overOdds: -110, underOdds: -110 },
        moneyline: { away: -125, home: +105 },
        confidence: { awayML: 52, homeML: 48, spread: 30, over: 50, under: 50 },
        pick: { team: 'UTA', type: 'ML', reason: 'Utah HC slight road favorites. Both mid-table teams fighting for wild card. True toss-up \u2014 skip for parlay safety.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'UTA 27-25-8 vs PHI 26-27-8 \u2014 evenly matched' },
            { icon: '\ud83c\udfd2', text: 'Both fighting for wild card positioning' },
        ]
    },
    {
        id: 'nhl-3', league: 'nhl', time: '7:00 PM ET',
        away: { name: 'Sabres', abbr: 'BUF', record: '35-19-6', city: 'Buffalo' },
        home: { name: 'Penguins', abbr: 'PIT', record: '31-15-13', city: 'Pittsburgh' },
        spread: { team: 'BUF', value: -1.5, odds: +165 },
        overUnder: { total: 6, overOdds: -110, underOdds: -110 },
        moneyline: { away: -113, home: +100 },
        confidence: { awayML: 52, homeML: 48, spread: 35, over: 52, under: 48 },
        pick: { team: 'BUF', type: 'ML', reason: 'Buffalo 76 pts, 2nd in Atlantic. Pittsburgh 75 pts but missing Sidney Crosby (IR, lower body, 4+ weeks). Without Crosby, BUF has the edge. Lean BUF ML.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'PIT: Sidney Crosby on IR (lower body, 4+ weeks)' },
            { icon: '\ud83d\udd34', text: 'BUF: Jordan Greenway on IR (abdomen)' },
            { icon: '\ud83d\udcca', text: 'BUF 76 pts vs PIT 75 pts \u2014 tight division race' },
        ]
    },
    {
        id: 'nhl-4', league: 'nhl', time: '7:00 PM ET',
        away: { name: 'Panthers', abbr: 'FLA', record: '33-20-7', city: 'Florida' },
        home: { name: 'Blue Jackets', abbr: 'CBJ', record: '30-22-8', city: 'Columbus' },
        spread: { team: 'CBJ', value: -1.5, odds: +210 },
        overUnder: { total: 6.5, overOdds: -100, underOdds: -140 },
        moneyline: { away: -102, home: -118 },
        confidence: { awayML: 48, homeML: 52, spread: 32, over: 52, under: 48 },
        pick: { team: 'CBJ', type: 'ML', reason: 'Columbus at home slight favorite. Florida missing Barkov (IR since October) and Seth Jones (LTIR). Lean CBJ at home.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'FLA: Barkov (IR), Seth Jones (LTIR, season)' },
            { icon: '\ud83d\udd34', text: 'FLA: Cole Schwindt (IR)' },
            { icon: '\u26a0\ufe0f', text: 'CBJ: Werenski (illness), Jenner (lower body) day-to-day' },
        ]
    },
    {
        id: 'nhl-5', league: 'nhl', time: '8:00 PM ET',
        away: { name: 'Bruins', abbr: 'BOS', record: '33-21-5', city: 'Boston' },
        home: { name: 'Predators', abbr: 'NSH', record: '25-29-7', city: 'Nashville' },
        spread: { team: 'BOS', value: -1.5, odds: +150 },
        overUnder: { total: 5.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: -155, home: +130 },
        confidence: { awayML: 62, homeML: 38, spread: 42, over: 48, under: 52 },
        pick: { team: 'BOS', type: 'ML', reason: 'Boston 73 pts, fighting for playoffs. Nashville 57 pts, fading out of contention. Bruins road favorites. Lean BOS ML \u2014 more motivated team.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'BOS 73 pts, playoff contender vs NSH 57 pts' },
            { icon: '\u2b50', text: 'Pastrnak over 1.5 pts at +110 is a popular prop' },
            { icon: '\u2b07\ufe0f', text: 'NSH fading out of playoff picture' },
        ]
    },
    {
        id: 'nhl-6', league: 'nhl', time: '8:00 PM ET',
        away: { name: 'Lightning', abbr: 'TBL', record: '38-16-4', city: 'Tampa Bay' },
        home: { name: 'Jets', abbr: 'WPG', record: '30-22-8', city: 'Winnipeg' },
        spread: { team: 'TBL', value: -1.5, odds: +138 },
        overUnder: { total: 5.5, overOdds: -123, underOdds: +102 },
        moneyline: { away: -177, home: +146 },
        confidence: { awayML: 68, homeML: 32, spread: 48, over: 55, under: 45 },
        pick: { team: 'TBL', type: 'ML', reason: '\ud83d\udd12 Tampa Bay leads the Atlantic at 80 pts and is the best team in the East. Jets missing Josh Morrissey (IR). Lightning are road favorites at -177. Strong lean TBL ML.' },
        injuries: [
            { icon: '\ud83c\udfc6', text: 'TBL: 1st in Atlantic Division (80 pts, 38-16-4)' },
            { icon: '\ud83d\udea8', text: 'WPG: Josh Morrissey on IR' },
            { icon: '\ud83d\udcca', text: 'TBL road favorite at -177 \u2014 dominant this season' },
        ]
    },
    {
        id: 'nhl-7', league: 'nhl', time: '9:00 PM ET',
        away: { name: 'Senators', abbr: 'OTT', record: '28-24-7', city: 'Ottawa' },
        home: { name: 'Flames', abbr: 'CGY', record: '26-27-7', city: 'Calgary' },
        spread: { team: 'OTT', value: -1.5, odds: +165 },
        overUnder: { total: 6, overOdds: -110, underOdds: -110 },
        moneyline: { away: -130, home: +110 },
        confidence: { awayML: 55, homeML: 45, spread: 32, over: 50, under: 50 },
        pick: { team: 'OTT', type: 'ML', reason: 'Ottawa slight road favorites. Both mid-table teams. OTT has the edge in talent. Lean OTT ML but it\'s close. Low-confidence pick.' },
        injuries: [
            { icon: '\ud83d\udcca', text: 'OTT 28-24-7 vs CGY 26-27-7 \u2014 close matchup' },
            { icon: '\ud83c\udfd2', text: 'Both fighting for wild card positioning' },
        ]
    },
    {
        id: 'nhl-8', league: 'nhl', time: '10:30 PM ET',
        away: { name: 'Islanders', abbr: 'NYI', record: '35-21-5', city: 'New York' },
        home: { name: 'Kings', abbr: 'LAK', record: '27-25-8', city: 'Los Angeles' },
        spread: { team: 'NYI', value: -1.5, odds: +155 },
        overUnder: { total: 5.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: -145, home: +122 },
        confidence: { awayML: 60, homeML: 40, spread: 38, over: 48, under: 52 },
        pick: { team: 'NYI', type: 'ML', reason: 'Islanders 75 pts, solid Metro contenders. Kings missing Kevin Fiala (season-ending leg injury), Joel Armia (IR), and Kuzmenko (IR). NYI should take this on the road.' },
        injuries: [
            { icon: '\ud83d\udea8', text: 'LAK: Kevin Fiala OUT for season (leg injury)' },
            { icon: '\ud83d\udd34', text: 'LAK: Armia (IR), Kuzmenko (IR, week-to-week)' },
            { icon: '\ud83d\udcca', text: 'NYI 75 pts vs LAK 62 pts \u2014 clear talent gap' },
        ]
    },

    // ===== NCAAB GAMES =====
    {
        id: 'ncaab-1', league: 'ncaab', time: '8:00 PM ET',
        away: { name: 'Rutgers', abbr: 'RUT', record: '11-20', city: 'Rutgers' },
        home: { name: 'Spartans', abbr: 'MSU', record: '23-8', city: 'Michigan St.' },
        spread: { team: 'MSU', value: -18.5, odds: -110 },
        overUnder: { total: 142.5, overOdds: -110, underOdds: -110 },
        moneyline: { away: +2500, home: -4500 },
        confidence: { awayML: 2, homeML: 98, spread: 72, over: 48, under: 52 },
        pick: { team: 'MSU', type: 'ML', reason: '\ud83d\udd12 Michigan State (23-8, ranked) at home vs Rutgers (11-20). The Spartans are a machine \u2014 -4500 ML. Even the -18.5 spread is historically coverable vs a bad Rutgers squad. LOCK.' },
        injuries: [
            { icon: '\ud83c\udfc6', text: 'MSU: 23-8, ranked, dominant at home' },
            { icon: '\u2b07\ufe0f', text: 'RUT: 11-20, one of worst in Big Ten' },
            { icon: '\ud83d\udcca', text: 'MSU -18.5 spread, -4500 ML \u2014 massive favorite' },
        ]
    },
    {
        id: 'ncaab-2', league: 'ncaab', time: '8:00 PM ET',
        away: { name: 'Hawkeyes', abbr: 'IOWA', record: '18-13', city: 'Iowa' },
        home: { name: 'Wolverines', abbr: 'MICH', record: '26-5', city: 'Michigan' },
        spread: { team: 'MICH', value: -10.5, odds: -110 },
        overUnder: { total: 155, overOdds: -110, underOdds: -110 },
        moneyline: { away: +380, home: -500 },
        confidence: { awayML: 18, homeML: 82, spread: 60, over: 50, under: 50 },
        pick: { team: 'MICH', type: 'ML', reason: 'Michigan (26-5) is a top-3 team nationally and a March Madness title favorite. Iowa (18-13) is respectable but outmatched at home in Ann Arbor. MICH ML is very safe. Spread -10.5 is a lean yes.' },
        injuries: [
            { icon: '\ud83c\udfc6', text: 'MICH: 26-5, top-3 nationally, title contender' },
            { icon: '\ud83d\udcca', text: 'IOWA: 18-13, solid but outmatched' },
            { icon: '\ud83c\udfaf', text: 'Big Ten showdown on FS1 at 8 PM' },
        ]
    },
];

// ===== RECOMMENDED PARLAYS =====
const RECOMMENDED_PARLAYS = [
    {
        name: '\ud83d\udd12 The Safe Bag', tier: 'lock', badge: 'Highest Confidence',
        legs: [
            { team: 'Heat ML', odds: -800, conf: 92, game: 'BKN @ MIA' },
            { team: 'Rockets ML', odds: -410, conf: 88, game: 'GSW @ HOU' },
            { team: 'Spartans ML', odds: -4500, conf: 98, game: 'RUT @ MSU' },
            { team: 'Lightning ML', odds: -177, conf: 68, game: 'TBL @ WPG' },
        ],
        rationale: 'Heavy favorites across three leagues. Miami hosts tanking Nets. Houston faces a depleted Warriors squad. Michigan St. is a -4500 home favorite vs 11-20 Rutgers. Tampa Bay leads the East on the road.',
    },
    {
        name: '\u26a1 The Value Play', tier: 'strong', badge: 'Best Value',
        legs: [
            { team: 'Magic ML', odds: -360, conf: 85, game: 'DAL @ ORL' },
            { team: 'Suns ML', odds: -600, conf: 90, game: 'CHI @ PHX' },
            { team: 'Wolverines ML', odds: -500, conf: 82, game: 'IOWA @ MICH' },
        ],
        rationale: 'Three strong favorites with better odds than the safe bag. Orlando hosts Dallas without Kyrie. Phoenix should handle Chicago easily. Michigan is a top-3 team hosting Iowa.',
    },
    {
        name: '\ud83c\udfb2 The Big Swing', tier: 'value', badge: 'High Risk / High Reward',
        legs: [
            { team: 'Heat -12.5', odds: -115, conf: 70, game: 'BKN @ MIA' },
            { team: 'Rockets -9.5', odds: -110, conf: 65, game: 'GSW @ HOU' },
            { team: 'Spartans -18.5', odds: -110, conf: 72, game: 'RUT @ MSU' },
            { team: 'Nuggets ML', odds: -220, conf: 65, game: 'LAL @ DEN' },
            { team: 'Islanders ML', odds: -145, conf: 60, game: 'NYI @ LAK' },
        ],
        rationale: 'Spreads on the blowouts for better payout, plus two solid MLs. If MIA, HOU, and MSU dominate as expected and DEN/NYI win at home/on road, this parlay PRINTS.',
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
    const isNCAAB = game.league === 'ncaab';
    const spreadLabel = isNHL ? 'Puck Line' : 'Spread';
    const ouLabel = isNHL ? 'O/U Goals' : 'O/U Points';
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
                    <div class="intel-item" style="margin-top: 4px; padding: 6px 10px; background: rgba(59,130,246,0.06); border-radius: 6px;">
                        <span class="intel-icon">\ud83c\udfaf</span>
                        <span style="color: var(--accent-blue);"><strong>Bot Pick:</strong> ${game.pick.reason}</span>
                    </div>
                </div>
            </div>
            <div class="pick-section-group">
                <div class="pick-row-label">Moneyline</div>
                <div class="pick-row">
                    <button class="pick-btn ${awayMLSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'awayML', '${game.away.abbr} ML', ${game.moneyline.away}, ${game.confidence.awayML})">
                        <div class="pick-btn-team">${game.away.abbr}</div>
                        <div class="pick-btn-odds">${formatOdds(game.moneyline.away)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.awayML)}">${getConfidenceLabel(game.confidence.awayML)} ${game.confidence.awayML}%</div>
                    </button>
                    <button class="pick-btn ${homeMLSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'homeML', '${game.home.abbr} ML', ${game.moneyline.home}, ${game.confidence.homeML})">
                        <div class="pick-btn-team">${game.home.abbr}</div>
                        <div class="pick-btn-odds">${formatOdds(game.moneyline.home)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.homeML)}">${getConfidenceLabel(game.confidence.homeML)} ${game.confidence.homeML}%</div>
                    </button>
                </div>
                <div class="pick-row-label">Spread</div>
                <div class="pick-row">
                    <button class="pick-btn ${spreadFavSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'spreadFav', '${favTeam} ${game.spread.value}', ${game.spread.odds}, ${game.confidence.spread})">
                        <div class="pick-btn-team">${favTeam} ${game.spread.value}</div>
                        <div class="pick-btn-odds">${formatOdds(game.spread.odds)}</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.spread)}">${getConfidenceLabel(game.confidence.spread)} ${game.confidence.spread}%</div>
                    </button>
                    <button class="pick-btn ${spreadDogSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'spreadDog', '${dogTeam} +${dogValue}', -110, ${dogSpreadConf})">
                        <div class="pick-btn-team">${dogTeam} +${dogValue}</div>
                        <div class="pick-btn-odds">-110</div>
                        <div class="pick-conf ${getConfidenceClass(dogSpreadConf)}">${getConfidenceLabel(dogSpreadConf)} ${dogSpreadConf}%</div>
                    </button>
                </div>
                <div class="pick-row-label">Total ${isNHL ? 'Goals' : 'Points'}</div>
                <div class="pick-row">
                    <button class="pick-btn ${overSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'over', 'O${game.overUnder.total}', ${game.overUnder.overOdds}, ${game.confidence.over})">
                        <div class="pick-btn-team">OVER</div>
                        <div class="pick-btn-odds">${game.overUnder.total} (${formatOdds(game.overUnder.overOdds)})</div>
                        <div class="pick-conf ${getConfidenceClass(game.confidence.over)}">${getConfidenceLabel(game.confidence.over)} ${game.confidence.over}%</div>
                    </button>
                    <button class="pick-btn ${underSel ? 'selected' : ''}" onclick="togglePick('${game.id}', 'under', 'U${game.overUnder.total}', ${game.overUnder.underOdds}, ${game.confidence.under})">
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
        selectedPicks.splice(existingIndex, 1);
    } else {
        if (betType === 'over') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'under'));
        else if (betType === 'under') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'over'));
        if (betType === 'awayML') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'homeML'));
        else if (betType === 'homeML') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'awayML'));
        if (betType === 'spreadFav') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'spreadDog'));
        else if (betType === 'spreadDog') selectedPicks = selectedPicks.filter(p => !(p.gameId === gameId && p.betType === 'spreadFav'));
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
    { id: 'ncaab', icon: '\ud83c\udfc0', label: 'NCAAB' },
    { id: 'nfl', icon: '\ud83c\udfc8', label: 'NFL' },
    { id: 'ncaaf', icon: '\ud83c\udfc8', label: 'NCAAF' },
];

function renderFilterBar() {
    const bar = document.getElementById('filter-bar');
    bar.innerHTML = LEAGUES.map(league => {
        const count = league.id === 'all' ? GAMES.length : GAMES.filter(g => g.league === league.id).length;
        const label = `${league.icon} ${league.label} (${count})`.trim();
        return `<button class="filter-btn ${league.id === 'all' ? 'active' : ''}" data-filter="${league.id}" onclick="filterGames('${league.id}')" ${count === 0 && league.id !== 'all' ? 'style="opacity:0.4;"' : ''}>${label}</button>`;
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