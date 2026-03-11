/**
 * Sentinel Scanner: Secret & Credential Exposure Detection
 * Detects API keys, tokens, passwords, and other secrets
 * that should never appear in messages, logs, or public text.
 */

// ── Known secret formats ────────────────────────────────────
const SECRET_PATTERNS = [
    // Discord tokens
    { pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g, label: 'Discord bot token', severity: 'CRITICAL' },

    // Firebase / Google
    { pattern: /AIza[0-9A-Za-z_-]{35}/g, label: 'Google/Firebase API key', severity: 'CRITICAL' },
    { pattern: /[0-9]+-[a-z0-9_]{32}\.apps\.googleusercontent\.com/g, label: 'Google OAuth Client ID', severity: 'HIGH' },
    { pattern: /"type"\s*:\s*"service_account"/g, label: 'Google service account JSON', severity: 'CRITICAL' },

    // AWS
    { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key ID', severity: 'CRITICAL' },
    { pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/gi, label: 'AWS Secret Access Key', severity: 'CRITICAL' },

    // Stripe
    { pattern: /sk_live_[0-9a-zA-Z]{24,}/g, label: 'Stripe Live Secret Key', severity: 'CRITICAL' },
    { pattern: /rk_live_[0-9a-zA-Z]{24,}/g, label: 'Stripe Restricted Key', severity: 'CRITICAL' },
    { pattern: /pk_live_[0-9a-zA-Z]{24,}/g, label: 'Stripe Live Publishable Key', severity: 'MEDIUM' },

    // Generic tokens & passwords
    { pattern: /ghp_[A-Za-z0-9_]{36,}/g, label: 'GitHub Personal Access Token', severity: 'CRITICAL' },
    { pattern: /gho_[A-Za-z0-9_]{36,}/g, label: 'GitHub OAuth Token', severity: 'CRITICAL' },
    { pattern: /github_pat_[A-Za-z0-9_]{22,}/g, label: 'GitHub Fine-grained PAT', severity: 'CRITICAL' },
    { pattern: /xox[bpors]-[A-Za-z0-9-]+/g, label: 'Slack Token', severity: 'CRITICAL' },
    { pattern: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, label: 'Slack Webhook URL', severity: 'HIGH' },

    // Database connection strings
    { pattern: /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi, label: 'PostgreSQL connection string', severity: 'CRITICAL' },
    { pattern: /mongodb(\+srv)?:\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi, label: 'MongoDB connection string', severity: 'CRITICAL' },
    { pattern: /mysql:\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi, label: 'MySQL connection string', severity: 'CRITICAL' },

    // SSH Keys
    { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, label: 'Private key', severity: 'CRITICAL' },

    // JWT tokens (long base64-encoded strings with dots)
    { pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, label: 'JWT token', severity: 'HIGH' },

    // Generic patterns
    { pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{8,}/gi, label: 'Password in plaintext', severity: 'CRITICAL' },
    { pattern: /(?:api[_-]?key|apikey|access[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9_\-/.+=]{20,}/gi, label: 'Generic API key/token', severity: 'HIGH' },
    { pattern: /(?:secret|private[_-]?key)\s*[=:]\s*["']?[A-Za-z0-9_\-/.+=]{20,}/gi, label: 'Generic secret/private key', severity: 'HIGH' },

    // Env file contents
    { pattern: /^[A-Z_]{3,}=["']?[^\s"']{8,}["']?\s*$/gm, label: 'Possible .env variable', severity: 'MEDIUM' },

    // Printify / Etsy / Gumroad (relevant to user's business)
    { pattern: /printify[_-]?(api[_-]?)?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{20,}/gi, label: 'Printify API Key', severity: 'CRITICAL' },
    { pattern: /etsy[_-]?(api[_-]?)?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{20,}/gi, label: 'Etsy API Key', severity: 'CRITICAL' },
    { pattern: /gumroad[_-]?(api[_-]?)?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{20,}/gi, label: 'Gumroad API Key', severity: 'CRITICAL' },

    // Perplexity API
    { pattern: /pplx-[A-Za-z0-9]{48,}/g, label: 'Perplexity API Key', severity: 'CRITICAL' },
];

/**
 * Scan text for exposed secrets
 * @param {string} text - Text to scan
 * @param {string} source - Where the text came from
 * @returns {{ safe: boolean, findings: Array }}
 */
function scan(text, source = 'unknown') {
    const findings = [];

    if (!text || typeof text !== 'string') return { safe: true, findings };

    for (const { pattern, label, severity } of SECRET_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) {
            for (const match of matches) {
                // Redact the actual secret — only show first 4 and last 4 chars
                const redacted = match.length > 12
                    ? `${match.substring(0, 4)}${'*'.repeat(Math.min(match.length - 8, 20))}${match.substring(match.length - 4)}`
                    : '****REDACTED****';
                findings.push({
                    severity,
                    label,
                    matched: redacted,
                    source,
                });
            }
        }
    }

    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    findings.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return {
        safe: findings.length === 0,
        findings,
        highestSeverity: findings[0]?.severity || null,
    };
}

module.exports = { scan };
