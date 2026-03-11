/**
 * Sentinel Scanner: Dependency Vulnerability Auditor
 * Checks package.json dependencies against known vulnerable versions
 * and flags supply chain risks.
 */

const fs = require('fs').promises;
const path = require('path');

// Known vulnerable package versions (curated list — updated periodically)
// Format: { name: { vulnerable: ['version_range'], advisory: 'description' } }
const KNOWN_VULNERABILITIES = {
    'discord.js': {
        vulnerableBefore: '14.14.0',
        advisory: 'Versions before 14.14.0 have known security patches',
    },
    'express': {
        vulnerableBefore: '4.19.0',
        advisory: 'CVE-2024-29041: Open redirect vulnerability',
    },
    'axios': {
        vulnerableBefore: '1.6.0',
        advisory: 'CVE-2023-45857: CSRF vulnerability',
    },
    'jsonwebtoken': {
        vulnerableBefore: '9.0.0',
        advisory: 'CVE-2022-23529: Insecure key handling',
    },
    'node-fetch': {
        vulnerableBefore: '2.6.7',
        advisory: 'CVE-2022-0235: Exposure of sensitive info',
    },
    'pg': {
        vulnerableBefore: '8.11.0',
        advisory: 'Prototype pollution fix in 8.11.0+',
    },
};

// Suspicious package name patterns (typosquatting)
const TYPOSQUAT_PATTERNS = [
    /^discordjs$/i,          // discord.js → discordjs
    /^discord\.j$/i,
    /^disocrd/i,             // misspellings
    /^loadsh$/i,             // lodash → loadsh
    /^cross-env-\w+$/i,     // cross-env typosquatting  
    /^event-stream$/i,       // Historical supply chain attack
    /^flatmap-stream$/i,     // Historical supply chain attack
];

/**
 * Parse semver string into components for comparison
 */
function parseSemver(version) {
    const clean = version.replace(/^[^0-9]*/, '');
    const parts = clean.split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

/**
 * Check if version A is less than version B
 */
function isVersionBefore(versionA, versionB) {
    const a = parseSemver(versionA);
    const b = parseSemver(versionB);
    if (a.major !== b.major) return a.major < b.major;
    if (a.minor !== b.minor) return a.minor < b.minor;
    return a.patch < b.patch;
}

/**
 * Scan package.json files for vulnerabilities
 * @param {string} baseDir - Base directory to search
 * @returns {{ safe: boolean, findings: Array, scanned: number }}
 */
async function scan(baseDir = '/app') {
    const findings = [];
    const packagePaths = [
        path.join(baseDir, 'package.json'),
        path.join(baseDir, '..', 'empire', 'package.json'),
    ];

    let scanned = 0;

    for (const pkgPath of packagePaths) {
        let pkg;
        try {
            const content = await fs.readFile(pkgPath, 'utf8');
            pkg = JSON.parse(content);
        } catch {
            continue;
        }

        scanned++;
        const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
        };

        for (const [name, version] of Object.entries(allDeps)) {
            // Check known vulnerabilities
            if (KNOWN_VULNERABILITIES[name]) {
                const vuln = KNOWN_VULNERABILITIES[name];
                const cleanVersion = version.replace(/^[\^~>=<]+/, '');
                if (isVersionBefore(cleanVersion, vuln.vulnerableBefore)) {
                    findings.push({
                        severity: 'HIGH',
                        label: `Vulnerable dependency: ${name}@${version}`,
                        matched: `${vuln.advisory} (upgrade to >=${vuln.vulnerableBefore})`,
                        source: pkgPath,
                    });
                }
            }

            // Check for typosquatting
            for (const pattern of TYPOSQUAT_PATTERNS) {
                if (pattern.test(name)) {
                    findings.push({
                        severity: 'CRITICAL',
                        label: `Suspicious package name: ${name}`,
                        matched: 'Possible typosquatting / supply chain attack',
                        source: pkgPath,
                    });
                }
            }
        }
    }

    return {
        safe: findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0,
        findings,
        scanned,
    };
}

module.exports = { scan };
