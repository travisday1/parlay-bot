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

// ===== SITE OWNER / ADMIN OVERRIDE =====
// These user IDs always get full admin + pro access regardless of DB or RLS state
const SITE_ADMINS = ['f4128156-bc33-475c-b715-30120b0fb35b'];

// ===== AUTH STATE =====
let currentUser = null;
let userProfile = null;
let authMode = 'signin'; // 'signin' or 'signup'

// ===== STRIPE PRICE IDS (replace with actual IDs after Stripe setup) =====
const STRIPE_PRICES = {
    plus_monthly: 'price_REPLACE_WITH_ACTUAL_ID',
    plus_annual: 'price_REPLACE_WITH_ACTUAL_ID',
    pro_monthly: 'price_REPLACE_WITH_ACTUAL_ID',
    pro_annual: 'price_REPLACE_WITH_ACTUAL_ID',
};

// ===== STATE =====
let GAMES = [];
let PICKED_GAMES = [];
let SLATE_GAMES = [];
let RECOMMENDED_PARLAYS = [];
let selectedPicks = [];
let dataLoaded = false;
let activeConfFilters = new Set(); // multi-select confidence filter: 'lock', 'lean', 'tossup'

// ===== LEAGUE CONFIG =====
const LEAGUE_MAP = {
    'basketball_nba': { id: 'nba', icon: '🏀', label: 'NBA' },
    'basketball_ncaab': { id: 'ncaab', icon: '🏀', label: 'NCAAB' },
    'icehockey_nhl': { id: 'nhl', icon: '🏒', label: 'NHL' },
    'americanfootball_nfl': { id: 'nfl', icon: '🏈', label: 'NFL' },
    'baseball_mlb': { id: 'mlb', icon: '⚾', label: 'MLB' },
    // Soccer
    'soccer_usa_mls': { id: 'mls', icon: '⚽', label: 'MLS' },
    'soccer_epl': { id: 'epl', icon: '⚽', label: 'EPL' },
    'soccer_spain_la_liga': { id: 'laliga', icon: '⚽', label: 'La Liga' },
    'soccer_germany_bundesliga': { id: 'bundesliga', icon: '⚽', label: 'Bundesliga' },
    'soccer_france_ligue_one': { id: 'ligue1', icon: '⚽', label: 'Ligue 1' },
    'soccer_italy_serie_a': { id: 'seriea', icon: '⚽', label: 'Serie A' },
};

// ===== MODEL EPOCH =====
// Performance tracker will not look back before this date.
// Reset this when the model is updated to start fresh tracking.
const MODEL_EPOCH = '2026-03-11';

// ===== NCAAB FILTER: Top 25 + Power Conference Programs =====
const NOTABLE_NCAAB_TEAMS = [
    'duke blue devils', 'arizona wildcats', 'michigan wolverines',
    'uconn huskies', 'connecticut huskies', 'florida gators',
    'iowa state cyclones', 'houston cougars', 'michigan state spartans',
    'nebraska cornhuskers', 'texas tech red raiders', 'illinois fighting illini',
    'gonzaga bulldogs', 'virginia cavaliers', 'kansas jayhawks',
    'purdue boilermakers', 'alabama crimson tide', 'north carolina tar heels',
    'st. john\'s red storm', 'saint john\'s red storm',
    'miami hurricanes', 'arkansas razorbacks',
    'saint mary\'s gaels', 'tennessee volunteers',
    'vanderbilt commodores', 'saint louis billikens',
    'kentucky wildcats', 'auburn tigers', 'baylor bears',
    'marquette golden eagles', 'creighton bluejays', 'xavier musketeers',
    'villanova wildcats', 'texas longhorns', 'oregon ducks',
    'wisconsin badgers', 'ucla bruins', 'memphis tigers',
    'indiana hoosiers', 'ohio state buckeyes', 'syracuse orange',
    'louisville cardinals', 'georgetown hoyas', 'clemson tigers',
    'maryland terrapins', 'oklahoma sooners', 'colorado buffaloes',
    'cincinnati bearcats', 'pittsburgh panthers', 'west virginia mountaineers',
    'usc trojans', 'iowa hawkeyes', 'michigan state', 'notre dame fighting irish',
    'stanford cardinal', 'penn state nittany lions', 'rutgers scarlet knights',
    'ole miss rebels', 'mississippi state bulldogs', 'lsu tigers',
    'georgia bulldogs', 'south carolina gamecocks', 'missouri tigers',
    'florida state seminoles', 'wake forest demon deacons',
    'nc state wolfpack', 'north carolina state',
    'texas a&m aggies', 'smu mustangs', 'tcu horned frogs',
    'kansas state wildcats', 'oklahoma state cowboys',
    'providence friars', 'butler bulldogs', 'dayton flyers',
    'san diego state aztecs', 'byu cougars', 'new mexico lobos',
];
const NCAAB_KEYWORDS = NOTABLE_NCAAB_TEAMS.map(t => t.toLowerCase());

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateEl = document.getElementById('header-date');
    if (dateEl) dateEl.textContent = dateStr;
    document.title = `Parlay Bot | ${dateStr}`;
    checkAuth();
});
async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();

    if (session) {
        currentUser = session.user;
        await loadUserProfile();
        showApp();
    } else {
        document.getElementById('auth-gate').style.display = 'flex';
    }

    // Listen for auth state changes (handles OAuth redirects)
    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await loadUserProfile();
            showApp();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            document.getElementById('auth-gate').style.display = 'flex';
            document.getElementById('app-wrapper').style.display = 'none';
        }
    });
}

// ===== AUTH: Load User Profile =====
async function loadUserProfile() {
    if (!currentUser) return;
    const { data: profile, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.warn('Profile load error:', error.message);
        // Only create a new profile if one truly doesn't exist — don't overwrite existing data
        const { data: newProfile, error: upsertErr } = await sb
            .from('profiles')
            .insert({
                id: currentUser.id,
                email: currentUser.email,
                display_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User',
                avatar_url: currentUser.user_metadata?.avatar_url || null,
                subscription_tier: 'free'
            })
            .select()
            .single();
        if (upsertErr) {
            console.warn('Profile insert failed (may already exist):', upsertErr.message);
            // Profile exists but we can't read it — default to free
            userProfile = { subscription_tier: 'free', is_admin: false };
        } else {
            userProfile = newProfile;
        }
    } else {
        userProfile = profile;
    }
    // Resolve effective tier: granted_tier overrides subscription_tier
    if (userProfile) {
        userProfile.effectiveTier = userProfile.granted_tier || userProfile.subscription_tier || 'free';
        console.log('Profile loaded:', { tier: userProfile.effectiveTier, admin: userProfile.is_admin, email: userProfile.email });
    }
}

// ===== AUTH: Tier Helpers =====
function getUserTier() {
    // Hardcoded admin override — always pro
    if (currentUser && SITE_ADMINS.includes(currentUser.id)) return 'pro';
    if (!userProfile) return 'free';
    return userProfile.effectiveTier || 'free';
}
function isAdmin() {
    // Hardcoded admin override
    if (currentUser && SITE_ADMINS.includes(currentUser.id)) return true;
    return userProfile?.is_admin === true;
}

// ===== AUTH: Email Sign In / Sign Up =====
async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';

    if (!email || !password) {
        errorEl.textContent = 'Please enter email and password.';
        errorEl.style.display = 'block';
        errorEl.style.color = '#ff5252';
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'block';
        errorEl.style.color = '#ff5252';
        return;
    }

    try {
        if (authMode === 'signup') {
            const displayName = document.getElementById('auth-name')?.value?.trim() || '';
            const { error } = await sb.auth.signUp({
                email, password,
                options: { data: { full_name: displayName } }
            });
            if (error) throw error;
            errorEl.textContent = 'Check your email for a confirmation link!';
            errorEl.style.display = 'block';
            errorEl.style.color = '#4fc3f7';
        } else {
            const { error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            // onAuthStateChange will handle the rest
        }
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        errorEl.style.color = '#ff5252';
    }
}

// ===== AUTH: Social Login =====
async function signInWithProvider(provider) {
    const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
        const errorEl = document.getElementById('auth-error');
        // Friendly message when provider isn't configured in Supabase yet
        if (error.message.includes('provider') || error.message.includes('Unsupported')) {
            errorEl.textContent = `${provider.charAt(0).toUpperCase() + provider.slice(1)} login coming soon! Use email/password for now.`;
        } else {
            errorEl.textContent = error.message;
        }
        errorEl.style.display = 'block';
        errorEl.style.color = '#fbbf24'; // warn-yellow instead of red
    }
}

// ===== AUTH: Toggle Sign In / Sign Up =====
function toggleAuthMode() {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    const btn = document.getElementById('auth-submit-btn');
    const link = document.getElementById('auth-toggle-link');
    const nameField = document.getElementById('auth-name-field');

    if (authMode === 'signup') {
        btn.textContent = 'Create Account';
        link.textContent = 'Already have an account? Sign in';
        nameField.style.display = 'block';
    } else {
        btn.textContent = 'Sign In';
        link.textContent = "Don't have an account? Sign up";
        nameField.style.display = 'none';
    }
    document.getElementById('auth-error').style.display = 'none';
}

// ===== AUTH: Password Reset =====
async function sendPasswordReset() {
    const email = document.getElementById('auth-email').value.trim();
    const errorEl = document.getElementById('auth-error');
    if (!email) {
        errorEl.textContent = 'Enter your email address first.';
        errorEl.style.display = 'block';
        errorEl.style.color = '#ff5252';
        return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        errorEl.style.color = '#ff5252';
    } else {
        errorEl.textContent = 'Password reset email sent! Check your inbox.';
        errorEl.style.display = 'block';
        errorEl.style.color = '#4fc3f7';
    }
}

// ===== AUTH: Sign Out =====
async function signOut() {
    await sb.auth.signOut();
    currentUser = null;
    userProfile = null;
    window.location.reload();
}

// ===== CONTENT GATING =====
function canAccess(feature) {
    const tier = getUserTier();
    const access = {
        'all_picks': ['plus', 'pro'],
        'all_parlays': ['plus', 'pro'],
        'value_parlay': ['free', 'plus', 'pro'],
        'top_3_locks': ['free', 'plus', 'pro'],
        'full_rationale': ['plus', 'pro'],
        'full_confidence': ['plus', 'pro'],
        'performance_30d': ['plus', 'pro'],
        'performance_full': ['pro'],
        'custom_parlay_save': ['plus', 'pro'],
        'unlimited_saves': ['pro'],
        'calibration_dashboard': ['pro'],
        'clv_analysis': ['pro'],
        'alerts': ['pro'],
        'no_ads': ['plus', 'pro'],
    };
    if (isAdmin()) return true;
    const allowed = access[feature] || [];
    return allowed.includes(tier);
}

// ===== UPGRADE MODAL =====
function openUpgradeModal() {
    const existing = document.getElementById('upgrade-modal');
    if (existing) { existing.style.display = 'flex'; return; }
    const modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 600px;">
            <button class="modal-close" onclick="document.getElementById('upgrade-modal').style.display='none'">✕</button>
            <h2 style="text-align: center; margin-bottom: 8px;">Unlock Full Access</h2>
            <p style="text-align: center; color: rgba(255,255,255,0.6); margin-bottom: 24px;">Choose the plan that fits your game</p>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
                <div class="pricing-card">
                    <h3>Plus</h3>
                    <div class="pricing-amount">$9.99<span>/mo</span></div>
                    <ul class="pricing-features">
                        <li>All picks, all sports</li>
                        <li>All 3 daily parlays</li>
                        <li>Full AI rationale</li>
                        <li>30-day performance history</li>
                        <li>No ads</li>
                    </ul>
                    <button class="pricing-btn" onclick="startCheckout('plus')">Get Plus</button>
                    <p class="pricing-annual">or $79.99/year (save 33%)</p>
                </div>
                <div class="pricing-card featured">
                    <div class="pricing-badge">BEST VALUE</div>
                    <h3>Pro</h3>
                    <div class="pricing-amount">$24.99<span>/mo</span></div>
                    <ul class="pricing-features">
                        <li>Everything in Plus</li>
                        <li>Full performance history + export</li>
                        <li>Model calibration dashboard</li>
                        <li>Closing line value analysis</li>
                        <li>Real-time lock alerts</li>
                        <li>Discord community access</li>
                    </ul>
                    <button class="pricing-btn pro-btn" onclick="startCheckout('pro')">Get Pro</button>
                    <p class="pricing-annual">or $199.99/year (save 33%)</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ===== STRIPE CHECKOUT =====
async function startCheckout(tier, annual = false) {
    const priceKey = `${tier}_${annual ? 'annual' : 'monthly'}`;
    const priceId = STRIPE_PRICES[priceKey];
    if (!priceId || priceId.includes('REPLACE')) {
        alert('Stripe checkout is not configured yet. Contact support.');
        return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert('Please sign in first.'); return; }
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                priceId,
                successUrl: window.location.origin + window.location.pathname + '?checkout=success',
                cancelUrl: window.location.origin + window.location.pathname + '?checkout=cancel',
            }),
        });
        const { url, error } = await response.json();
        if (error) throw new Error(error);
        if (url) window.location.href = url;
    } catch (err) {
        console.error('Checkout error:', err);
        alert('Error starting checkout. Please try again.');
    }
}

// ===== USER MENU (Dropdown) =====
function updateUserMenu() {
    const menuEl = document.getElementById('user-menu');
    if (!menuEl) return;
    const tier = getUserTier();
    const tierBadge = tier === 'pro' ? '⭐ PRO' : tier === 'plus' ? '✅ PLUS' : '🆓 FREE';
    const displayName = userProfile?.display_name || userProfile?.email?.split('@')[0] || 'User';
    const email = currentUser?.email || userProfile?.email || '';
    const initials = displayName.charAt(0).toUpperCase();

    menuEl.innerHTML = `
        <div class="user-menu-trigger" onclick="toggleUserDropdown(event)">
            <div class="user-avatar">${initials}</div>
            <span class="user-tier-badge tier-${tier}">${tierBadge}</span>
            <svg class="dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="user-dropdown" id="user-dropdown">
            <div class="dropdown-header">
                <div class="dropdown-user-name">${displayName}</div>
                <div class="dropdown-user-email">${email}</div>
            </div>
            <div class="dropdown-divider"></div>
            <a href="#" class="dropdown-item" onclick="openSettingsModal(); closeUserDropdown(); return false;">
                <span class="dropdown-icon">⚙️</span> Account Settings
            </a>
            ${tier === 'free' ? '<a href="#" class="dropdown-item upgrade-item" onclick="openUpgradeModal(); closeUserDropdown(); return false;"><span class="dropdown-icon">🚀</span> Upgrade Plan</a>' : ''}
            ${isAdmin() ? '<a href="admin.html" class="dropdown-item admin-item"><span class="dropdown-icon">🛡️</span> Admin Dashboard</a>' : ''}
            <div class="dropdown-divider"></div>
            <a href="#" class="dropdown-item signout-item" onclick="signOut(); return false;">
                <span class="dropdown-icon">🚪</span> Sign Out
            </a>
        </div>
    `;
}

function toggleUserDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('user-dropdown');
    if (!dd) return;
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) {
        const trigger = e.currentTarget;
        const rect = trigger.getBoundingClientRect();
        dd.style.top = (rect.bottom + 8) + 'px';
        dd.style.right = (window.innerWidth - rect.right) + 'px';
    }
}
function closeUserDropdown() {
    const dd = document.getElementById('user-dropdown');
    if (dd) dd.classList.remove('open');
}
// Close dropdown when clicking outside
document.addEventListener('click', () => closeUserDropdown());

// ===== SIGN OUT =====
async function signOut() {
    if (!confirm('Are you sure you want to sign out?')) return;
    await sb.auth.signOut();
    currentUser = null;
    userProfile = null;
    window.location.reload();
}

// ===== SETTINGS MODAL =====
function openSettingsModal() {
    const existing = document.getElementById('settings-modal');
    if (existing) { existing.style.display = 'flex'; return; }

    const displayName = userProfile?.display_name || '';
    const email = currentUser?.email || userProfile?.email || '';
    const tier = getUserTier();
    const tierLabel = tier === 'pro' ? 'Pro' : tier === 'plus' ? 'Plus' : 'Free';

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="settings-card">
            <div class="settings-header">
                <h2>⚙️ Account Settings</h2>
                <button class="modal-close" onclick="document.getElementById('settings-modal').style.display='none'">✕</button>
            </div>

            <div class="settings-section">
                <label class="settings-label">Email</label>
                <input type="text" class="settings-input" value="${email}" disabled style="opacity: 0.6;">
            </div>

            <div class="settings-section">
                <label class="settings-label">Display Name</label>
                <input type="text" class="settings-input" id="settings-display-name" value="${displayName}" placeholder="Enter display name">
            </div>

            <div class="settings-section">
                <label class="settings-label">Current Plan</label>
                <div class="settings-plan-badge tier-${tier}">${tierLabel}</div>
            </div>

            <div class="settings-actions">
                <button class="settings-save-btn" onclick="saveSettings()">Save Changes</button>
                <button class="settings-password-btn" onclick="resetPassword()">Reset Password</button>
            </div>

            <div id="settings-message" style="display: none; margin-top: 12px; padding: 8px 12px; border-radius: 8px; font-size: 0.85rem;"></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

async function saveSettings() {
    const nameInput = document.getElementById('settings-display-name');
    const msg = document.getElementById('settings-message');
    if (!nameInput || !msg) return;
    const newName = nameInput.value.trim();
    if (!newName) { showSettingsMsg('Please enter a display name.', '#f87171'); return; }

    const { error } = await sb.from('profiles').update({ display_name: newName }).eq('id', currentUser.id);
    if (error) {
        showSettingsMsg('Error saving: ' + error.message, '#f87171');
    } else {
        if (userProfile) userProfile.display_name = newName;
        updateUserMenu();
        showSettingsMsg('Settings saved!', '#34d399');
    }
}

async function resetPassword() {
    const email = currentUser?.email;
    if (!email) return;
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });
    const msg = document.getElementById('settings-message');
    if (error) {
        showSettingsMsg('Error: ' + error.message, '#f87171');
    } else {
        showSettingsMsg('Password reset email sent! Check your inbox.', '#34d399');
    }
}

function showSettingsMsg(text, color) {
    const msg = document.getElementById('settings-message');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    msg.style.background = color === '#34d399' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)';
    msg.style.color = color;
    msg.style.border = `1px solid ${color}30`;
}

// ===== SHOW APP =====
async function showApp() {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';
    updateUserMenu();

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

        // Split into picked games (non-skip, sorted by tier priority) and full slate
        const TIER_ORDER = { lock: 0, value: 1, longshot: 2 };
        PICKED_GAMES = GAMES
            .filter(g => g.tier && g.tier !== 'skip')
            .sort((a, b) => {
                const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
                if (tierDiff !== 0) return tierDiff;
                // Within same tier, sort by highest confidence descending
                const aMax = Math.max(a.confidence.homeML, a.confidence.awayML);
                const bMax = Math.max(b.confidence.homeML, b.confidence.awayML);
                return bMax - aMax;
            });
        SLATE_GAMES = GAMES; // Full slate includes everything

        RECOMMENDED_PARLAYS = transformParlays(parlays);
        dataLoaded = true;

        console.log(`✅ Loaded ${GAMES.length} games, ${picks?.length || 0} picks, ${RECOMMENDED_PARLAYS.length} parlays from Supabase`);

        // Remove loading spinner
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.style.display = 'none';

        // Update "Last Updated" timestamp — use the most recent created_at from games, picks, or parlays
        const allTimestamps = [
            ...(games || []).map(g => new Date(g.created_at || 0)),
            ...(picks || []).map(p => new Date(p.created_at || 0)),
            ...(parlays || []).map(p => new Date(p.created_at || 0)),
        ];
        if (allTimestamps.length > 0) {
            const latestUpdate = allTimestamps.reduce((latest, t) => t > latest ? t : latest, new Date(0));
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
        const grid = document.getElementById('picks-grid');
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
    let supportedGames = games.filter(game => LEAGUE_MAP[game.sport_key]);

    // NCAAB: Only show games that have been analyzed by AI (have picks)
    // This is the platform's value — showing AI-analyzed games, not all matchups
    supportedGames = supportedGames.filter(game => {
        if (game.sport_key !== 'basketball_ncaab') return true;
        return picks?.some(p => p.game_id === game.game_id);
    });
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
        const pickConf = pick?.confidence || 50;
        const homeML = odds.home_odds || -150;
        const awayML = odds.away_odds || +130;

        // 1. MONEYLINE: Use implied probability from the actual odds
        //    -800 → ~89%, -150 → ~60%, +130 → ~43%, +300 → ~25%
        function impliedProb(americanOdds) {
            if (!americanOdds || americanOdds === 0) return 50;
            if (americanOdds < 0) return Math.round(Math.abs(americanOdds) / (Math.abs(americanOdds) + 100) * 100);
            return Math.round(100 / (americanOdds + 100) * 100);
        }

        // Home court/ice/field advantage varies by sport
        const HOME_ADVANTAGE_MAP = {
            'nba': 3,
            'ncaab': 4,
            'nhl': 1.5,
            'nfl': 2.5,
            'mlb': 1,
            'mls': 2, 'epl': 2, 'laliga': 2,
            'bundesliga': 2, 'ligue1': 2, 'seriea': 2,
        };
        const HOME_ADVANTAGE = HOME_ADVANTAGE_MAP[leagueInfo.id] || 2;
        let homeMLConf = Math.min(97, impliedProb(homeML) + HOME_ADVANTAGE);
        let awayMLConf = Math.max(3, impliedProb(awayML) - HOME_ADVANTAGE);

        // Blend AI confidence into ML based on pick type:
        //   - ML pick → 50/50 blend (strongest AI signal for ML)
        //   - Spread/O/U pick → 30/70 (AI analyzed the game but focused on spread/total)
        if (pick && pick.pick_type === 'moneyline') {
            if (pick.picked_team === game.home_team) {
                homeMLConf = Math.round(homeMLConf * 0.5 + pickConf * 0.5);
                awayMLConf = 100 - homeMLConf;
            } else if (pick.picked_team === game.away_team) {
                awayMLConf = Math.round(awayMLConf * 0.5 + pickConf * 0.5);
                homeMLConf = 100 - awayMLConf;
            }
        } else if (pick && (pick.pick_type === 'spread' || pick.pick_type === 'over' || pick.pick_type === 'under')) {
            // AI analyzed this game — lightly blend their view into ML
            if (pick.picked_team === game.home_team) {
                homeMLConf = Math.round(homeMLConf * 0.7 + pickConf * 0.3);
                awayMLConf = 100 - homeMLConf;
            } else if (pick.picked_team === game.away_team) {
                awayMLConf = Math.round(awayMLConf * 0.7 + pickConf * 0.3);
                homeMLConf = 100 - awayMLConf;
            }
        }

        // 2. SPREAD: AI's confidence that each team covers the spread
        //    Spread confidence is always derived from ML confidence (compressed toward 50%)
        //    because covering a spread is harder than winning outright.
        //    When AI picks the spread, we blend its confidence with the derived value.
        //    Spread confidence is ALWAYS capped at or below the ML confidence.

        // First: compute the base spread confidence from ML (compressed toward 50%)
        // Larger spreads = harder to cover = more compression toward 50%
        const spreadSize = Math.abs(homeSpread);
        const compression = Math.max(0.15, 0.45 - spreadSize * 0.02);
        // e.g. -3.5 → 0.38 (close to ML), -7.5 → 0.30, -15.5 → 0.14 (near 50%)
        const homeSpreadBase = Math.round(50 + (homeMLConf - 50) * compression);
        const awaySpreadBase = Math.round(50 + (awayMLConf - 50) * compression);

        let homeSpreadConf = homeSpreadBase;
        let awaySpreadConf = awaySpreadBase;

        if (pick && pick.pick_type === 'spread') {
            // AI analyzed the spread — blend AI confidence with ML-derived (60/40 weight)
            if (pick.picked_team === game.home_team) {
                homeSpreadConf = Math.round(homeSpreadBase * 0.4 + pickConf * 0.6);
                awaySpreadConf = 100 - homeSpreadConf;
            } else if (pick.picked_team === game.away_team) {
                awaySpreadConf = Math.round(awaySpreadBase * 0.4 + pickConf * 0.6);
                homeSpreadConf = 100 - awaySpreadConf;
            }
        }

        // Cap: FAVORITE's spread confidence should never exceed their ML confidence
        // (you can't be more confident of covering the spread than winning outright)
        // But UNDERDOG's spread confidence CAN exceed their ML — getting +points makes
        // covering more likely than winning (e.g., 10% ML but 53% to cover +15.5)
        if (homeSpread < 0) {
            // Home is favorite — cap home spread at home ML
            homeSpreadConf = Math.min(homeSpreadConf, homeMLConf);
        } else {
            // Away is favorite — cap away spread at away ML
            awaySpreadConf = Math.min(awaySpreadConf, awayMLConf);
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
            // Standard -110/-110 gives ~52%/48% — add slight differentiation
            // based on whether the favorite is home (home games tend toward overs)
            const baseOver = impliedProb(overOddsVal);
            const baseUnder = impliedProb(underOddsVal);
            // Nudge based on juice difference (if any) to create differentiation
            const juiceDiff = Math.abs(overOddsVal) - Math.abs(underOddsVal);
            const nudge = Math.round(juiceDiff * 0.05); // slight adjustment from juice
            overConf = Math.max(35, Math.min(65, baseOver + nudge));
            underConf = Math.max(35, Math.min(65, baseUnder - nudge));
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
            injuries: buildIntelItems(pick, game, Math.max(homeMLConf, awayMLConf)),
            tier: pick?.tier || 'skip',
        };
    });
}

function buildIntelItems(pick, game, recalcConf) {
    // recalcConf = the recalculated overall confidence from our model
    const items = [];
    const conf = recalcConf || (pick?.confidence) || 50;
    if (pick) {
        // Use recalculated confidence for the display, matching the tag
        if (conf >= 75) {
            items.push({ icon: '🔒', text: `LOCK — ${conf}% AI confidence on ${pick.picked_team}` });
        } else if (conf >= 60) {
            items.push({ icon: '💰', text: `VALUE PLAY — ${conf}% confidence on ${pick.picked_team}` });
        } else {
            items.push({ icon: '🎲', text: `TOSS-UP — ${conf}% confidence on ${pick.picked_team}` });
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

    const processed = parlays
        .map(p => {
            // Map legs and filter out any where the game isn't in our analyzed GAMES array
            const validLegs = (p.legs || []).map(leg => {
                const teamName = leg.team || leg.picked_team || leg.pick || '?';
                const realConf = lookupConfidence(teamName, leg.odds, leg.game);
                if (realConf === null) return null; // Game not in GAMES — skip this leg
                return {
                    team: teamName,
                    odds: leg.odds || -110,
                    conf: realConf,
                    game: leg.game || '',
                    pick_type: leg.pick_type || 'moneyline',
                    picked_line: leg.picked_line || null
                };
            }).filter(Boolean);

            // Recalculate quality from actual leg confidences
            const minConf = validLegs.length > 0 ? Math.min(...validLegs.map(l => l.conf)) : 0;


            return {
                originalName: p.name,
                originalTier: p.tier,
                minConf,
                legs: validLegs,
                rationale: p.rationale || 'AI-generated parlay combination.',
            };
        })
        .filter(p => p.legs.length >= 1) // Allow single-leg parlays (e.g. Safe Bag override)
        .sort((a, b) => b.minConf - a.minConf); // Best (highest min confidence) first

    // Use the AI's ORIGINAL tier from the database, not positional re-ranking
    const tierNames = { 'safe': '🔒 The Safe Bag', 'value': '⚡ The Value Play', 'longshot': '🎲 The Big Swing' };
    const tierBadges = { 'safe': 'Highest Confidence', 'value': 'Best Value', 'longshot': 'High Risk / High Reward' };
    const tierClasses = { 'safe': 'safe', 'value': 'value', 'longshot': 'longshot' };

    return processed.map((p) => ({
        name: tierNames[p.originalTier] || p.originalName,
        tier: tierClasses[p.originalTier] || 'value',
        badge: tierBadges[p.originalTier] || 'AI Parlay',
        legs: p.legs,
        rationale: p.rationale,
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
        // Soccer — EPL
        'Manchester City': 'MCI', 'Manchester United': 'MUN', 'Liverpool': 'LIV',
        'Arsenal': 'ARS', 'Chelsea': 'CHE', 'Tottenham Hotspur': 'TOT',
        'Newcastle United': 'NEW', 'Aston Villa': 'AVL', 'Brighton and Hove Albion': 'BHA',
        'West Ham United': 'WHU', 'Crystal Palace': 'CRY', 'Fulham': 'FUL',
        'Brentford': 'BRE', 'Wolverhampton Wanderers': 'WOL', 'Nottingham Forest': 'NFO',
        'Everton': 'EVE', 'Bournemouth': 'BOU', 'Leicester City': 'LEI',
        'Ipswich Town': 'IPS', 'Southampton': 'SOU',
        // Soccer — La Liga
        'Real Madrid': 'RMA', 'FC Barcelona': 'BAR', 'Atletico Madrid': 'ATM',
        'Real Sociedad': 'RSO', 'Real Betis': 'BET', 'Athletic Bilbao': 'ATH',
        'Villarreal': 'VIL', 'Girona': 'GIR', 'Sevilla': 'SEV', 'Valencia': 'VAL',
        'Celta Vigo': 'CEL', 'Osasuna': 'OSA', 'Getafe': 'GET', 'Mallorca': 'MLL',
        // Soccer — Bundesliga
        'Bayern Munich': 'BAY', 'Borussia Dortmund': 'BVB', 'RB Leipzig': 'RBL',
        'Bayer Leverkusen': 'LEV', 'VfB Stuttgart': 'STU', 'Eintracht Frankfurt': 'SGE',
        'SC Freiburg': 'SCF', 'VfL Wolfsburg': 'WOB', 'TSG Hoffenheim': 'TSG',
        'Borussia Monchengladbach': 'BMG', 'Union Berlin': 'FCU', 'Werder Bremen': 'SVW',
        // Soccer — Ligue 1
        'Paris Saint Germain': 'PSG', 'Olympique de Marseille': 'OM', 'AS Monaco': 'MON',
        'Olympique Lyonnais': 'OL', 'LOSC Lille': 'LIL', 'OGC Nice': 'NIC',
        'RC Lens': 'LEN', 'Stade Rennais': 'REN', 'RC Strasbourg': 'STR',
        // Soccer — Serie A
        'Inter Milan': 'INT', 'AC Milan': 'ACM', 'Juventus': 'JUV',
        'SSC Napoli': 'NAP', 'AS Roma': 'ROM', 'SS Lazio': 'LAZ',
        'Atalanta': 'ATA', 'ACF Fiorentina': 'FIO', 'Bologna': 'BOL',
        'Torino': 'TOR', 'Udinese': 'UDI', 'Genoa': 'GEN',
        // Soccer — MLS
        'Atlanta United': 'ATL', 'Austin FC': 'ATX', 'CF Montreal': 'MTL',
        'Charlotte FC': 'CLT', 'Chicago Fire': 'CHI', 'Cincinnati': 'CIN',
        'Colorado Rapids': 'COL', 'Columbus Crew': 'CLB', 'DC United': 'DCU',
        'FC Dallas': 'DAL', 'Houston Dynamo': 'HOU', 'Inter Miami': 'MIA',
        'LA Galaxy': 'LAG', 'Los Angeles FC': 'LAFC', 'Minnesota United': 'MIN',
        'Nashville SC': 'NSH', 'New England Revolution': 'NER',
        'New York City FC': 'NYC', 'New York Red Bulls': 'NYRB',
        'Orlando City': 'ORL', 'Philadelphia Union': 'PHI',
        'Portland Timbers': 'POR', 'Real Salt Lake': 'RSL',
        'San Jose Earthquakes': 'SJE', 'Seattle Sounders': 'SEA',
        'Sporting Kansas City': 'SKC', 'St Louis City': 'STL',
        'Toronto FC': 'TFC', 'Vancouver Whitecaps': 'VAN',
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

// ===== RENDER PICKS + FULL SLATE =====
function renderGames() {
    // === PICKS SECTION (primary — only games with AI picks) ===
    const picksGrid = document.getElementById('picks-grid');
    const noPicksMsg = document.getElementById('no-picks-msg');

    if (PICKED_GAMES.length === 0 && dataLoaded) {
        if (picksGrid) picksGrid.innerHTML = '';
        if (noPicksMsg) noPicksMsg.style.display = 'block';
    } else {
        if (noPicksMsg) noPicksMsg.style.display = 'none';
        if (picksGrid) picksGrid.innerHTML = PICKED_GAMES.map(game => createGameCard(game)).join('');
    }

    // Update tier counters on confidence filter buttons
    updateTierCounters();

    // Apply confidence filter after rendering
    applyConfidenceFilter();

    // === FULL SLATE SECTION (secondary — all games, compact) ===
    renderSlate();
}

// IDs of games that have picks (for the "Pick ↑" indicator in slate)
function getPickedGameIds() {
    return new Set(PICKED_GAMES.map(g => g.id));
}

function renderSlate() {
    const slateGrid = document.getElementById('slate-grid');
    if (!slateGrid) return;

    if (SLATE_GAMES.length === 0 && dataLoaded) {
        slateGrid.innerHTML = '<div class="loading-state"><p>No games scheduled for today.</p></div>';
        return;
    }

    const pickedIds = getPickedGameIds();
    slateGrid.innerHTML = SLATE_GAMES.map(game => createSlateRow(game, pickedIds.has(game.id))).join('');
}

function createSlateRow(game, hasPick) {
    const pickIndicator = hasPick
        ? '<span class="slate-pick-indicator" title="Bot pick above">🤖 Pick ↑</span>'
        : '';

    const spreadLabel = game.spread.value !== 0
        ? `${game.spread.team} ${game.spread.value}`
        : 'No line';

    return `
        <div class="slate-row" data-league="${game.league}" data-id="${game.id}">
            <div class="slate-time">
                <span class="league-tag ${game.league}" style="font-size:0.65rem;padding:2px 6px;">${game.league.toUpperCase()}</span>
                <span>${game.time}</span>
            </div>
            <div class="slate-matchup">
                <span class="slate-team">${game.away.abbr}</span>
                <span class="slate-vs">@</span>
                <span class="slate-team">${game.home.abbr}</span>
                ${pickIndicator}
            </div>
            <div class="slate-odds">
                <div class="slate-odds-cell">
                    <span class="slate-odds-label">ML</span>
                    <span class="slate-odds-val">${(Math.abs(game.moneyline.away) > 10000 || Math.abs(game.moneyline.home) > 10000) ? 'Off board' : `${formatOdds(game.moneyline.away)} / ${formatOdds(game.moneyline.home)}`}</span>
                </div>
                <div class="slate-odds-cell">
                    <span class="slate-odds-label">Spread</span>
                    <span class="slate-odds-val">${spreadLabel}</span>
                </div>
                <div class="slate-odds-cell">
                    <span class="slate-odds-label">O/U</span>
                    <span class="slate-odds-val">${game.overUnder.total || '—'}</span>
                </div>
            </div>
        </div>
    `;
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
    // Use ONLY recalculated confidence — not the AI's raw tier label
    // This ensures the tag always matches the displayed confidence %
    const c = getOverallConfidence(game);
    if (c >= 75) return { label: '🔒 LOCK', cls: 'lock' };
    if (c >= 60) return { label: '✅ LEAN', cls: 'lean' };
    if (c >= 50) return { label: '👍 LEAN', cls: 'lean' };
    return { label: '⚠️ TOSS-UP', cls: 'tossup' };
}

function createGameCard(game) {
    const isNHL = game.league === 'nhl';
    const SOCCER_LEAGUES = ['mls', 'epl', 'laliga', 'bundesliga', 'ligue1', 'seriea'];
    const isSoccer = SOCCER_LEAGUES.includes(game.league);
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
    // Use per-side spread confidence (independently capped at each team's ML confidence)
    const isFavHome = favTeam === game.home.abbr;
    const favSpreadConf = isFavHome ? game.confidence.spreadHome : game.confidence.spreadAway;
    const dogSpreadConf = isFavHome ? game.confidence.spreadAway : game.confidence.spreadHome;

    // Content gating: free users only see Lock-tier cards fully
    const isLock = tag.cls === 'lock';
    const gatedClass = (!canAccess('all_picks') && !isLock) ? ' gated-card' : '';
    const gateOverlay = (!canAccess('all_picks') && !isLock) ? `
        <div class="gate-overlay" onclick="openUpgradeModal()">
            <span class="gate-lock-icon">🔒</span>
            <span>Upgrade to see all picks</span>
        </div>` : '';

    return `
        <div class="game-card${gatedClass}" data-league="${game.league}" data-id="${game.id}">
            ${gateOverlay}
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
                        <div class="odds-cell-value">${game.spread.value === 0 ? 'No line' : `${game.spread.team} ${game.spread.value}`}</div>
                    </div>
                    <div class="odds-cell">
                        <div class="odds-cell-label">${ouLabel}</div>
                        <div class="odds-cell-value">${!game.overUnder.total ? 'No line' : game.overUnder.total}</div>
                    </div>
                    <div class="odds-cell">
                        <div class="odds-cell-label">ML Fav</div>
                        <div class="odds-cell-value">${(Math.abs(game.moneyline.away) > 10000 || Math.abs(game.moneyline.home) > 10000) ? 'Off board' : formatOdds(Math.min(game.moneyline.away, game.moneyline.home))}</div>
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
                ${(Math.abs(game.moneyline.away) > 10000 || Math.abs(game.moneyline.home) > 10000) ? `
                <div class="pick-row"><div class="pick-btn" style="flex:1;cursor:default;opacity:0.5;"><div class="pick-btn-team">Off the Board</div></div></div>` : `
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
                </div>`}
                
                <div class="pick-row-label">${spreadLabel}</div>
                ${game.spread.value === 0 ? `
                <div class="pick-row"><div class="pick-btn" style="flex:1;cursor:default;opacity:0.5;"><div class="pick-btn-team">No Line Posted</div></div></div>` : `
                <div class="pick-row">
                    <button class="pick-btn ${spreadFavSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'spreadFav', '${favTeam} ${game.spread.value}', ${game.spread.odds}, ${favSpreadConf})">
                        <div class="pick-btn-team">${favTeam} ${game.spread.value}</div>
                        <div class="pick-btn-odds">${formatOdds(game.spread.odds)}</div>
                        <div class="pick-conf ${getConfidenceClass(favSpreadConf)}">${getConfidenceLabel(favSpreadConf)} ${favSpreadConf}%</div>
                    </button>
                    <button class="pick-btn ${spreadDogSel ? 'selected' : ''}" 
                            onclick="togglePick('${game.id}', 'spreadDog', '${dogTeam} +${dogValue}', -110, ${dogSpreadConf})">
                        <div class="pick-btn-team">${dogTeam} +${dogValue}</div>
                        <div class="pick-btn-odds">-110</div>
                        <div class="pick-conf ${getConfidenceClass(dogSpreadConf)}">${getConfidenceLabel(dogSpreadConf)} ${dogSpreadConf}%</div>
                    </button>
                </div>`}
                
                <div class="pick-row-label">Total ${isNHL || isSoccer ? 'Goals' : 'Points'}</div>
                ${!game.overUnder.total ? `
                <div class="pick-row"><div class="pick-btn" style="flex:1;cursor:default;opacity:0.5;"><div class="pick-btn-team">No Line Posted</div></div></div>` : `
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
                </div>`}
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

        // Content gating: free users only see 'safe' tier parlay
        const isSafe = parlay.tier === 'safe';
        const isGated = !canAccess('all_parlays') && !isSafe;
        const gatedClass = isGated ? ' gated-card' : '';
        const gateOverlay = isGated ? `
            <div class="gate-overlay" onclick="openUpgradeModal()">
                <span class="gate-lock-icon">🔒</span>
                <span>Upgrade to unlock all parlays</span>
            </div>` : '';
        return `
            <div class="rec-card tier-${parlay.tier}${gatedClass}">
                ${gateOverlay}
                <div class="rec-header">
                    <div class="rec-title">${parlay.name}</div>
                    <span class="rec-badge ${parlay.tier}">${parlay.badge}</span>
                </div>
                <div class="rec-legs">
                    ${parlay.legs.map(leg => {
            let betLabel = 'ML';
            let badgeClass = 'badge-ml';
            if (leg.pick_type === 'spread') {
                const lineText = leg.picked_line > 0 ? `+${leg.picked_line}` : leg.picked_line;
                betLabel = lineText;
                badgeClass = 'badge-pts';
            } else if (leg.pick_type === 'over' || leg.pick_type === 'under') {
                const prefix = leg.pick_type === 'over' ? 'O' : 'U';
                betLabel = `${prefix}${leg.picked_line}`;
                badgeClass = 'badge-ou';
            }

            return `
                        <div class="rec-leg">
                            <span class="rec-leg-team">${leg.team} <span class="bet-type-badge ${badgeClass}">${betLabel}</span></span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="pick-conf-inline ${getConfidenceClass(leg.conf)}">${leg.conf}%</span>
                                <span class="rec-leg-odds">${formatOdds(leg.odds)} · ${leg.game}</span>
                            </div>
                        </div>
                        `;
        }).join('')}
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
    // Apply to pick cards
    document.querySelectorAll('.game-card').forEach(card => {
        if (league === 'all' || card.dataset.league === league) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
    // Apply to slate rows
    document.querySelectorAll('.slate-row').forEach(row => {
        if (league === 'all' || row.dataset.league === league) {
            row.classList.remove('hidden');
        } else {
            row.classList.add('hidden');
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
            .select('*, daily_picks!inner(tier, pick_date, picked_odds, pick_type, picked_team, confidence, game_id)')
            .gte('daily_picks.pick_date', startDate)
            .lte('daily_picks.pick_date', endDate);

        if (error) {
            console.warn('⚠️ Supabase join query failed, using fallback:', error.message);
            return await loadPerformanceFallback(startDate, endDate);
        }

        // Validate that the join actually returned daily_picks data
        if (results && results.length > 0) {
            const hasJoinData = results[0].daily_picks && results[0].daily_picks.tier;
            if (!hasJoinData) {
                console.warn('⚠️ Join returned rows but daily_picks fields are empty, using fallback');
                return await loadPerformanceFallback(startDate, endDate);
            }
            console.log(`📈 Performance: loaded ${results.length} results via join (tiers: ${[...new Set(results.map(r => r.daily_picks?.tier))].join(', ')})`);
        }

        return results || [];
    } catch (e) {
        console.error('Performance data error, using fallback:', e);
        return await loadPerformanceFallback(startDate, endDate);
    }
}

async function loadPerformanceFallback(startDate, endDate) {
    // Fallback: query both tables and join client-side
    const { data: picks } = await sb
        .from('daily_picks')
        .select('id, tier, pick_date, picked_odds, pick_type, picked_team, confidence, game_id')
        .gte('pick_date', startDate)
        .lte('pick_date', endDate);

    if (!picks || picks.length === 0) {
        console.log('📈 Fallback: no daily_picks found in date range');
        return [];
    }

    // Query pick_results in batches to avoid URL length limits
    let allResults = [];
    const pickIds = picks.map(p => p.id);
    for (let i = 0; i < pickIds.length; i += 100) {
        const batch = pickIds.slice(i, i + 100);
        const { data: results } = await sb
            .from('pick_results')
            .select('*')
            .in('pick_id', batch);
        if (results) allResults = allResults.concat(results);
    }

    if (allResults.length === 0) {
        console.log('📈 Fallback: no pick_results found for the picks');
        return [];
    }

    // Join them client-side
    const pickMap = {};
    picks.forEach(p => { pickMap[p.id] = p; });

    const joined = allResults.map(r => ({
        ...r,
        daily_picks: pickMap[r.pick_id] || {}
    }));

    console.log(`📈 Fallback: joined ${joined.length} results (tiers: ${[...new Set(joined.map(r => r.daily_picks?.tier))].join(', ')}, types: ${[...new Set(joined.map(r => r.daily_picks?.pick_type))].join(', ')})`);
    return joined;
}

function calculateTierStats(results, tier) {
    const tierResults = results.filter(r => {
        const pickTier = (r.daily_picks?.tier || '').toLowerCase().trim();
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

        // Calculate and render bet type & sport breakdowns
        const { betTypeStats, sportStats } = await calculateBreakdownStats(results);
        renderBreakdownTables(betTypeStats, sportStats);

        console.log(`📈 Individual performance loaded: ${results.length} settled picks in range`);
    }
}

// ===== BET TYPE & SPORT BREAKDOWN =====
const SPORT_LABELS = {
    basketball_nba: 'NBA',
    basketball_ncaab: 'NCAAB',
    icehockey_nhl: 'NHL',
    baseball_mlb: 'MLB',
    americanfootball_nfl: 'NFL',
    soccer_usa_mls: 'MLS',
    soccer_epl: 'EPL',
    soccer_spain_la_liga: 'La Liga',
    soccer_germany_bundesliga: 'Bundesliga',
    soccer_france_ligue_one: 'Ligue 1',
    soccer_italy_serie_a: 'Serie A',
};

const BET_TYPE_LABELS = {
    moneyline: '💰 Moneyline',
    spread: '📏 Spread',
    over: '⬆️ Over',
    under: '⬇️ Under',
};

async function calculateBreakdownStats(results) {
    const betTypeStats = {};
    const sportStats = {};

    // Collect game_ids to look up sport_key
    const gameIds = [...new Set(
        results.map(r => r.daily_picks?.game_id || r.game_id).filter(Boolean)
    )];

    // Look up sport keys from games table
    let gameMap = {};
    if (gameIds.length > 0) {
        // Query in batches
        for (let i = 0; i < gameIds.length; i += 100) {
            const batch = gameIds.slice(i, i + 100);
            const { data: games } = await sb
                .from('games')
                .select('game_id, sport_key')
                .in('game_id', batch);
            (games || []).forEach(g => { gameMap[g.game_id] = g.sport_key; });
        }
    }

    for (const r of results) {
        const pickType = (r.daily_picks?.pick_type || 'unknown').toLowerCase().trim();
        const gameId = r.daily_picks?.game_id || r.game_id;
        const sportKey = gameMap[gameId] || 'unknown';
        const result = (r.result || '').toLowerCase().trim();
        const payout = parseFloat(r.payout_on_100) || 0;

        // Bet type aggregation
        if (!betTypeStats[pickType]) {
            betTypeStats[pickType] = { wins: 0, losses: 0, pushes: 0, pnl: 0 };
        }
        if (result === 'win') { betTypeStats[pickType].wins++; betTypeStats[pickType].pnl += (payout - 100); }
        else if (result === 'loss') { betTypeStats[pickType].losses++; betTypeStats[pickType].pnl -= 100; }
        else if (result === 'push') { betTypeStats[pickType].pushes++; }

        // Sport aggregation
        if (!sportStats[sportKey]) {
            sportStats[sportKey] = { wins: 0, losses: 0, pushes: 0, pnl: 0 };
        }
        if (result === 'win') { sportStats[sportKey].wins++; sportStats[sportKey].pnl += (payout - 100); }
        else if (result === 'loss') { sportStats[sportKey].losses++; sportStats[sportKey].pnl -= 100; }
        else if (result === 'push') { sportStats[sportKey].pushes++; }
    }

    return { betTypeStats, sportStats };
}

function breakdownWinRate(stats) {
    const decided = stats.wins + stats.losses;
    if (decided === 0) return null;
    return Math.round((stats.wins / decided) * 100);
}

function renderBreakdownTables(betTypeStats, sportStats) {
    const betTypeBody = document.getElementById('perf-bettype-body');
    const sportBody = document.getElementById('perf-sport-body');
    if (!betTypeBody || !sportBody) return;

    // Render bet type rows
    const btOrder = ['moneyline', 'spread', 'over', 'under'];
    const btRows = btOrder
        .filter(bt => betTypeStats[bt] && (betTypeStats[bt].wins + betTypeStats[bt].losses + betTypeStats[bt].pushes) > 0)
        .map(bt => {
            const s = betTypeStats[bt];
            const wr = breakdownWinRate(s);
            const wrClass = wr === null ? '' : wr >= 55 ? 'positive' : wr < 45 ? 'negative' : 'neutral';
            const pnlClass = s.pnl >= 0 ? 'positive' : 'negative';
            const pnlStr = s.pnl >= 0 ? `+$${s.pnl.toFixed(0)}` : `-$${Math.abs(s.pnl).toFixed(0)}`;
            return `<tr>
                <td>${BET_TYPE_LABELS[bt] || bt}</td>
                <td>${s.wins}-${s.losses}${s.pushes > 0 ? `-${s.pushes}` : ''}</td>
                <td class="perf-profit ${wrClass}">${wr !== null ? wr + '%' : '—'}</td>
                <td class="perf-profit ${pnlClass}">${pnlStr}</td>
            </tr>`;
        });
    betTypeBody.innerHTML = btRows.length > 0
        ? btRows.join('')
        : '<tr><td colspan="4" style="text-align:center;opacity:0.5;">No data yet</td></tr>';

    // Render sport rows (sorted by total picks descending)
    const sportEntries = Object.entries(sportStats)
        .filter(([, s]) => (s.wins + s.losses + s.pushes) > 0)
        .sort((a, b) => (b[1].wins + b[1].losses + b[1].pushes) - (a[1].wins + a[1].losses + a[1].pushes));

    const spRows = sportEntries.map(([key, s]) => {
        const label = SPORT_LABELS[key] || key;
        const wr = breakdownWinRate(s);
        const wrClass = wr === null ? '' : wr >= 55 ? 'positive' : wr < 45 ? 'negative' : 'neutral';
        const pnlClass = s.pnl >= 0 ? 'positive' : 'negative';
        const pnlStr = s.pnl >= 0 ? `+$${s.pnl.toFixed(0)}` : `-$${Math.abs(s.pnl).toFixed(0)}`;
        return `<tr>
            <td>${label}</td>
            <td>${s.wins}-${s.losses}${s.pushes > 0 ? `-${s.pushes}` : ''}</td>
            <td class="perf-profit ${wrClass}">${wr !== null ? wr + '%' : '—'}</td>
            <td class="perf-profit ${pnlClass}">${pnlStr}</td>
        </tr>`;
    });
    sportBody.innerHTML = spRows.length > 0
        ? spRows.join('')
        : '<tr><td colspan="4" style="text-align:center;opacity:0.5;">No data yet</td></tr>';
}

function toggleBreakdownSection() {
    const content = document.getElementById('perf-breakdown-content');
    const icon = document.getElementById('breakdown-toggle-icon');
    if (!content) return;
    const isCollapsed = content.classList.contains('collapsed');
    content.classList.toggle('collapsed');
    if (icon) icon.textContent = isCollapsed ? '− Collapse' : '+ Expand';
}

function getDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const fmt = d => d.toISOString().split('T')[0];
    // Clamp to model epoch — never look back before the current model version
    const startDate = fmt(start) < MODEL_EPOCH ? MODEL_EPOCH : fmt(start);
    return { startDate, endDate: fmt(end) };
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
        const defaultStart = d.toISOString().split('T')[0];
        startInput.value = defaultStart < MODEL_EPOCH ? MODEL_EPOCH : defaultStart;
        startInput.min = MODEL_EPOCH;
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
        ['performance-section', 'recommended-section', 'picks-section', 'slate-section'].forEach(id => {
            const el = document.getElementById(id);
            if (el) navObserver.observe(el);
        });
    });
}
