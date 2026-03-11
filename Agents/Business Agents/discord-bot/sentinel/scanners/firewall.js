/**
 * Sentinel Scanner: Infrastructure & Firewall Checks
 * Reviews Firestore rules, Docker container health,
 * and basic infrastructure security posture.
 */

const fs = require('fs').promises;
const path = require('path');

// Known insecure Firestore patterns
const INSECURE_FIRESTORE_PATTERNS = [
    { pattern: /allow\s+read\s*,\s*write\s*:\s*if\s+true/i, label: 'Firestore: unrestricted read/write', severity: 'CRITICAL' },
    { pattern: /allow\s+read\s*,\s*write\s*:\s*if\s+request\.time\s*<\s*timestamp/i, label: 'Firestore: time-limited open access', severity: 'HIGH' },
    { pattern: /allow\s+read\s*,\s*write/i, label: 'Firestore: broad read/write (review needed)', severity: 'MEDIUM' },
    { pattern: /match\s+\/\{document=\*\*\}/i, label: 'Firestore: wildcard document match', severity: 'MEDIUM' },
];

// Insecure Docker patterns
const INSECURE_DOCKER_PATTERNS = [
    { pattern: /privileged:\s*true/i, label: 'Docker: privileged container', severity: 'CRITICAL' },
    { pattern: /network_mode:\s*["']?host/i, label: 'Docker: host network mode', severity: 'HIGH' },
    { pattern: /0\.0\.0\.0:\d+:\d+/g, label: 'Docker: port bound to all interfaces', severity: 'MEDIUM' },
    { pattern: /POSTGRES_PASSWORD.*=\s*["']?[a-z]{1,8}["']?\s*$/im, label: 'Docker: weak database password', severity: 'HIGH' },
];

/**
 * Scan infrastructure config files
 * @param {string} baseDir - Base directory
 * @returns {{ safe: boolean, findings: Array }}
 */
async function scan() {
    const findings = [];

    // Scan Firestore rules (mounted from host at /config)
    const firestoreRulesPath = '/config/firestore.rules';
    try {
        const rules = await fs.readFile(firestoreRulesPath, 'utf8');
        for (const { pattern, label, severity } of INSECURE_FIRESTORE_PATTERNS) {
            if (pattern.test(rules)) {
                findings.push({ severity, label, matched: firestoreRulesPath, source: 'firewall_scan' });
            }
        }
    } catch {
        findings.push({
            severity: 'LOW',
            label: 'Firestore rules file not found',
            matched: firestoreRulesPath,
            source: 'firewall_scan',
        });
    }

    // Scan Docker compose (mounted from host at /config)
    const composePath = '/config/docker-compose.yml';
    try {
        const compose = await fs.readFile(composePath, 'utf8');
        for (const { pattern, label, severity } of INSECURE_DOCKER_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(compose)) {
                findings.push({ severity, label, matched: composePath, source: 'firewall_scan' });
            }
        }
    } catch {
        findings.push({
            severity: 'LOW',
            label: 'Docker compose file not found',
            matched: composePath,
            source: 'firewall_scan',
        });
    }

    // Check for .env file exposure
    const envPath = '/config/.env';
    try {
        await fs.access(envPath);
        // .env exists — good, but make sure it's not committed to git
        const gitignorePath = '/config/.gitignore';
        try {
            const gitignore = await fs.readFile(gitignorePath, 'utf8');
            if (!gitignore.includes('.env')) {
                findings.push({
                    severity: 'CRITICAL',
                    label: '.env file not in .gitignore',
                    matched: 'Secrets may be exposed via git',
                    source: 'firewall_scan',
                });
            }
        } catch {
            findings.push({
                severity: 'HIGH',
                label: 'No .gitignore found',
                matched: 'Cannot verify .env is excluded from version control',
                source: 'firewall_scan',
            });
        }
    } catch {
        // No .env — might be using inline env, not a finding by itself
    }

    // Check for common insecure files that shouldn't exist
    const dangerousFiles = [
        { file: 'id_rsa', label: 'SSH private key in project' },
        { file: 'credentials.json', label: 'Credentials file in project' },
        { file: '.env.local', label: 'Local env file (check for secrets)' },
    ];

    for (const { file, label } of dangerousFiles) {
        try {
            await fs.access(path.resolve('/config', file));
            findings.push({
                severity: 'HIGH',
                label,
                matched: file,
                source: 'firewall_scan',
            });
        } catch {
            // Good — file doesn't exist
        }
    }

    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    findings.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return {
        safe: findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0,
        findings,
    };
}

module.exports = { scan };
