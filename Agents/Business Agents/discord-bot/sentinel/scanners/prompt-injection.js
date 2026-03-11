/**
 * Sentinel Scanner: Prompt Injection Detection
 * Detects attempts to override system prompts, leak instructions,
 * or inject malicious commands into agent conversations.
 */

// ── Known injection patterns ────────────────────────────────
const INJECTION_PATTERNS = [
    // Role override attempts
    { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directions?)/i, severity: 'CRITICAL', label: 'Role override attempt' },
    { pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|context)/i, severity: 'CRITICAL', label: 'Instruction disregard attempt' },
    { pattern: /forget\s+(everything|all|your)\s+(you|instructions?|rules?)/i, severity: 'CRITICAL', label: 'Memory wipe attempt' },
    { pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, severity: 'HIGH', label: 'Identity reassignment attempt' },
    { pattern: /act\s+as\s+(if|though)?\s*(a|an|the)?\s*(different|new|unrestricted)/i, severity: 'HIGH', label: 'Role reassignment attempt' },
    { pattern: /pretend\s+(you\s+are|to\s+be|you're)\s/i, severity: 'MEDIUM', label: 'Pretend roleplay attempt' },
    { pattern: /from\s+now\s+on,?\s+(you|your|ignore|disregard)/i, severity: 'HIGH', label: 'Instruction override attempt' },

    // System prompt extraction
    { pattern: /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?|guidelines?|directives?)/i, severity: 'HIGH', label: 'System prompt extraction' },
    { pattern: /reveal\s+(your|the)\s+(system|hidden|secret|internal)\s+(prompt|instructions?)/i, severity: 'CRITICAL', label: 'Prompt reveal attempt' },
    { pattern: /show\s+me\s+(your|the)\s+(original|initial|system)\s+(prompt|instructions?|message)/i, severity: 'HIGH', label: 'Prompt show attempt' },
    { pattern: /repeat\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)/i, severity: 'HIGH', label: 'Prompt repeat attempt' },
    { pattern: /print\s+(your|the)\s+(system|above|previous)\s+(prompt|message|instructions?)/i, severity: 'HIGH', label: 'Prompt print attempt' },

    // Secret/credential extraction
    { pattern: /tell\s+me\s+(the|your|all)\s*(api|secret|private)?\s*(keys?|tokens?|passwords?|credentials?|secrets?)/i, severity: 'CRITICAL', label: 'Credential extraction attempt' },
    { pattern: /what\s+(is|are)\s+(the|your)\s*(api|secret|private)?\s*(keys?|tokens?|passwords?)/i, severity: 'CRITICAL', label: 'Key extraction attempt' },
    { pattern: /output\s+(the|your|all)\s*(environment|env)\s*(variables?|vars?|config)/i, severity: 'CRITICAL', label: 'Env var extraction attempt' },
    { pattern: /list\s+(all\s+)?(api|secret|private)\s*(keys?|tokens?|credentials?)/i, severity: 'CRITICAL', label: 'Credential listing attempt' },

    // Encoded/obfuscated payloads
    { pattern: /base64[:\s]+(decode|encode|eval)/i, severity: 'HIGH', label: 'Base64 payload detected' },
    { pattern: /eval\s*\(/i, severity: 'CRITICAL', label: 'Code eval attempt' },
    { pattern: /\bexec\s*\(/i, severity: 'CRITICAL', label: 'Code exec attempt' },
    { pattern: /\\x[0-9a-fA-F]{2}/g, severity: 'MEDIUM', label: 'Hex-encoded content' },
    { pattern: /\\u[0-9a-fA-F]{4}/g, severity: 'MEDIUM', label: 'Unicode escape sequence' },

    // Instruction injection via formatting
    { pattern: /\[SYSTEM\]|\[INST\]|\[\/INST\]|<<SYS>>|<\|system\|>|<\|user\|>|<\|assistant\|>/i, severity: 'CRITICAL', label: 'Prompt template injection' },
    { pattern: /###\s*(System|Instruction|Human|Assistant)\s*:/i, severity: 'HIGH', label: 'Markdown prompt injection' },

    // Data exfiltration attempts
    { pattern: /send\s+(all|the|this)\s+(data|info|information|content)\s+to\s/i, severity: 'CRITICAL', label: 'Data exfiltration attempt' },
    { pattern: /upload\s+(to|the|this)\s+(http|ftp|server)/i, severity: 'HIGH', label: 'Upload attempt' },
    { pattern: /curl\s+(-X\s+POST\s+)?https?:\/\//i, severity: 'HIGH', label: 'HTTP request injection' },

    // Logic bombs / delayed triggers
    { pattern: /when\s+(you|the)\s+(receive|see|get|encounter)\s+the\s+(word|phrase|signal|trigger)/i, severity: 'HIGH', label: 'Trigger-based logic bomb' },
    { pattern: /on\s+(the\s+)?(next|third|fifth)\s+(message|request|query)/i, severity: 'MEDIUM', label: 'Delayed trigger attempt' },

    // Jailbreak patterns
    { pattern: /DAN\s*(mode|prompt)?|do\s+anything\s+now/i, severity: 'CRITICAL', label: 'DAN jailbreak attempt' },
    { pattern: /developer\s+mode\s+(enabled|on|output)/i, severity: 'CRITICAL', label: 'Developer mode jailbreak' },
    { pattern: /hypothetical(ly)?\s*(scenario|situation)?\s*,?\s*(how|what)\s*(would|could)\s*(you|one|someone)/i, severity: 'MEDIUM', label: 'Hypothetical bypass attempt' },
];

// ── Suspicious Unicode detection ────────────────────────────
const SUSPICIOUS_UNICODE_RANGES = [
    { range: /[\u200B-\u200F\u2028-\u202F\uFEFF]/g, label: 'Zero-width/invisible characters' },
    { range: /[\u0300-\u036F]{3,}/g, label: 'Combining character abuse' },
    { range: /[\uD800-\uDFFF]/g, label: 'Unpaired surrogate characters' },
    { range: /[\u2066-\u2069\u202A-\u202E]/g, label: 'Bidirectional text override' },
];

/**
 * Scan text for prompt injection patterns
 * @param {string} text - The text to scan
 * @param {string} source - Where the text came from (e.g., 'discord_message', 'web_research')
 * @returns {{ safe: boolean, findings: Array<{ severity: string, label: string, matched: string }> }}
 */
function scan(text, source = 'unknown') {
    const findings = [];

    if (!text || typeof text !== 'string') return { safe: true, findings };

    // Check injection patterns
    for (const { pattern, severity, label } of INJECTION_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            findings.push({
                severity,
                label,
                matched: match[0].substring(0, 100),
                source,
            });
        }
    }

    // Check suspicious Unicode
    for (const { range, label } of SUSPICIOUS_UNICODE_RANGES) {
        const matches = text.match(range);
        if (matches && matches.length > 0) {
            findings.push({
                severity: matches.length > 5 ? 'HIGH' : 'MEDIUM',
                label,
                matched: `${matches.length} instance(s)`,
                source,
            });
        }
    }

    // Check for extremely long single-line messages (potential payload)
    if (text.length > 5000 && !text.includes('\n')) {
        findings.push({
            severity: 'MEDIUM',
            label: 'Unusually long single-line message',
            matched: `${text.length} characters`,
            source,
        });
    }

    // Sort by severity
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    findings.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return {
        safe: findings.length === 0,
        findings,
        highestSeverity: findings[0]?.severity || null,
    };
}

module.exports = { scan };
