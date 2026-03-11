const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const http = require('http');
const Sentinel = require('./sentinel');

// ── Config ──────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook/agent-chat';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const QDRANT_URL = process.env.QDRANT_URL || 'http://qdrant:6333';

// ── Rate Limiting / Loop Detection ──
const rateLimiter = {
    history: {}, // channelName -> [timestamps]
    throttled: {}, // channelName -> untillTimestamp

    // Thresholds: [messages, windowSeconds, action]
    levels: [
        { count: 15, window: 300, label: 'WARNING' },
        { count: 25, window: 300, label: 'THROTTLE' },
        { count: 40, window: 300, label: 'LOCKDOWN' }
    ]
};

function checkRateLimit(channelName) {
    const now = Date.now();

    // Reset or initialize history
    if (!rateLimiter.history[channelName]) {
        rateLimiter.history[channelName] = [];
    }

    // Check if currently throttled
    if (rateLimiter.throttled[channelName] && now < rateLimiter.throttled[channelName]) {
        return { blocked: true, reason: 'THROTTLE', label: 'Rate limit active. Please wait.' };
    }

    // Clean old timestamps
    const maxWindow = 300 * 1000; // 5 mins
    rateLimiter.history[channelName] = rateLimiter.history[channelName].filter(ts => now - ts < maxWindow);

    // Add current timestamp
    rateLimiter.history[channelName].push(now);
    const count = rateLimiter.history[channelName].length;

    // Check thresholds (highest first)
    if (count >= rateLimiter.levels[2].count) {
        return { blocked: true, reason: 'LOCKDOWN', label: 'CRITICAL: Agent loop detected. Engaging lockdown.' };
    }
    if (count >= rateLimiter.levels[1].count) {
        // Apply 30s throttle
        rateLimiter.throttled[channelName] = now + 30000;
        return { blocked: false, reason: 'THROTTLE', label: '⚠️ High activity detected. Applying temporary throttle.' };
    }
    if (count >= rateLimiter.levels[0].count) {
        return { blocked: false, reason: 'WARNING', label: '⚠️ Moderate activity detected in this channel.' };
    }

    return { blocked: false };
}
const MEMORY_LIMIT = 20;

// ── PostgreSQL connection ───────────────────────────────────
const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'n8n',
    user: process.env.DB_USER || 'n8n',
    password: process.env.POSTGRES_PASSWORD,
});

// ── Channel config ──────────────────────────────────────────
const AGENT_CHANNELS = new Set([
    'chief-of-staff',
    'chief-automation-officer',
    'chief-strategy-officer'
]);
const ROUNDTABLE_CHANNEL = 'c-suite-roundtable';
const SECURITY_CHANNEL = 'security-officer';

const AGENT_NAMES = {
    'chief-of-staff': '👔 Chief of Staff',
    'chief-automation-officer': '⚙️ Chief Automation Officer',
    'chief-strategy-officer': '📊 Chief Strategy Officer',
    'security-officer': '🛡️ Security Officer (Sentinel)'
};

// ── Discord client ──────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// ── Sentinel Security Module ────────────────────────────────
let sentinel;

client.once('ready', async () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    console.log(`[Bot] Channels: ${[...AGENT_CHANNELS].join(', ')}, ${ROUNDTABLE_CHANNEL}, ${SECURITY_CHANNEL}`);
    console.log(`[Bot] Qdrant: ${QDRANT_URL}`);

    // Initialize Sentinel
    sentinel = new Sentinel(client, pool);
    await sentinel.init();
});

// ── Memory functions ────────────────────────────────────────
async function loadMemory(agentName, userId) {
    try {
        const result = await pool.query(
            'SELECT role, content FROM agent_memory WHERE agent_name = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3',
            [agentName, userId, MEMORY_LIMIT]
        );
        return result.rows.reverse();
    } catch (e) {
        console.error('[Memory] Load error:', e.message);
        return [];
    }
}

async function saveMemory(agentName, userId, role, content) {
    try {
        await pool.query(
            'INSERT INTO agent_memory (agent_name, user_id, role, content) VALUES ($1, $2, $3, $4)',
            [agentName, userId, role, content]
        );
    } catch (e) {
        console.error('[Memory] Save error:', e.message);
    }
}

// ── Qdrant knowledge search ────────────────────────────────
async function searchKnowledge(query) {
    try {
        // 1) Embed the query using Gemini
        const embedResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: { parts: [{ text: query }] } }),
            }
        );
        if (!embedResp.ok) {
            console.error('[Qdrant] Embed failed:', embedResp.status);
            return [];
        }
        const embedData = await embedResp.json();
        const vector = embedData.embedding.values;

        // 2) Search Qdrant for top 3 matches
        const searchResp = await fetch(`${QDRANT_URL}/collections/agent_knowledge/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vector, limit: 3, with_payload: true, score_threshold: 0.4 }),
        });
        if (!searchResp.ok) {
            console.error('[Qdrant] Search failed:', searchResp.status);
            return [];
        }
        const searchData = await searchResp.json();
        return (searchData.result || []).map(r => r.payload.text);
    } catch (e) {
        console.error('[Qdrant] Error:', e.message);
        return [];
    }
}

// Also save important conversations back to Qdrant for future knowledge
async function storeKnowledge(text, topic, source) {
    try {
        const embedResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: { parts: [{ text }] } }),
            }
        );
        if (!embedResp.ok) return;
        const embedData = await embedResp.json();

        const point = {
            id: Date.now(),
            vector: embedData.embedding.values,
            payload: { text, topic, source, type: 'conversation', stored_at: new Date().toISOString() },
        };

        await fetch(`${QDRANT_URL}/collections/agent_knowledge/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [point] }),
        });
    } catch (e) {
        console.error('[Qdrant] Store error:', e.message);
    }
}

// ── Call n8n webhook ────────────────────────────────────────
async function callAgent(agentChannel, content, userId, username, history = [], knowledgeContext = []) {
    const payload = JSON.stringify({
        channelName: agentChannel,
        content,
        userId,
        username,
        history,
        knowledgeContext,
        channelId: 'api',
        messageId: Date.now().toString(),
        guildId: 'api',
    });

    const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`n8n ${response.status}: ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.reply || data.output || data.message || 'No response.';
}

// ── Split long messages for Discord ─────────────────────────
async function sendLongMessage(channel, content, prefix = '') {
    const full = prefix ? `${prefix}\n${content}` : content;
    if (full.length <= 2000) return await channel.send(full);

    const lines = full.split('\n');
    let chunk = '';
    for (const line of lines) {
        if ((chunk + '\n' + line).length > 1990) {
            if (chunk) await channel.send(chunk);
            chunk = line.length > 1990 ? '' : line;
            if (line.length > 1990) {
                for (const sub of line.match(/.{1,1990}/g) || [line]) await channel.send(sub);
            }
        } else {
            chunk = chunk ? chunk + '\n' + line : line;
        }
    }
    if (chunk) await channel.send(chunk);
}

// ── Message handler ─────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const channelName = message.channel.name;

    // ═══ SENTINEL: Handle security channel messages ═══
    if (channelName === SECURITY_CHANNEL) {
        if (message.content.startsWith('!sentinel')) {
            if (sentinel) await sentinel.handleCommand(message);
        } else if (sentinel) {
            // Conversational messages — respond as Security Officer
            await sentinel.handleConversation(message);
        }
        return;
    }

    // ═══ SENTINEL: Scan all messages before processing ═══
    if (sentinel) {
        const scanResult = await sentinel.scanMessage(message);
        if (scanResult.blocked) return;

        // Check lockdown
        if (await sentinel.isLocked()) {
            await message.reply('🔒 **System is in lockdown.** A security concern was detected. Check #security-officer for details.');
            return;
        }
    }

    // ═══ INDIVIDUAL AGENT CHAT ═══
    if (AGENT_CHANNELS.has(channelName)) {
        console.log(`[${channelName}] ${message.author.username}: ${message.content.substring(0, 80)}`);
        try {
            await message.channel.sendTyping();

            // Load memory + search knowledge in parallel
            const [history, knowledge] = await Promise.all([
                loadMemory(channelName, message.author.id),
                searchKnowledge(message.content),
            ]);

            await saveMemory(channelName, message.author.id, 'user', message.content);

            // Rate Limit Check
            const rl = checkRateLimit(channelName);
            if (rl.blocked) {
                if (rl.reason === 'LOCKDOWN' && sentinel) {
                    await sentinel.engageLockdown('Agent loop detected', channelName, { messageCount: rateLimiter.history[channelName].length });
                }
                return message.reply(`⛔ **Action Blocked:** ${rl.label}`);
            }
            if (rl.reason === 'THROTTLE' || rl.reason === 'WARNING') {
                await message.reply(rl.label);
                if (sentinel) {
                    await sentinel.logRateLimitEvent(channelName, rl.reason, rateLimiter.history[channelName].length);
                }
            }

            const reply = await callAgent(channelName, message.content, message.author.id, message.author.username, history, knowledge);

            await saveMemory(channelName, message.author.id, 'assistant', reply);

            // Store significant conversations as knowledge (messages > 100 chars)
            if (message.content.length > 100) {
                storeKnowledge(
                    `User asked: ${message.content}\nAgent (${channelName}) replied: ${reply.substring(0, 500)}`,
                    channelName,
                    'discord_conversation'
                );
            }

            await sendLongMessage(message.channel, reply);
        } catch (error) {
            console.error('[Error]', error.message);
            await message.reply('⚠️ Unable to reach the agent.');
        }
        return;
    }

    // ═══ ROUNDTABLE DISCUSSION ═══
    if (channelName === ROUNDTABLE_CHANNEL) {
        console.log(`[ROUNDTABLE] ${message.author.username}: ${message.content.substring(0, 80)}`);
        const agents = ['chief-of-staff', 'chief-automation-officer', 'chief-strategy-officer', 'security-officer'];
        const responses = {};

        // Search knowledge once for all agents
        const knowledge = await searchKnowledge(message.content);

        await message.channel.send('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 **C-Suite Roundtable Discussion**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const agent of agents) {
            try {
                await message.channel.sendTyping();
                const prompt = `Travis asked the C-Suite roundtable: "${message.content}"\n\nGive your perspective. Be direct and specific.`;
                const reply = await callAgent(agent, prompt, message.author.id, message.author.username, [], knowledge);
                responses[agent] = reply;
                await sendLongMessage(message.channel, reply, `**${AGENT_NAMES[agent]}:**`);
                await new Promise(r => setTimeout(r, 1000));
            } catch (error) {
                console.error(`[RT Error - ${agent}]`, error.message);
                await message.channel.send(`**${AGENT_NAMES[agent]}:** ⚠️ Unable to respond.`);
            }
        }

        try {
            await message.channel.sendTyping();
            const synth = `Travis asked: "${message.content}"\n\nCoS said: "${responses['chief-of-staff'] || 'N/A'}"\n\nCAO said: "${responses['chief-automation-officer'] || 'N/A'}"\n\nReview. Where agree? DISAGREE? Missing? What should Travis do?`;
            const synthesis = await callAgent('chief-strategy-officer', synth, message.author.id, message.author.username, [], knowledge);
            await message.channel.send('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔍 **CSO Final Analysis:**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            await sendLongMessage(message.channel, synthesis);
        } catch (error) {
            console.error('[RT Synthesis Error]', error.message);
        }
        return;
    }
});

// ── Health check ────────────────────────────────────────────
const healthServer = http.createServer(async (req, res) => {
    if (req.url === '/health') {
        let dbOk = false, qdrantOk = false;
        try { await pool.query('SELECT 1'); dbOk = true; } catch { }
        try { const r = await fetch(`${QDRANT_URL}/collections`); qdrantOk = r.ok; } catch { }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', bot: client.user?.tag, uptime: Math.floor(process.uptime()), db: dbOk, qdrant: qdrantOk }));
    } else { res.writeHead(404); res.end(); }
});

healthServer.listen(3001, '0.0.0.0', () => console.log('[Bot] Health :3001'));
client.login(DISCORD_TOKEN);
