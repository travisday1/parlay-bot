# 🎯 PARLAY BOT — Comprehensive Program Documentation

> **AI-Powered Sports Betting Research Platform**
> A full-stack application combining mathematical modeling, multi-source data enrichment, and Google Gemini AI analysis to generate daily sports betting picks, recommended parlays, and performance tracking — across 11 sport categories.

---

## Table of Contents

1. [Program Intent & Vision](#1-program-intent--vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Backend Pipeline — Deep Dive](#3-backend-pipeline--deep-dive)
4. [Frontend Application — Deep Dive](#4-frontend-application--deep-dive)
5. [Database Schema & Security](#5-database-schema--security)
6. [Evolution & Edit History](#6-evolution--edit-history)
7. [Key Nuances & Design Decisions](#7-key-nuances--design-decisions)
8. [Advantages](#8-advantages)
9. [Disadvantages & Known Limitations](#9-disadvantages--known-limitations)
10. [Commercial Readiness Assessment](#10-commercial-readiness-assessment)
11. [Public-Ready Features](#11-public-ready-features)
12. [Recommendations for Improvement](#12-recommendations-for-improvement)
13. [Technology Stack](#13-technology-stack)
14. [External API Dependencies](#14-external-api-dependencies)
15. [Environment Variables](#15-environment-variables)

---

## 1. Program Intent & Vision

Parlay Bot was built to be a **data-driven, AI-assisted sports betting research tool** that removes emotional bias from betting decisions. It is *not* a bookmaker — it provides **analysis, picks, and parlay recommendations** based on:

- **Mathematical models** that calculate win probabilities, expected value (EV), and projected game totals
- **Multi-source data enrichment** (injuries, fatigue, referee tendencies, weather, line movement, O/U trends)
- **Google Gemini AI** that synthesizes all signals into human-readable analysis with confidence scores
- **Self-calibration** using Brier Scores, Closing Line Value (CLV), and historical accuracy feedback loops

The platform is designed for a **freemium SaaS model**: free users see top picks with limited detail, while paid subscribers (`Plus` at $9.99/mo, `Pro` at $24.99/mo) unlock full analysis, all parlays, performance dashboards, and model calibration tools.

**Target audience:** Sports bettors who want a data-backed second opinion — from casual multi-sport parlayers to serious EV-oriented grinders.

---

## 2. Architecture Overview

> **Note:** The project was originally built on Supabase and has been **fully migrated to Firebase**. The legacy Supabase code remains in the root directory, while the active Firebase-based codebase lives in `Agents/FireBase Agents/`. This doc covers the **current Firebase architecture**.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FIREBASE CLOUD FUNCTIONS                      │
│  functions/index.js → REST API (/api/*)                             │
│    ├── /api/games       (today's games + odds)                      │
│    ├── /api/picks       (AI picks, tier-gated)                      │
│    ├── /api/parlays     (recommended parlays)                       │
│    ├── /api/results     (performance data)                          │
│    ├── /api/profile     (user profile CRUD)                         │
│    ├── /api/admin/*     (user mgmt, invites, pipeline runs)         │
│    └── /api/health      (health check)                              │
│                                                                     │
│  Scheduled Function: dailyPipeline (Pub/Sub — 8AM EST daily)        │
│    ├── updater.js     (fetch odds from The-Odds-API)                │
│    ├── settler.js     (grade completed picks & parlays)             │
│    └── analyzer.js    (AI analysis engine)                          │
│         ├── enricher.js  (7-phase data enrichment)                  │
│         ├── model.js     (mathematical probability model)           │
│         ├── calibrator.js (accuracy feedback loop)                  │
│         └── brier.js     (Brier Score + CLV computation)            │
│  Standalone: poster.js   (Twitter/X social media automation)        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  CLOUD SQL    │
                    │ (PostgreSQL)  │
                    │ via db.js pg  │
                    └───────┬───────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                   FIREBASE HOSTING (Static)                         │
│  public/index.html + public/app.js + public/styles.css              │
│    ├── Firebase Auth (email/password, Google, Apple, Facebook)       │
│    ├── API calls via ID token → Cloud Functions                     │
│    ├── Performance Tracker (7d / 30d / 90d / custom)                │
│    ├── Recommended Parlays (Safe Bag, Value Play, Big Swing)        │
│    ├── Today's Picks (filterable by tier & league)                  │
│    ├── Full Slate (all games with live odds)                        │
│    ├── Parlay Builder Sidebar (interactive bet slip)                │
│    └── Admin Dashboard (admin.html)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Differences from Supabase Version

| Aspect | Supabase (Legacy) | Firebase (Current) |
|---|---|---|
| **Auth** | Supabase Auth (`@supabase/supabase-js`) | Firebase Auth (compat SDK v10.12.0) |
| **Database** | Supabase-hosted PostgreSQL via client | Cloud SQL PostgreSQL via `pg` Pool in `db.js` |
| **API Layer** | Direct Supabase client queries from frontend | Cloud Functions HTTP API (`functions/index.js`) |
| **Data Access** | Row Level Security (RLS) policies | Firebase ID token verification + server-side tier check |
| **Hosting** | External / static hosting | Firebase Hosting with `/api/**` → Cloud Functions rewrite |
| **Pipeline** | `run-pipeline.sh` cron job | Scheduled Cloud Function (`dailyPipeline`) via Pub/Sub |
| **Project ID** | — | `parlay-bot-1772763394` |

### Sports Coverage (11 Sport Keys)

| Sport Key | Label | API Source |
|---|---|---|
| `basketball_nba` | NBA | The-Odds-API + BallDontLie |
| `basketball_ncaab` | NCAAB | The-Odds-API + BallDontLie |
| `icehockey_nhl` | NHL | The-Odds-API + BallDontLie |
| `americanfootball_nfl` | NFL | The-Odds-API |
| `baseball_mlb` | MLB | The-Odds-API |
| `soccer_usa_mls` | MLS | The-Odds-API |
| `soccer_epl` | EPL | The-Odds-API |
| `soccer_spain_la_liga` | La Liga | The-Odds-API |
| `soccer_germany_bundesliga` | Bundesliga | The-Odds-API |
| `soccer_france_ligue_one` | Ligue 1 | The-Odds-API |
| `soccer_italy_serie_a` | Serie A | The-Odds-API |

---

## 3. Backend Pipeline — Deep Dive

### 3.1 Cloud Functions API (`functions/index.js`)

The Firebase migration introduced a **centralized REST API** via Cloud Functions. All frontend data requests hit `/api/*` endpoints, which are rewritten to the `api` Cloud Function by Firebase Hosting. Key architecture:

- **Auth verification:** Every request extracts the `Authorization: Bearer <token>` header and verifies it as a Firebase ID token via `admin.auth().verifyIdToken()`
- **Tier gating at the API level:** The `/api/picks` endpoint checks the user's tier (from custom claims or `profiles` table) and filters picks accordingly — free users only see Locks
- **Fallback resilience:** If Cloud SQL is unavailable, the `/api/profile` endpoint falls back to constructing a profile from the Firebase Auth token itself
- **CORS enabled:** `cors({ origin: true })` allows cross-origin requests during development

### 3.2 Scheduled Pipeline (`dailyPipeline`)

Replaces the old `run-pipeline.sh` cron approach. Now runs as a **Firebase scheduled Cloud Function**:

- **Schedule:** `0 13 * * *` (13:00 UTC = 8:00 AM EST daily)
- **Resources:** 1GB memory, 540s timeout
- **Sequence:** `updater.js` → `settler.js` → `analyzer.js` (2.5 min timeout per script)
- **Failure handling:** If `updater.js` fails, the pipeline aborts entirely (no point analyzing without fresh odds)

### 3.3 `db.js` — Shared Database Layer

Replaces the Supabase client across all backend scripts:

```javascript
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
});
```

Exports: `query()`, `queryOne()`, `execute()`, `batchUpsert()`, `closePool()`

All backend scripts now use `const { query, execute, closePool } = require('./db')` instead of Supabase's `supabase.from('table').select()`. The SQL queries use raw `pg` parameterized queries with `$1`, `$2`, etc.

### 3.4 `updater.js` — Odds Fetcher

Fetches live odds from **The-Odds-API** for all 11 sport keys. Key behaviors:

- **Bookmaker priority:** DraftKings → FanDuel → first available
- **Markets fetched:** `h2h` (moneyline), `spreads`, `totals` — all in American odds format
- **NCAAB cap:** Limited to 20 games per run (sorted by soonest commence time) to manage API quota
- **Odds validation:** Rejects games with incomplete market data. **Soccer is relaxed** — only requires valid moneyline (spreads/totals often unavailable for soccer)
- **Odds history:** Every snapshot is append-only inserted into `odds_history` for line movement tracking — this table never overwrites, enabling the enricher to detect significant line shifts
- **API quota tracking:** Logs `x-requests-remaining` / `x-requests-used` headers
- **Stores to Cloud SQL** via `db.js` `query()` with `ON CONFLICT` upserts

### 3.5 `settler.js` — Pick & Parlay Grader

Fetches final scores from The-Odds-API (`/scores` endpoint with 3-day lookback) and grades every unsettled pick:

- **Pick types graded:** Moneyline, Spread, Over, Under
- **Outcomes:** `win`, `loss`, `push`
- **Payout calculation:** Calculates hypothetical payout on a $100 bet using American odds math
- **Team matching:** Uses fuzzy matching — checks if picked team name contains or is contained by the full team name, or if team nicknames (last word) match
- **Parlay settlement:** Iterates all pending parlays. A parlay wins only if *every* leg wins. Push legs are skipped (reduced parlay). If any leg loses, the entire parlay is `loss`
- **Batched queries:** Queries `pick_results` in batches of 100 to avoid URL length limits

### 3.6 `analyzer.js` — The AI Brain (677 lines)

This is the most complex module. It performs the following:

#### Step 1: Fetch Today's Games + Odds from Cloud SQL
Pulls games from the `games` and `odds` tables for games commencing in the next 48 hours.

#### Step 2: Enrich Each Game (calls `enricher.js`)
Each game gets a 7-phase enrichment pass (detailed in §3.7).

#### Step 3: Run Mathematical Model (calls `model.js`)
Each game gets a baseline win probability, EV calculation, and O/U projection (detailed in §3.8).

#### Step 4: Build the AI Prompt
Constructs a detailed prompt for Google Gemini that includes:
- The game matchup, odds, and enrichment context
- The mathematical model's baseline probabilities and EV
- **Calibration data** from `calibrator.js` (if available) — telling the AI where it's been overconfident or underconfident historically
- Strict instructions to output structured JSON with `pick_type`, `picked_team`, `confidence`, `tier`, and `rationale`

#### Step 5: Filter by Edge Floor
Only picks with a minimum EV (the "edge floor") pass through. This prevents the bot from recommending low-value bets.

#### Step 6: Apply Hard Pick Count Cap
Limits total daily picks to avoid overwhelming users and reducing quality.

#### Step 7: Build Cross-Sport Parlays
Constructs three recommended parlays:
- **🔒 Safe Bag** — 3 legs, all from Lock/Value tiers, favorites only (no underdogs), highest confidence
- **💎 Value Play** — 3-4 legs, mixed tiers, balance of risk/reward
- **🚀 Big Swing** — 4-5 legs, includes longshots, aims for high payout multiplier

Each parlay calculates combined odds and `payout_on_100` (what a $100 bet would return).

#### Step 8: Store Picks & Parlays in Cloud SQL
Upserts into `daily_picks` and `recommended_parlays` tables.

### 3.7 `enricher.js` — 7-Phase Data Enrichment (800+ lines)

| Phase | Data Source | What It Provides |
|---|---|---|
| **Schedule Fatigue** | Cloud SQL `games` table | Rest days, back-to-back status, games-in-7-day window |
| **Injury Reports** | ESPN API (NBA/NHL), AI knowledge (others) | Player injury status, impact classification (Star/Starter/Rotation/Bench) |
| **O/U Intelligence** | The-Odds-API + Cloud SQL history | Recency-weighted Over/Under hit rates, average actual totals |
| **Line Movement** | Cloud SQL `odds_history` | Opening vs. current spread/total shifts, detects significant moves (>1 pt spread, >2 pts total) |
| **Referee Tendencies** | NBA.com + hardcoded `REFEREE_TENDENCIES` | Foul rate tendency, O/U skew per referee crew (NBA only) |
| **Goalie Status** | BallDontLie API | Starting/injured goaltender info (NHL only) |
| **Weather** | OpenWeatherMap API | Temperature, wind, precipitation for outdoor games (NFL/MLB only) |

**Key Nuances:**
- Referee data is **hardcoded** for ~30 NBA referees with O/U and foul tendencies. This data requires manual updates each season
- Injury data for NCAAB, MLB, and soccer relies on Gemini's training knowledge rather than live feeds
- Weather is only fetched for NFL and MLB (outdoor sports) — uses a mapping of team names to city coordinates
- The enricher uses `sleep()` delays between API calls to respect rate limits

### 3.8 `model.js` — Mathematical Probability Engine (800+ lines)

The core statistical model that provides baseline probabilities before AI analysis:

#### Power Ratings
Generates team power ratings based on:
- **NBA:** Offensive Rating, Defensive Rating, Net Rating, Four Factors (eFG%, TOV%, OREB%, FT Rate), Pace
- **NCAAB:** Similar to NBA but scaled for college
- **NHL:** Goals For/Against per game, special teams (PP%, PK%), shots on goal
- **NFL/MLB:** Basic stats from Cloud SQL history

#### Win Probability
Uses a **logistic function** to convert power rating differentials into win probabilities:
- `K` (steepness): How much a rating gap translates to probability
- `HOME_BOOST`: Sport-specific home advantage (NBA = 3 pts, NHL = 1.5 pts, etc.)

#### Expected Value (EV)
```
EV = (winProb × potentialProfit) - (loseProb × wager)
```
Only picks with positive EV pass the edge floor filter.

#### O/U Total Projection
Projects game totals using team scoring averages and pace. Compares against the bookmaker's posted total to identify Over/Under opportunities.

#### Data Sources
- **BallDontLie SDK** for NBA, NCAAB, NHL advanced stats
- **Rate-limited** with `sleep()` between API calls
- Sport-specific config objects (`SPORT_CONFIG`) allow tuning weights and parameters per sport

### 3.9 `calibrator.js` — Self-Correcting Feedback Loop

Queries the last 14 days of settled results and computes:
- Win rate per sport × pick type × tier combination
- Average confidence vs. actual hit rate per category
- Generates calibration text (e.g., "⚠️ SIGNIFICANTLY OVERCONFIDENT — reduce confidence by 10-15 pts") injected directly into the AI prompt

This creates a **feedback loop** where the AI adjusts its confidence scores based on recent real-world accuracy.

### 3.10 `brier.js` — Probability Calibration Metrics

**Brier Score:**
- Formula: `(1/N) × Σ(predicted_prob - actual_outcome)²`
- Range: 0 (perfect) to 1 (worst)
- Interpretation: <0.20 = Excellent, <0.25 = Good, <0.30 = Fair
- Tracks calibration curve in 5% probability buckets

**Closing Line Value (CLV):**
- Compares pick-time odds vs. closing odds (last snapshot before game starts)
- Positive CLV = model consistently finds value before market correction
- Spread CLV heuristic: 1 point of spread movement ≈ 3% implied probability shift

### 3.11 `poster.js` — Social Media Automation

Posts formatted updates to **Twitter/X** using OAuth 1.0a:

- **Morning mode:** Posts top 5 picks with tier badges, odds, confidence, and parlay summaries
- **Evening mode:** Posts daily results with W-L record, ROI, and lock/value breakdowns
- **Dry-run mode:** If Twitter credentials aren't set, prints tweets to console
- Handles character limit (280 chars) and multi-tweet threads

---

## 4. Frontend Application — Deep Dive

### 4.1 Authentication System (Firebase Auth)

**Auth Gate** — Users must authenticate before seeing any content:
- **Email/password** sign in and sign up via `firebase.auth()` compat SDK
- **Social OAuth:** Google, Apple, Facebook via `firebase.auth.GoogleAuthProvider()`, etc.
- Password reset via `auth.sendPasswordResetEmail()`
- `auth.onAuthStateChanged()` handles session state and OAuth redirects

**API Authentication Flow:**
1. User signs in → Firebase issues an ID token
2. Frontend calls `user.getIdToken()` before every API request
3. Token sent as `Authorization: Bearer <token>` header
4. Cloud Function verifies token via `admin.auth().verifyIdToken()`
5. User UID + claims extracted → tier-gated data returned

**User Profiles:**
- Created on first API call to `/api/profile` (auto-inserted if missing)
- `effectiveTier` = `granted_tier` (admin override) || `subscription_tier` (Stripe) || `free`
- Hardcoded `SITE_ADMINS` array grants permanent admin + pro access regardless of database state

### 4.2 Content Gating (Tiered Access)

| Feature | Free | Plus ($9.99/mo) | Pro ($24.99/mo) |
|---|:---:|:---:|:---:|
| Top 3 Lock picks | ✅ | ✅ | ✅ |
| Value Parlay | ✅ | ✅ | ✅ |
| All picks, all sports | ❌ | ✅ | ✅ |
| All 3 daily parlays | ❌ | ✅ | ✅ |
| Full AI rationale | ❌ | ✅ | ✅ |
| Full confidence scores | ❌ | ✅ | ✅ |
| 30-day performance | ❌ | ✅ | ✅ |
| Full performance + export | ❌ | ❌ | ✅ |
| Calibration dashboard | ❌ | ❌ | ✅ |
| CLV analysis | ❌ | ❌ | ✅ |
| Real-time lock alerts | ❌ | ❌ | ✅ |
| No ads | ❌ | ✅ | ✅ |

**Tier gating is enforced twice:** client-side in `canAccess()` (UI) and server-side in Cloud Functions (data).

Stripe checkout integration is scaffolded but **not yet configured** (price IDs are placeholders).

### 4.3 Main Dashboard Sections

**📈 Performance Tracker** (collapsible)
- Filterable by timeframe (7d / 30d / 90d / custom date range)
- Filterable by tier (All / Locks / Value / Big Swings)
- Two views: Individual Game and By Parlay
- Stats: wagers, wagered amount, payout, P&L, win %, avg confidence
- Breakdown by bet type and sport
- **MODEL_EPOCH** (`2026-03-11`): Performance data excluded before this date

**🔥 Recommended Parlays**
- Three AI-generated parlays per day (Safe Bag, Value Play, Big Swing)
- Shows combined odds, $100 payout, confidence, and all legs
- Clickable legs feed into the parlay builder

**🤖 Today's Picks**
- Cards for each AI-analyzed game
- Confidence filter bar (All / 🔒 Locks / ✅ Leans / ⚠️ Toss-Ups) — multi-select
- League filter bar (dynamically shows leagues with games today)
- Each card: team names, odds (ML/Spread/O/U), AI rationale, tier badge
- Independent confidence per bet type (see §7.2)
- Clickable bet buttons to add to parlay sidebar

**📋 Full Slate**
- All games with live odds, regardless of AI analysis
- Bet buttons (ML, Spread, O/U) per game
- NCAAB games only shown if analyzed by AI (curated)

**🎰 Parlay Builder Sidebar**
- Click picks from any section to add legs
- Shows: leg count, combined odds, $100 payout, weighted confidence
- Tier summary chips (Locks / Leans / Toss-Ups)
- Confidence progress bar
- **Quick Build mixer:** Specify locks/leans/toss-ups count → auto-generates a parlay
- Save and clear functions

### 4.4 Admin Dashboard (`admin.html`)

Accessible only to users with `is_admin = true` or hardcoded `SITE_ADMINS`:

- **Stats:** Total users, Free/Plus/Pro tier counts, admin count
- **User table:** Search, paginate (25/page), view email/name/tier/status/admin
- **Actions:** Grant Plus, Grant Pro, Revoke tier, Toggle admin
- **Invite system:** Send invites with pre-assigned tier via `pending_invites` table
- Uses same Firebase Auth SDK for admin verification
- API calls go through `/api/admin/*` Cloud Functions endpoints

### 4.5 NCAAB Filtering

~80 **Notable NCAAB Teams** (Top 25 + Power Conference programs) hardcoded to filter which college basketball games appear. Prevents the UI from being flooded with 200+ daily D-I games.

---

## 5. Database Schema & Security

### Cloud SQL PostgreSQL (10 tables)

| Table | Purpose | Key Fields |
|---|---|---|
| `games` | Raw game schedule | `game_id` (PK), `sport_key`, `home_team`, `away_team`, `commence_time` |
| `odds` | Current bookmaker odds | `game_id` (FK), `bookmaker`, `market`, ML/spread/total fields |
| `odds_history` | Append-only odds snapshots | Same as `odds` + `captured_at` timestamp |
| `daily_picks` | AI-generated picks | `game_id` (FK), `tier`, `pick_type`, `picked_team`, `confidence`, `rationale` |
| `pick_results` | Settled outcomes | `pick_id` (FK), `result`, `home/away_final_score`, `payout_on_100` |
| `recommended_parlays` | Curated parlays | `parlay_date`, `name`, `legs` (JSONB), `confidence`, `payout_on_100`, `result` |
| `profiles` | User accounts | `id` (Firebase Auth UID), `email`, `subscription_tier`, `granted_tier`, `is_admin` |
| `leaderboard_entries` | User-submitted bet screenshots | `user_id`, `screenshot_url`, `bet_amount`, `verified` |
| `pending_invites` | Admin pre-assigned tiers | `email` (PK), `granted_tier`, `granted_by` |
| `pipeline_runs` | Idempotency tracking | `run_date`, `status`, `stats` |
| `model_predictions` | Model probability snapshots | `game_id`, `home_win_prob`, `projected_total`, `model_version` |

### Security Model (Firebase)

- **Authentication:** Firebase Auth verifies ID tokens on every API request
- **Authorization:** Cloud Functions check user tier via custom claims (`user.admin`) or `profiles` table lookup
- **Fallback auth:** If the `profiles` DB lookup fails (e.g., Firebase UID doesn't match legacy Supabase UUID format), falls back to email-based lookup
- **Admin access:** Verified via custom claims OR `is_admin` column in `profiles`
- **Backend scripts** use `db.js` with `DATABASE_URL` — direct Cloud SQL access with no public exposure
- **No RLS:** Unlike Supabase, Cloud SQL doesn't use RLS. Access control is enforced entirely at the Cloud Functions API layer

### Indexes

The Firebase schema includes 12 indexes for performance: game commence times, sport keys, pick dates/tiers, result lookups, odds history, leaderboard dates, Stripe customer IDs, and subscription tiers.

---

## 6. Evolution & Edit History

### Phase 1: Foundation (Supabase)
- Basic Node.js script that fetched odds and generated picks
- Single-sport (likely NBA) → evolved to multi-sport
- **Supabase** selected as the initial backend (auth + database in one)
- Frontend used `@supabase/supabase-js` client library for direct queries

### Phase 2: Mathematical Model
- `model.js` introduced with logistic win probability calculation
- BallDontLie API integrated for advanced team stats
- Sport-specific configs (`SPORT_CONFIG`) created for NBA, NCAAB, NHL

### Phase 3: AI Integration
- Google Gemini integration via `@google/generative-ai`
- Structured JSON prompt engineering for consistent output
- AI confidence scoring with tier assignment (Lock/Value/Longshot)

### Phase 4: Data Enrichment
- `enricher.js` built as a 7-phase pipeline
- External API integrations: ESPN (injuries), NBA.com (refs), OpenWeatherMap (weather)
- Referee tendency data hardcoded for NBA

### Phase 5: Frontend Evolution
- Static HTML/CSS/JS frontend with glassmorphism dark-mode aesthetic
- Auth gate with Supabase Auth (email + social login)
- Performance tracker, parlay builder sidebar, quick-build mixer

### Phase 6: Self-Calibration
- `calibrator.js` for injecting historical accuracy into AI prompts
- `brier.js` for Brier Score and CLV computation
- `MODEL_EPOCH` concept for clean performance tracking after model updates

### Phase 7: Monetization Scaffolding
- Tiered subscription model (Free/Plus/Pro)
- Content gating via `canAccess()` function
- Stripe checkout flow scaffolded (placeholder price IDs)
- Admin dashboard for user management and tier grants

### Phase 8: Firebase Migration ⭐
- **Complete migration from Supabase to Firebase ecosystem**
- Auth replaced: Supabase Auth → Firebase Auth (compat SDK v10.12.0)
- Database: Supabase PostgreSQL → Cloud SQL PostgreSQL (via `db.js` / `pg` Pool)
- API layer: Direct Supabase client queries → Cloud Functions REST API (`functions/index.js`)
- Hosting: → Firebase Hosting with `/api/**` rewrite to Cloud Functions
- Pipeline: `run-pipeline.sh` cron → Cloud Functions scheduled function (`dailyPipeline`)
- Data export: `export-supabase.js` script created to migrate data from Supabase to Cloud SQL
- Firebase project: `parlay-bot-1772763394`
- Cloud SQL instance: `parlay-bot-fdc` in `us-west1`
- Schema expanded: Added `model_predictions` table and additional indexes

### Phase 9: UI Polish & Bug Fixes
- "Last Updated" timestamp bug addressed
- Safe Bag parlay logic updated to exclude underdogs
- Soccer display issues investigated
- NCAAB filtering introduced (Notable teams list)
- Slate bet buttons added for Full Slate section

---

## 7. Key Nuances & Design Decisions

### 7.1 Dual-Date Fetching
The frontend tries both UTC and local dates when fetching picks/parlays via the API. Handles the edge case where the pipeline runs at midnight UTC but the user is in a US timezone where it's still "today."

### 7.2 Independent Confidence per Bet Type
Each bet type (ML, Spread, O/U) gets its own independently calculated confidence:
- **Moneyline:** Implied probability from odds + home advantage + AI blend (50/50 if AI picked ML, 30/70 if AI picked spread/O/U)
- **Spread:** Compressed from ML confidence via logistic compression — larger spreads → more compression toward 50%
- **O/U:** Independent of ML confidence; uses AI confidence directly if AI picked O/U, otherwise derived from odds juice

### 7.3 Spread Confidence Compression
Spread confidence is always ≤ ML confidence for favorites. A `-15.5` spread gets far more compression toward 50% than a `-3.5` spread. However, **underdog spread confidence CAN exceed their ML confidence** — getting +15.5 points makes covering more likely than winning outright.

### 7.4 Edge Floor Filtering
Not every game gets a pick. The analyzer only surfaces picks where the EV exceeds a configurable threshold.

### 7.5 Parlay Construction Rules
- **Safe Bag:** No underdogs. Only Lock/Value tier picks. Max 3 legs.
- **Big Swing:** Deliberately includes longshots for high payout potential.
- **Cross-sport:** Parlays can mix sports (e.g., NBA + NHL + MLB in one parlay).

### 7.6 Admin Override Pattern
The `SITE_ADMINS` array is hardcoded in *both* `app.js` and `admin.html`. These users always get admin + pro access even if the database is inconsistent, preventing admin lockout.

### 7.7 Firebase Auth Fallback
The Cloud Functions API has a **resilient profile system**: if the Cloud SQL database is unavailable, it constructs a profile from the Firebase Auth token alone (UID, email, display name, admin custom claim). This prevents the entire app from breaking if the database is down.

### 7.8 Soccer Odds Relaxation
Soccer games only require valid moneyline to pass odds validation. Spread and total markets are optional because many international soccer matches don't have those markets on US books.

---

## 8. Advantages

| # | Advantage | Detail |
|---|---|---|
| 1 | **Multi-source data fusion** | 5+ external APIs + 7-phase enrichment creates richer context than any single source |
| 2 | **Self-calibrating AI** | Calibrator feedback loop means the model adjusts for past overconfidence/underconfidence |
| 3 | **Mathematical + AI hybrid** | Model provides objective EV baseline, AI adds contextual nuance — better than either alone |
| 4 | **Multi-sport coverage** | 11 sport keys across basketball, hockey, football, baseball, and 6 soccer leagues |
| 5 | **Firebase ecosystem** | Auth, hosting, Cloud Functions, scheduled jobs — managed infrastructure with minimal ops |
| 6 | **Performance transparency** | Full P&L tracking with Brier Score and CLV gives users real accountability |
| 7 | **Tiered parlay design** | Safe Bag / Value Play / Big Swing gives users options for risk appetite |
| 8 | **Full-stack completeness** | Auth, payments (scaffolded), admin dashboard, social posting, pipeline — complete product |
| 9 | **Closing Line Value tracking** | CLV is the gold standard for measuring betting edge — few consumer tools offer this |
| 10 | **Interactive parlay builder** | Users can create custom parlays beyond the AI's recommendations |
| 11 | **API-first architecture** | Cloud Functions API enables future mobile apps, Discord bots, etc. without backend changes |
| 12 | **Resilient auth fallback** | App works even if Cloud SQL is temporarily unavailable |

---

## 9. Disadvantages & Known Limitations

| # | Issue | Impact | Severity |
|---|---|---|---|
| 1 | **Hardcoded referee data** | `REFEREE_TENDENCIES` is static and becomes stale mid-season | Medium |
| 2 | **NCAAB/MLB/Soccer injury data** | Relies on AI general knowledge instead of live feeds | High |
| 3 | **No live/in-game data** | All analysis is pre-game; no support for live betting | Medium |
| 4 | **Single-bookmaker odds** | Only fetches from one bookmaker (DraftKings priority) | Medium |
| 5 | **API rate limit fragility** | Heavy reliance on free/limited APIs that could throttle | High |
| 6 | **No retry/circuit breaker** | API failures are caught but not retried; enrichment just logs and moves on | Medium |
| 7 | **No automated testing** | Zero unit tests, integration tests, or CI/CD pipeline | High |
| 8 | **No caching layer** | Every page load re-fetches all data from Cloud SQL via Cloud Functions | Medium |
| 9 | **Stripe not connected** | Checkout flow scaffolded with placeholder price IDs; no revenue | Critical |
| 10 | **No Terms / Privacy pages** | Auth gate links to `/terms` and `/privacy` which don't exist | High |
| 11 | **Soccer model is weak** | No BallDontLie coverage for soccer; model uses basic history stats | Medium |
| 12 | **MODEL_EPOCH data gap** | Epoch resets wipe performance history — users lose trust | Medium |
| 13 | **Legacy Supabase code** | Root directory still has the old Supabase-based files; potential confusion | Low |
| 14 | **Cloud Function cold starts** | First API call after idle period may be slow (Firebase cold start) | Low |

---

## 10. Commercial Readiness Assessment

### ✅ Ready for Public

- [x] Firebase Auth (email + Google + social providers)
- [x] Tiered subscription model designed
- [x] Dual-layer content gating (client + server)
- [x] Admin dashboard with user management
- [x] Performance tracking with P&L
- [x] Responsible gambling disclaimer and NCPG hotline link
- [x] 21+ age gate notice
- [x] Professional UI with glassmorphism dark-mode aesthetic
- [x] Multi-sport coverage (11 sport keys)
- [x] Automated daily pipeline (Cloud Functions scheduled)
- [x] Cloud Functions REST API (ready for mobile app expansion)

### ❌ Missing for Commercial Launch

| # | Missing Feature | Why It Matters |
|---|---|---|
| 1 | **Stripe integration** | Can't collect payments without live price IDs and webhook handler |
| 2 | **Terms of Service & Privacy Policy** | Legal requirement; links in UI but pages don't exist |
| 3 | **Error monitoring** (Sentry/DataDog) | Production bugs go undetected without observability |
| 4 | **Automated tests** | No confidence in code changes; deployment is risky |
| 5 | **CI/CD pipeline** | Manual deployment is error-prone |
| 6 | **Rate limit management** | API keys could exhaust without alerts or fallback |
| 7 | **Email notifications** | Users expect daily pick alerts, not just Twitter |
| 8 | **Mobile responsiveness audit** | UI looks designed for desktop; mobile unverified |
| 9 | **SEO / landing page** | No marketing page for user acquisition |
| 10 | **GDPR / data deletion** | No "delete my account" functionality |
| 11 | **Legacy code cleanup** | Root directory Supabase code should be archived or removed |

---

## 11. Public-Ready Features

1. **Firebase Auth system** — Sign in, sign up, password reset, social login, session management
2. **Daily AI picks** — Auto-generated with confidence scores, tiers, and rationale
3. **Three recommended parlays** — Safe Bag, Value Play, Big Swing with calculated payouts
4. **Interactive parlay builder** — Click picks, see combined odds, quick-build mixer
5. **Performance tracker** — Real $100/bet P&L with win rates, ROI, multi-timeframe filters
6. **League & confidence filtering** — Find picks by sport or confidence level
7. **Full game slate with odds** — Live odds for all upcoming games
8. **Admin dashboard** — Manage users, grant/revoke tiers, invite users
9. **Responsible gambling notices** — Age gate, NCPG link, "entertainment only" disclaimer
10. **Professional UI** — Dark mode, glassmorphism, animations, Inter + JetBrains Mono typography

---

## 12. Recommendations for Improvement

### 🔴 Critical (Do First)

**1. Connect Stripe and Go Live with Payments**
Replace placeholder price IDs with real Stripe product/price IDs. Implement the checkout Cloud Function. Add webhook handler for `checkout.session.completed` to auto-upgrade tiers. Add customer portal for subscription management.

**2. Create Terms of Service and Privacy Policy Pages**
The auth gate already links to `/terms` and `/privacy`. Create these pages with standard SaaS terms: no gambling advice guarantee, data collection, payment/refund policies, age requirements.

**3. Add Automated Testing**
- Unit tests for `model.js` (win probability calculations, EV computation)
- Integration tests for `settler.js` (correct grading of ML/spread/O/U)
- Smoke tests for the daily pipeline end-to-end
- Use Jest or Vitest for Node.js testing

**4. Implement Error Monitoring & Alerting**
Add Sentry or similar for runtime error tracking. Alert on pipeline failures, API quota exhaustion (`x-requests-remaining < 50`), and Cloud SQL connection issues.

### 🟡 Important (Do Soon)

**5. Clean Up Legacy Supabase Code**
Archive or remove the Supabase-based files in the root directory. The active codebase is in `Agents/FireBase Agents/`. Having both creates confusion about which files are production.

**6. Build an Email Notification System**
Send daily digest emails with picks and parlays. Use Firebase Extensions + SendGrid or Resend. Include one-click unsubscribe for CAN-SPAM compliance.

**7. Replace Hardcoded Referee Data with a Dynamic Source**
Scrape NBA.com referee assignments daily or use an API. Store in a `referee_stats` table. The current hardcoded approach silently becomes stale.

**8. Add Dedicated Injury Feeds for All Sports**
Currently NCAAB, MLB, and soccer injuries rely on AI knowledge. Integrate ESPN injury reports across all sports or a paid service like Sportradar.

**9. Implement Retry Logic with Exponential Backoff**
All external API calls should retry 2-3 times with exponential delays on 5xx/timeout. Add circuit breaker for persistently failing APIs.

### 🟢 Nice to Have (Do When Possible)

**10. Multi-Bookmaker Odds Comparison**
Show best available odds across bookmakers. The-Odds-API already supports multi-bookmaker queries.

**11. Build a PWA (Progressive Web App)**
Add service worker, manifest, and "Add to Home Screen" to the existing frontend. Minimal effort for major mobile UX improvement.

**12. Historical Model Performance Dashboard**
A public page showing all-time win rate, ROI, Brier Score over time, and CLV trends. Builds trust and serves as marketing material.

**13. User Betslip History & Tracking**
Let users track actual bets, stakes, and results. Calculate personal P&L. Creates retention/stickiness.

**14. Prop Bet Analysis**
Expand beyond game-level bets to player props (points, assists, rebounds, goals). This is where casual bettors spend — especially for parlays.

**15. Push Notifications / Discord Bot**
Pro tier promises "real-time lock alerts." Implement via web push or Discord bot for high-confidence picks.

---

## 13. Technology Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Database** | Cloud SQL (PostgreSQL) via `pg` Pool |
| **Auth** | Firebase Auth (compat SDK v10.12.0) |
| **API** | Firebase Cloud Functions (HTTP + Scheduled) |
| **Hosting** | Firebase Hosting |
| **AI Engine** | Google Gemini via `@google/generative-ai` |
| **Sports Data** | BallDontLie SDK (`@balldontlie/sdk`) |
| **Odds Data** | The-Odds-API (REST) |
| **Injury Data** | ESPN API (REST) |
| **Weather Data** | OpenWeatherMap API (REST) |
| **Referee Data** | NBA.com (scraping) + hardcoded tendencies |
| **Frontend** | Vanilla HTML + CSS + JavaScript |
| **Fonts** | Inter, JetBrains Mono (Google Fonts) |
| **Social Posting** | Twitter/X API v2 (OAuth 1.0a) |
| **Payments** | Stripe (scaffolded, not connected) |
| **Firebase Project** | `parlay-bot-1772763394` |
| **Cloud SQL Instance** | `parlay-bot-fdc` (us-west1) |

---

## 14. External API Dependencies

| API | Purpose | Auth Method | Rate Limits |
|---|---|---|---|
| **The-Odds-API** | Odds, scores | API key | Depends on plan (500/mo free) |
| **BallDontLie** | NBA/NCAAB/NHL stats | API key | Rate limited (varies) |
| **ESPN** | Injury reports | None (public) | Unofficial / fragile |
| **NBA.com** | Referee assignments | None (public) | Unofficial / fragile |
| **OpenWeatherMap** | Weather forecasts | API key | 60 calls/min free |
| **Twitter/X API** | Social posting | OAuth 1.0a | 1500 tweets/mo free |
| **Google Gemini** | AI analysis | API key | Varies by model/tier |

---

## 15. Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `DATABASE_URL` | All backend scripts (via `db.js`) | Cloud SQL PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | Cloud Functions | Firebase project identifier |
| `GEMINI_API_KEY` | `analyzer.js` | Google Gemini API access |
| `BALLDONTLIE_API_KEY` | `model.js`, `enricher.js` | BallDontLie SDK access |
| `ODDS_API_KEY` | `updater.js`, `settler.js`, `enricher.js` | The-Odds-API access |
| `OPENWEATHER_API_KEY` | `enricher.js` | OpenWeatherMap access |
| `TWITTER_API_KEY` | `poster.js` | Twitter OAuth consumer key |
| `TWITTER_API_SECRET` | `poster.js` | Twitter OAuth consumer secret |
| `TWITTER_ACCESS_TOKEN` | `poster.js` | Twitter OAuth access token |
| `TWITTER_ACCESS_SECRET` | `poster.js` | Twitter OAuth access secret |

---

> **Document generated from full codebase analysis.**
> Files analyzed: Root legacy codebase (11 files) + Firebase codebase in `Agents/FireBase Agents/` (frontend `public/`, Cloud Functions `functions/`, pipeline scripts, `db.js`, `schema.sql`, `firebase.json`, `.firebaserc`)
