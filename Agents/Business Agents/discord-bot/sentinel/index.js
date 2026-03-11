/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║          SENTINEL — Security Officer Module               ║
 * ║      Read-Only • Defensive-Only • No Destructive Actions ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 * Sentinel protects the Day4AI system by:
 *  1. Scanning all messages for prompt injection & secret exposure
 *  2. Running periodic security audits (integrity, deps, firewall)
 *  3. Maintaining a lockdown system to block agents if threats detected
 *  4. Generating 72-hour security briefings
 *  5. Sending real-time DM alerts for critical threats
 *
 * CAPABILITIES:
 *  ✅ Read & scan messages, files, configs
 *  ✅ Block agents via lockdown flag
 *  ✅ Alert owner via DM and channel
 *  ❌ Cannot delete files, make purchases, modify configs, or take destructive actions
 */

const cron = require('node-cron');
const promptInjection = require('./scanners/prompt-injection');
const secretExposure = require('./scanners/secret-exposure');
const integrity = require('./scanners/integrity');
const dependency = require('./scanners/dependency');
const firewall = require('./scanners/firewall');

const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || '1477419253257732159';
const SECURITY_CHANNEL_NAME = 'security-officer';

class Sentinel {
    constructor(client, pool) {
        this.client = client;
        this.pool = pool;
        this.initialized = false;
        this.securityChannel = null;
        this.startTime = new Date();
        this.stats = {
            messagesScanned: 0,
            threatsBlocked: 0,
            alertsSent: 0,
            scansConducted: 0,
        };
    }

    // ── Initialize ──────────────────────────────────────────
    async init() {
        console.log('[Sentinel] Initializing security module...');

        // Create database tables
        await this.createTables();

        // Find or create security channel
        await this.setupSecurityChannel();

        // Schedule 72-hour briefings
        this.scheduleBriefings();

        // Schedule periodic full scans (every 6 hours)
        this.scheduleScans();

        // Schedule key rotation checks (Sundays at 9 AM PST)
        this.scheduleKeyRotationChecks();

        // Run initial scan
        setTimeout(() => this.runFullScan('startup'), 10000);

        this.initialized = true;
        console.log('[Sentinel] ✅ Security module active');

        // Post startup message
        if (this.securityChannel) {
            await this.securityChannel.send(
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '🛡️ **SENTINEL ONLINE**\n' +
                `📅 ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}\n` +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                '✅ Prompt injection scanner: **ACTIVE**\n' +
                '✅ Secret exposure scanner: **ACTIVE**\n' +
                '✅ File integrity monitor: **ACTIVE**\n' +
                '✅ Dependency auditor: **ACTIVE**\n' +
                '✅ Infrastructure scanner: **ACTIVE**\n' +
                '✅ Lockdown system: **ARMED**\n' +
                '✅ 72-hour briefings: **SCHEDULED**\n\n' +
                '🔒 I will protect this system. Type `!sentinel help` for commands.'
            );
        }
    }

    // ── Database Setup ──────────────────────────────────────
    async createTables() {
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS sentinel_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS sentinel_audit_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ DEFAULT NOW(),
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    description TEXT NOT NULL,
                    source TEXT,
                    details JSONB
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS sentinel_alerts (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ DEFAULT NOW(),
                    severity TEXT NOT NULL,
                    scanner TEXT NOT NULL,
                    label TEXT NOT NULL,
                    matched TEXT,
                    source TEXT,
                    resolved BOOLEAN DEFAULT FALSE,
                    resolved_at TIMESTAMPTZ,
                    resolved_by TEXT
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS sentinel_key_registry (
                    key_name TEXT PRIMARY KEY,
                    last_rotated TIMESTAMPTZ DEFAULT NOW(),
                    rotation_interval_days INTEGER DEFAULT 90,
                    description TEXT
                )
            `);

            // Initialize lockdown state if not exists
            await this.pool.query(`
                INSERT INTO sentinel_state (key, value)
                VALUES ('lockdown', 'false')
                ON CONFLICT (key) DO NOTHING
            `);

            await this.pool.query(`
                INSERT INTO sentinel_state (key, value)
                VALUES ('last_briefing', $1)
                ON CONFLICT (key) DO NOTHING
            `, [new Date().toISOString()]);

            // Seed initial keys if registry is empty
            const keysRes = await this.pool.query('SELECT COUNT(*) FROM sentinel_key_registry');
            if (parseInt(keysRes.rows[0].count) === 0) {
                const initialKeys = [
                    { name: 'DISCORD_BOT_TOKEN', desc: 'Main Discord bot authentication token' },
                    { name: 'GEMINI_API_KEY', desc: 'Google Gemini AI API key' },
                    { name: 'POSTGRES_PASSWORD', desc: 'Database root password' },
                    { name: 'PERPLEXITY_API_KEY', desc: 'Perplexity AI search API key' },
                    { name: 'ETSY_API_KEY', desc: 'Etsy shop integration API key' },
                    { name: 'PRINTIFY_API_KEY', desc: 'Printify POD integration API key' },
                    { name: 'GUMROAD_API_KEY', desc: 'Gumroad digital product API key' },
                ];
                for (const k of initialKeys) {
                    await this.pool.query(
                        'INSERT INTO sentinel_key_registry (key_name, description) VALUES ($1, $2)',
                        [k.name, k.desc]
                    );
                }
                console.log('[Sentinel] Key registry seeded with initial keys');
            }

            console.log('[Sentinel] Database tables ready');
        } catch (e) {
            console.error('[Sentinel] DB setup error:', e.message);
        }
    }

    // ── Security Channel Setup ──────────────────────────────
    async setupSecurityChannel() {
        try {
            const guild = this.client.guilds.cache.first();
            if (!guild) {
                console.error('[Sentinel] No guild found');
                return;
            }

            // Find existing channel
            this.securityChannel = guild.channels.cache.find(
                c => c.name === SECURITY_CHANNEL_NAME
            );

            if (!this.securityChannel) {
                // Create the security channel
                const category = guild.channels.cache.find(
                    c => c.type === 4 // CategoryChannel
                );

                this.securityChannel = await guild.channels.create({
                    name: SECURITY_CHANNEL_NAME,
                    topic: '🛡️ Sentinel Security Officer — System protection, threat alerts, and security briefings',
                    parent: category?.id,
                    reason: 'Sentinel Security Officer channel setup',
                });
                console.log('[Sentinel] Created #security-officer channel');
            } else {
                console.log('[Sentinel] Found existing #security-officer channel');
            }
        } catch (e) {
            console.error('[Sentinel] Channel setup error:', e.message);
        }
    }

    // ── Lockdown System ─────────────────────────────────────
    async isLocked() {
        try {
            const result = await this.pool.query(
                "SELECT value FROM sentinel_state WHERE key = 'lockdown'"
            );
            return result.rows[0]?.value === 'true';
        } catch {
            return false;
        }
    }

    async engageLockdown(reason, channelName = 'unknown', details = {}) {
        await this.pool.query(
            "UPDATE sentinel_state SET value = 'true', updated_at = NOW() WHERE key = 'lockdown'"
        );

        await this.logAudit('LOCKDOWN_ENGAGED', 'CRITICAL', reason, channelName, details);

        // Alert in security channel
        if (this.securityChannel) {
            await this.securityChannel.send(
                '🚨🚨🚨 **SYSTEM LOCKDOWN ENGAGED** 🚨🚨🚨\n\n' +
                `**Reason:** ${reason}\n` +
                `**Channel:** ${channelName}\n\n` +
                '⛔ All agent operations are **BLOCKED** until manual review.\n' +
                `🔑 <@${OWNER_DISCORD_ID}> — Review this alert and type \`!sentinel unlock\` to resume operations.`
            );
        }

        // DM the owner immediately
        await this.dmOwner(
            '🚨 **CRITICAL: SYSTEM LOCKDOWN**\n\n' +
            `**Reason:** ${reason}\n\n` +
            'All agent operations have been halted. Go to #security-officer and type `!sentinel unlock` after reviewing.'
        );

        this.stats.threatsBlocked++;
    }

    async disengageLockdown(userId) {
        await this.pool.query(
            "UPDATE sentinel_state SET value = 'false', updated_at = NOW() WHERE key = 'lockdown'"
        );
        await this.logAudit('LOCKDOWN_DISENGAGED', 'INFO', `Unlocked by user ${userId}`);

        if (this.securityChannel) {
            await this.securityChannel.send(
                '✅ **LOCKDOWN DISENGAGED**\n\n' +
                'Agent operations have been **resumed**. Sentinel continues monitoring.'
            );
        }
    }

    // ── Message Scanning ────────────────────────────────────
    async scanMessage(message) {
        this.stats.messagesScanned++;
        const text = message.content;
        const userId = message.author.id;
        const channelName = message.channel.name;

        // Don't scan owner's commands to sentinel
        if (channelName === SECURITY_CHANNEL_NAME && text.startsWith('!sentinel')) {
            return { blocked: false };
        }

        const results = {
            injection: promptInjection.scan(text, `discord:${channelName}`),
            secrets: secretExposure.scan(text, `discord:${channelName}`),
        };

        const allFindings = [
            ...results.injection.findings,
            ...results.secrets.findings,
        ];

        if (allFindings.length === 0) return { blocked: false };

        // Log all findings
        for (const finding of allFindings) {
            await this.logAlert(finding);
        }

        const criticals = allFindings.filter(f => f.severity === 'CRITICAL');
        const highs = allFindings.filter(f => f.severity === 'HIGH');

        // CRITICAL findings → lockdown + block
        if (criticals.length > 0) {
            const labels = criticals.map(f => f.label).join(', ');
            await this.engageLockdown(`Critical threat detected from user ${message.author.username}: ${labels}`, channelName, {
                userId: userId,
                messageId: message.id,
                findings: criticals
            });

            await message.reply(
                '🛡️ **Message blocked by Sentinel.**\n' +
                'A security concern was detected. The system is now in lockdown pending review.\n' +
                `Check <#${this.securityChannel?.id || 'security-officer'}> for details.`
            );
            return { blocked: true };
        }

        // HIGH findings → alert but don't block
        if (highs.length > 0) {
            const labels = highs.map(f => f.label).join(', ');
            await this.alertSecurityChannel(
                'HIGH',
                `Suspicious activity in #${channelName}`,
                `**User:** ${message.author.username}\n**Findings:** ${labels}\n**Message excerpt:** ${text.substring(0, 200)}...`,
            );

            // DM owner for HIGH severity
            await this.dmOwner(
                `⚠️ **Security Alert (HIGH)**\n\n` +
                `**Channel:** #${channelName}\n` +
                `**User:** ${message.author.username}\n` +
                `**Finding:** ${labels}\n\n` +
                `Message is being allowed, but flagged for your awareness.`
            );
        }

        // MEDIUM findings → log only, no notification
        return { blocked: false };
    }

    // ── Sentinel Commands ───────────────────────────────────
    async handleCommand(message) {
        const args = message.content.replace('!sentinel', '').trim().split(/\s+/);
        const command = args[0]?.toLowerCase();

        // Only the owner can issue commands
        if (message.author.id !== OWNER_DISCORD_ID) {
            await message.reply('🛡️ Only the system owner can issue Sentinel commands.');
            return;
        }

        switch (command) {
            case 'help':
                await message.reply(
                    '🛡️ **Sentinel Commands**\n\n' +
                    '`!sentinel status` — Current security status\n' +
                    '`!sentinel briefing` — Generate security briefing now\n' +
                    '`!sentinel scan` — Run full security scan now\n' +
                    '`!sentinel lockdown` — Manually lock down the system\n' +
                    '`!sentinel unlock` — Disengage lockdown\n' +
                    '`!sentinel alerts` — Show recent alerts\n' +
                    '`!sentinel health` — System health score\n' +
                    '`!sentinel keys` — Manage API key registry\n' +
                    '`!sentinel ratelimit` — Show recent rate limit events'
                );
                break;

            case 'status':
                await this.sendStatus(message.channel);
                break;

            case 'briefing':
                await message.channel.send('📊 Generating security briefing...');
                await this.generateBriefing();
                break;

            case 'scan':
                await message.channel.send('🔍 Running full security scan...');
                await this.runFullScan('manual');
                break;

            case 'lockdown':
                await this.engageLockdown('Manual lockdown by owner');
                break;

            case 'unlock':
                await this.disengageLockdown(message.author.id);
                break;

            case 'alerts':
                await this.showRecentAlerts(message.channel);
                break;

            case 'health':
                const score = await this.calculateHealthScore();
                await message.reply(
                    `🏥 **System Health Score: ${score.score}/100 (${score.grade})**\n\n` +
                    score.breakdown.map(b => `${b.icon} ${b.category}: ${b.points}/${b.max}`).join('\n')
                );
                break;

            default:
                await message.reply('Unknown command. Type `!sentinel help` for available commands.');
        }
    }

    // ── Conversational Handler ──────────────────────────────
    async handleConversation(message) {
        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_KEY) {
            await message.reply('🛡️ Sentinel is online but Gemini API key is not configured for conversational mode. Use `!sentinel help` for available commands.');
            return;
        }

        try {
            await message.channel.sendTyping();

            // Get current security context
            const health = await this.calculateHealthScore();
            const locked = await this.isLocked();

            let recentAlertsSummary = 'No recent alerts.';
            try {
                const alertsResult = await this.pool.query(
                    'SELECT severity, label, matched FROM sentinel_alerts ORDER BY timestamp DESC LIMIT 5'
                );
                if (alertsResult.rows.length > 0) {
                    recentAlertsSummary = alertsResult.rows.map(a => `[${a.severity}] ${a.label}: ${a.matched || 'N/A'}`).join('\n');
                }
            } catch { }

            const systemPrompt = `You are Sentinel, the Security Officer for the Day4AI digital empire. You are a member of the executive team alongside the Chief of Staff, Chief Automation Officer, and Chief Strategy Officer.

Your personality: Professional, vigilant, direct, and protective. You speak with authority on security matters. You use military/security terminology naturally. You are loyal to Travis (the owner) and your #1 priority is protecting his information, business, and infrastructure.

Your capabilities (READ-ONLY / DEFENSIVE ONLY):
- You scan all messages for prompt injection and secret exposure
- You monitor file integrity via SHA-256 hashing
- You audit dependencies for known vulnerabilities
- You check infrastructure security (Firestore rules, Docker configs, .env files)
- You can engage system lockdown to block all agents if a critical threat is detected
- You generate security briefings every 72 hours
- You send real-time DM alerts for critical threats
- You CANNOT delete files, make purchases, modify configs, or take any destructive action

Current system status:
- Health Score: ${health.score}/100 (${health.grade})
- Lockdown: ${locked ? 'ACTIVE - all agents blocked' : 'Disengaged - normal operations'}
- Messages scanned: ${this.stats.messagesScanned}
- Threats blocked: ${this.stats.threatsBlocked}
- Full scans conducted: ${this.stats.scansConducted}
- Recent alerts: ${recentAlertsSummary}

Available commands you can mention: !sentinel status, !sentinel briefing, !sentinel scan, !sentinel lockdown, !sentinel unlock, !sentinel alerts, !sentinel health

Keep responses concise and security-focused. If asked about non-security topics, redirect to security matters or suggest consulting the other C-Suite agents.`;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { role: 'user', parts: [{ text: message.content }] }
                        ],
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        generationConfig: {
                            maxOutputTokens: 800,
                            temperature: 0.7,
                        }
                    }),
                }
            );

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Sentinel] Gemini error:', response.status, errText.substring(0, 200));
                await message.reply('🛡️ Sentinel is having trouble processing that. Try using `!sentinel help` for direct commands.');
                return;
            }

            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate response.';

            // Send reply, splitting if needed
            if (reply.length <= 2000) {
                await message.reply(reply);
            } else {
                const parts = reply.match(/[\s\S]{1,1990}/g);
                for (const part of parts) {
                    await message.channel.send(part);
                }
            }
        } catch (e) {
            console.error('[Sentinel] Conversation error:', e.message);
            await message.reply('🛡️ Sentinel encountered an error. Try `!sentinel help` for available commands.');
        }
    }
    // ── Full Security Scan ──────────────────────────────────
    async runFullScan(trigger = 'scheduled') {
        console.log(`[Sentinel] Running full scan (trigger: ${trigger})`);
        this.stats.scansConducted++;
        const allFindings = [];

        try {
            // 1. File integrity
            const integrityResult = await integrity.scan(this.pool);
            allFindings.push(...integrityResult.findings);

            // 2. Dependency audit
            const depResult = await dependency.scan();
            allFindings.push(...depResult.findings);

            // 3. Infrastructure / firewall
            const fwResult = await firewall.scan();
            allFindings.push(...fwResult.findings);

            // Log all findings
            for (const finding of allFindings) {
                await this.logAlert(finding);
            }

            const criticals = allFindings.filter(f => f.severity === 'CRITICAL');

            if (criticals.length > 0 && trigger !== 'startup') {
                await this.engageLockdown(
                    `Full scan found ${criticals.length} CRITICAL issue(s): ${criticals.map(f => f.label).join(', ')}`
                );
            }

            // Report results
            if (this.securityChannel && allFindings.length > 0) {
                const summary = allFindings.reduce((acc, f) => {
                    acc[f.severity] = (acc[f.severity] || 0) + 1;
                    return acc;
                }, {});

                await this.securityChannel.send(
                    `🔍 **Scan Complete** (${trigger})\n` +
                    `📊 Findings: ${Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n` +
                    (criticals.length > 0 ? '🚨 **CRITICAL issues found — review required!**' : '✅ No critical issues.')
                );
            }

            console.log(`[Sentinel] Scan complete: ${allFindings.length} findings`);
        } catch (e) {
            console.error('[Sentinel] Scan error:', e.message);
        }

        return allFindings;
    }

    // ── 72-Hour Briefing ────────────────────────────────────
    scheduleBriefings() {
        // Run every 72 hours (at 06:00 PST on Mon, Thu)
        cron.schedule('0 6 * * 1,4', async () => {
            console.log('[Sentinel] Generating scheduled briefing...');
            await this.generateBriefing();
        }, { timezone: 'America/Los_Angeles' });

        console.log('[Sentinel] Briefings scheduled: Mon + Thu at 06:00 PST (~72hr interval)');
    }

    scheduleScans() {
        // Run full scan once every 24 hours (midnight PST)
        cron.schedule('0 0 * * *', async () => {
            await this.runFullScan('scheduled');
        }, { timezone: 'America/Los_Angeles' });

        console.log('[Sentinel] Periodic scans scheduled: every 24 hours (midnight PST)');
    }

    async generateBriefing() {
        const now = new Date();
        const pstTime = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });

        // Get stats from last 72 hours
        const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000).toISOString();

        let recentAlerts = [];
        let auditEvents = [];
        try {
            const alertsResult = await this.pool.query(
                'SELECT severity, scanner, label, matched, timestamp FROM sentinel_alerts WHERE timestamp > $1 ORDER BY timestamp DESC LIMIT 50',
                [threeDaysAgo]
            );
            recentAlerts = alertsResult.rows;

            const auditResult = await this.pool.query(
                'SELECT severity, event_type, description, timestamp FROM sentinel_audit_log WHERE timestamp > $1 ORDER BY timestamp DESC LIMIT 20',
                [threeDaysAgo]
            );
            auditEvents = auditResult.rows;
        } catch (e) {
            console.error('[Sentinel] Briefing query error:', e.message);
        }

        // Calculate health score
        const health = await this.calculateHealthScore();

        // Count by severity
        const alertCounts = recentAlerts.reduce((acc, a) => {
            acc[a.severity] = (acc[a.severity] || 0) + 1;
            return acc;
        }, {});

        // Build briefing
        const briefing =
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '🛡️ **SENTINEL SECURITY BRIEFING**\n' +
            `📅 ${pstTime}\n` +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +

            `🏥 **OVERALL HEALTH SCORE: ${health.score}/100 (${health.grade})**\n` +
            health.breakdown.map(b => `  ${b.icon} ${b.category}: ${b.points}/${b.max}`).join('\n') + '\n\n' +

            '📊 **THREAT SUMMARY (last 72 hours)**\n' +
            `  🔴 Critical: ${alertCounts.CRITICAL || 0}\n` +
            `  🟠 High: ${alertCounts.HIGH || 0}\n` +
            `  🟡 Medium: ${alertCounts.MEDIUM || 0}\n` +
            `  🟢 Low: ${alertCounts.LOW || 0}\n\n` +

            '📈 **LIFETIME STATS**\n' +
            `  Messages scanned: ${this.stats.messagesScanned}\n` +
            `  Threats blocked: ${this.stats.threatsBlocked}\n` +
            `  Alerts sent: ${this.stats.alertsSent}\n` +
            `  Full scans: ${this.stats.scansConducted}\n\n` +

            (auditEvents.length > 0
                ? '🚨 **ACTIONS TAKEN**\n' +
                auditEvents.slice(0, 10).map(e =>
                    `  • [${e.severity}] ${e.description} (${new Date(e.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`
                ).join('\n') + '\n\n'
                : '') +

            (recentAlerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length > 0
                ? '⚠️ **NOTABLE ALERTS**\n' +
                recentAlerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').slice(0, 10).map(a =>
                    `  • [${a.severity}] ${a.label}: ${a.matched?.substring(0, 80) || 'N/A'}`
                ).join('\n') + '\n\n'
                : '') +

            `🔒 **LOCKDOWN STATUS:** ${await this.isLocked() ? '⛔ ACTIVE' : '✅ Disengaged'}\n\n` +

            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

        if (this.securityChannel) {
            // Split if needed (Discord 2000 char limit)
            if (briefing.length <= 2000) {
                await this.securityChannel.send(briefing);
            } else {
                const parts = briefing.match(/[\s\S]{1,1990}/g);
                for (const part of parts) {
                    await this.securityChannel.send(part);
                }
            }
        }

        // Also DM the owner
        await this.dmOwner(`📋 **Security briefing posted to #security-officer.**\nHealth Score: ${health.score}/100 (${health.grade})`);

        // Update last briefing time
        await this.pool.query(
            "UPDATE sentinel_state SET value = $1, updated_at = NOW() WHERE key = 'last_briefing'",
            [now.toISOString()]
        );
    }

    // ── Health Score Calculator ──────────────────────────────
    async calculateHealthScore() {
        const breakdown = [];
        let totalScore = 0;
        let totalMax = 0;

        // 1. Lockdown status (20 points)
        const locked = await this.isLocked();
        const lockdownPoints = locked ? 0 : 20;
        breakdown.push({ icon: locked ? '🔴' : '🟢', category: 'System Status', points: lockdownPoints, max: 20 });
        totalScore += lockdownPoints;
        totalMax += 20;

        // 2. Recent critical alerts (25 points)
        let critCount = 0;
        try {
            const recent = await this.pool.query(
                "SELECT COUNT(*) as cnt FROM sentinel_alerts WHERE severity = 'CRITICAL' AND timestamp > NOW() - INTERVAL '72 hours' AND resolved = false"
            );
            critCount = parseInt(recent.rows[0]?.cnt || '0');
        } catch { }
        const critPoints = Math.max(0, 25 - (critCount * 10));
        breakdown.push({ icon: critCount === 0 ? '🟢' : '🔴', category: 'Critical Threats', points: critPoints, max: 25 });
        totalScore += critPoints;
        totalMax += 25;

        // 3. File integrity (20 points)
        let integrityChanges = 0;
        try {
            const changes = await this.pool.query(
                "SELECT COUNT(*) as cnt FROM sentinel_alerts WHERE scanner = 'integrity_scan' AND severity = 'HIGH' AND timestamp > NOW() - INTERVAL '72 hours'"
            );
            integrityChanges = parseInt(changes.rows[0]?.cnt || '0');
        } catch { }
        const intPoints = Math.max(0, 20 - (integrityChanges * 5));
        breakdown.push({ icon: integrityChanges === 0 ? '🟢' : '🟡', category: 'File Integrity', points: intPoints, max: 20 });
        totalScore += intPoints;
        totalMax += 20;

        // 4. Dependency health (15 points)
        let depVulns = 0;
        try {
            const deps = await this.pool.query(
                "SELECT COUNT(*) as cnt FROM sentinel_alerts WHERE scanner = 'dependency' AND severity IN ('CRITICAL', 'HIGH') AND resolved = false"
            );
            depVulns = parseInt(deps.rows[0]?.cnt || '0');
        } catch { }
        const depPoints = Math.max(0, 15 - (depVulns * 5));
        breakdown.push({ icon: depVulns === 0 ? '🟢' : '🟡', category: 'Dependencies', points: depPoints, max: 15 });
        totalScore += depPoints;
        totalMax += 15;

        // 5. Infrastructure (20 points)
        let infraIssues = 0;
        try {
            const infra = await this.pool.query(
                "SELECT COUNT(*) as cnt FROM sentinel_alerts WHERE scanner = 'firewall_scan' AND severity IN ('CRITICAL', 'HIGH') AND resolved = false"
            );
            infraIssues = parseInt(infra.rows[0]?.cnt || '0');
        } catch { }
        const infraPoints = Math.max(0, 20 - (infraIssues * 5));
        breakdown.push({ icon: infraIssues === 0 ? '🟢' : '🟡', category: 'Infrastructure', points: infraPoints, max: 20 });
        totalScore += infraPoints;
        totalMax += 20;

        const score = Math.round((totalScore / totalMax) * 100);
        const grade = score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : score >= 50 ? 'FAIR' : 'POOR';

        return { score, grade, breakdown };
    }

    // ── Status Command ──────────────────────────────────────
    async sendStatus(channel) {
        const locked = await this.isLocked();
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);

        await channel.send(
            '🛡️ **Sentinel Status**\n\n' +
            `🔒 Lockdown: ${locked ? '⛔ **ACTIVE**' : '✅ Disengaged'}\n` +
            `⏱️ Uptime: ${hours}h ${mins}m\n` +
            `📊 Messages scanned: ${this.stats.messagesScanned}\n` +
            `🚫 Threats blocked: ${this.stats.threatsBlocked}\n` +
            `🔔 Alerts sent: ${this.stats.alertsSent}\n` +
            `🔍 Full scans: ${this.stats.scansConducted}`
        );
    }

    // ── Show Recent Alerts ──────────────────────────────────
    async showRecentAlerts(channel) {
        try {
            const result = await this.pool.query(
                'SELECT severity, label, matched, timestamp, resolved FROM sentinel_alerts ORDER BY timestamp DESC LIMIT 10'
            );

            if (result.rows.length === 0) {
                await channel.send('✅ No recent alerts.');
                return;
            }

            const lines = result.rows.map(a => {
                const icon = a.severity === 'CRITICAL' ? '🔴' : a.severity === 'HIGH' ? '🟠' : a.severity === 'MEDIUM' ? '🟡' : '🟢';
                const resolved = a.resolved ? ' ✅' : '';
                const time = new Date(a.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
                return `${icon} [${a.severity}] ${a.label}${resolved}\n   ${time}`;
            });

            await channel.send('📋 **Recent Alerts (last 10)**\n\n' + lines.join('\n\n'));
        } catch (e) {
            await channel.send('⚠️ Failed to retrieve alerts: ' + e.message);
        }
    }

    // ── Helpers ─────────────────────────────────────────────
    async logAudit(eventType, severity, description, details = null) {
        try {
            await this.pool.query(
                'INSERT INTO sentinel_audit_log (event_type, severity, description, source, details) VALUES ($1, $2, $3, $4, $5)',
                [eventType, severity, description, 'sentinel', details ? JSON.stringify(details) : null]
            );
        } catch (e) {
            console.error('[Sentinel] Audit log error:', e.message);
        }
    }

    async logAlert(finding) {
        try {
            await this.pool.query(
                'INSERT INTO sentinel_alerts (severity, scanner, label, matched, source) VALUES ($1, $2, $3, $4, $5)',
                [finding.severity, finding.source || 'unknown', finding.label, finding.matched, finding.source]
            );
        } catch (e) {
            console.error('[Sentinel] Alert log error:', e.message);
        }
    }

    async alertSecurityChannel(severity, title, details) {
        this.stats.alertsSent++;
        if (!this.securityChannel) return;

        const icon = severity === 'CRITICAL' ? '🚨' : severity === 'HIGH' ? '⚠️' : 'ℹ️';
        await this.securityChannel.send(
            `${icon} **[${severity}] ${title}**\n\n${details}`
        );
    }

    async dmOwner(message) {
        try {
            const owner = await this.client.users.fetch(OWNER_DISCORD_ID);
            if (owner) {
                await owner.send(message);
            }
        } catch (e) {
            console.error('[Sentinel] DM error:', e.message);
        }
    }
    /**
     * Schedule weekly key rotation checks
     */
    scheduleKeyRotationChecks() {
        // Every Sunday at 09:00 PST
        cron.schedule('0 9 * * 0', () => {
            console.log('[Sentinel] Running weekly key rotation check...');
            this.checkKeyRotation();
        });
    }

    /**
     * Check for overdue key rotations
     */
    async checkKeyRotation() {
        try {
            const query = `
                SELECT key_name, last_rotated, rotation_interval_days 
                FROM sentinel_key_registry 
                WHERE last_rotated + (rotation_interval_days || ' days')::INTERVAL < NOW()
            `;
            const result = await this.pool.query(query);

            if (result.rows.length > 0) {
                const overdueList = result.rows.map(r => `- **${r.key_name}** (last rotated: ${new Date(r.last_rotated).toLocaleDateString()})`).join('\n');
                const message = `⚠️ **Security Alert: Key Rotation Overdue**\n\nThe following API keys are past their rotation interval and should be changed immediately for security:\n\n${overdueList}\n\nUse \`!sentinel keys\` for a full overview.`;

                if (this.securityChannel) {
                    await this.securityChannel.send(message);
                }

                // Also DM owner
                const owner = await this.client.users.fetch(process.env.OWNER_DISCORD_ID);
                if (owner) {
                    await owner.send(message);
                }
            }
        } catch (e) {
            console.error('[Sentinel] Key rotation check error:', e.message);
        }
    }

    /**
     * Handle !sentinel keys command
     */
    async handleKeyRegistry(message) {
        try {
            const res = await this.pool.query('SELECT * FROM sentinel_key_registry ORDER BY key_name');
            if (res.rows.length === 0) {
                return message.reply('No keys registered in the security module.');
            }

            const rows = res.rows.map(r => {
                const lastRotated = new Date(r.last_rotated);
                const nextRotation = new Date(lastRotated.getTime() + (r.rotation_interval_days * 24 * 60 * 60 * 1000));
                const daysRemaining = Math.max(0, Math.ceil((nextRotation - new Date()) / (24 * 60 * 60 * 1000)));
                const status = daysRemaining === 0 ? '🔴 OVERDUE' : (daysRemaining < 7 ? '🟡 ROTATE SOON' : '🟢 OK');

                return `**${r.key_name}**\nStatus: ${status}\nLast: ${lastRotated.toLocaleDateString()}\nNext: ${nextRotation.toLocaleDateString()} (${daysRemaining} days left)`;
            }).join('\n\n');

            const embed = {
                title: '🛡️ Sentinel Key Rotation Registry',
                description: 'Manage and monitor API key lifecycles to minimize exposure risks.\n\n' + rows,
                color: status.includes('🔴') ? 0xff0000 : (status.includes('🟡') ? 0xffff00 : 0x00ff00),
                timestamp: new Date().toISOString(),
                footer: { text: 'Rotate keys periodically to stay secured' }
            };

            await message.reply({ embeds: [embed] });
        } catch (e) {
            await message.reply('Error retrieving key registry: ' + e.message);
        }
    }
    /**
     * Log a rate limit or loop event
     */
    async logRateLimitEvent(channelName, severity, count) {
        await this.logAudit('RATE_LIMIT_HIT', severity, `High activity in #${channelName}`, channelName, { messageCount: count });
        console.warn(`[Sentinel] Rate limit ${severity} hit in #${channelName} (${count} msgs/window)`);
    }

    /**
     * Handle !sentinel ratelimit command
     */
    async handleRateLimitStatus(message) {
        // This is tricky as the state is in bot.js, but we can query the audit log for recent hits
        try {
            const res = await this.pool.query(
                "SELECT * FROM sentinel_audit_log WHERE event_type = 'RATE_LIMIT_HIT' ORDER BY timestamp DESC LIMIT 10"
            );

            if (res.rows.length === 0) {
                return message.reply('No recent rate limit events detected.');
            }

            const events = res.rows.map(r =>
                `[${new Date(r.timestamp).toLocaleTimeString()}] **${r.severity}** in #${r.source}: ${r.description} (${r.details.messageCount} msgs)`
            ).join('\n');

            await message.reply('📊 **Recent Rate Limit Events:**\n\n' + events);
        } catch (e) {
            await message.reply('Error: ' + e.message);
        }
    }
}

module.exports = Sentinel;
