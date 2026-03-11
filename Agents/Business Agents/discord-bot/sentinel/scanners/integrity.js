/**
 * Sentinel Scanner: File Integrity Monitor
 * Maintains SHA-256 hashes of critical files and detects
 * unauthorized modifications between scans.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Critical files to monitor
// Files inside the container (/app) and host configs mounted at /config
const CRITICAL_FILES = [
    { path: '/app/bot.js', label: 'bot.js' },
    { path: '/app/package.json', label: 'package.json' },
    { path: '/config/docker-compose.yml', label: 'docker-compose.yml' },
    { path: '/config/firestore.rules', label: 'firestore.rules' },
    { path: '/config/.env', label: '.env' },
];

/**
 * Compute SHA-256 hash of a file
 */
async function hashFile(filePath) {
    try {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (e) {
        return null; // File not found or unreadable
    }
}

/**
 * Run integrity scan against stored hashes
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {string} baseDir - Base directory for file resolution
 * @returns {{ safe: boolean, findings: Array, scanned: number }}
 */
async function scan(pool) {
    const findings = [];
    let scanned = 0;

    // Ensure the hashes table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sentinel_file_hashes (
            file_path TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            first_seen TIMESTAMPTZ DEFAULT NOW(),
            last_verified TIMESTAMPTZ DEFAULT NOW(),
            last_changed TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    for (const { path: filePath, label: fileLabel } of CRITICAL_FILES) {
        const currentHash = await hashFile(filePath);

        if (!currentHash) {
            // Only flag as finding if the file should definitely exist
            if (!filePath.startsWith('/config/')) {
                findings.push({
                    severity: 'MEDIUM',
                    label: 'Monitored file not found',
                    matched: fileLabel,
                    source: 'integrity_scan',
                });
            }
            continue;
        }

        scanned++;

        // Check against stored hash
        const stored = await pool.query(
            'SELECT hash, last_changed FROM sentinel_file_hashes WHERE file_path = $1',
            [fileLabel]
        );

        if (stored.rows.length === 0) {
            // First time seeing this file — store baseline
            await pool.query(
                'INSERT INTO sentinel_file_hashes (file_path, hash) VALUES ($1, $2)',
                [fileLabel, currentHash]
            );
            findings.push({
                severity: 'LOW',
                label: 'New file baseline established',
                matched: fileLabel,
                source: 'integrity_scan',
            });
        } else if (stored.rows[0].hash !== currentHash) {
            // File has changed!
            const lastChanged = stored.rows[0].last_changed;
            findings.push({
                severity: 'HIGH',
                label: 'File modified since last scan',
                matched: `${fileLabel} (last known good: ${new Date(lastChanged).toISOString()})`,
                source: 'integrity_scan',
            });
            // Update the stored hash
            await pool.query(
                'UPDATE sentinel_file_hashes SET hash = $1, last_changed = NOW(), last_verified = NOW() WHERE file_path = $2',
                [currentHash, fileLabel]
            );
        } else {
            // No change — update verification timestamp
            await pool.query(
                'UPDATE sentinel_file_hashes SET last_verified = NOW() WHERE file_path = $1',
                [fileLabel]
            );
        }
    }

    return {
        safe: findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length === 0,
        findings,
        scanned,
    };
}

/**
 * Get the full hash registry for briefings
 */
async function getRegistry(pool) {
    const result = await pool.query(
        'SELECT file_path, hash, last_verified, last_changed FROM sentinel_file_hashes ORDER BY file_path'
    );
    return result.rows;
}

module.exports = { scan, getRegistry, CRITICAL_FILES };
