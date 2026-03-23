/**
 * scripts/build-sqlite-db.js
 *
 * Converts assets/database/ayah_coordinates.json → assets/database/ayat.db
 *
 * Includes ALL tables from the original Realm file:
 *   - Ayat               (6 236 rows  — Quran text)
 *   - M0_ayainfo … M8_ayainfo  (13 000-14 000 rows each — 9 mushaf variants)
 *   - Tafsir_muyassar    (6 236 rows  — Tafsir text)
 *
 * Run once on your development machine:
 *   node scripts/build-sqlite-db.js
 *
 * Requires: better-sqlite3
 *   npm install --save-dev better-sqlite3
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────
const JSON_PATH = path.join(__dirname, '..', 'assets', 'database', 'ayah_coordinates.json');
const DB_PATH = path.join(__dirname, '..', 'assets', 'database', 'ayat.db');

// ─────────────────────────────────────────────────────────────────────────────
// Load better-sqlite3
// ─────────────────────────────────────────────────────────────────────────────
let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('\n❌  better-sqlite3 is not installed.');
    console.error('    Run:  npm install --save-dev better-sqlite3\n');
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Load JSON
// ─────────────────────────────────────────────────────────────────────────────
console.log('📖  Reading JSON file…');
const raw = fs.readFileSync(JSON_PATH, 'utf8');
console.log('🔄  Parsing JSON…');
const data = JSON.parse(raw);

// ─────────────────────────────────────────────────────────────────────────────
// Remove old DB  (retry if Metro bundler has it locked)
// ─────────────────────────────────────────────────────────────────────────────
if (fs.existsSync(DB_PATH)) {
    let deleted = false;
    for (let attempt = 1; attempt <= 10; attempt++) {
        try {
            fs.unlinkSync(DB_PATH);
            console.log('🗑️   Removed old ayat.db');
            deleted = true;
            break;
        } catch (e) {
            if (e.code === 'EBUSY' || e.code === 'EPERM') {
                console.warn(`⚠️   ayat.db is locked (attempt ${attempt}/10) — is Metro bundler running?`);
                console.warn('    Stop Metro (Ctrl-C in the expo terminal) and press Enter here to retry…');
                // Simple synchronous wait — works in a build script
                const buf = Buffer.alloc(1);
                try { require('fs').readSync(0, buf, 0, 1, null); } catch { }
            } else {
                throw e;
            }
        }
    }
    if (!deleted) {
        console.error('❌  Could not delete the old ayat.db after 10 attempts.');
        console.error('    Please stop the Metro bundler (Ctrl-C) and run this script again.');
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Open / create DB
// ─────────────────────────────────────────────────────────────────────────────
console.log('🏗️   Creating SQLite database…');
const db = new Database(DB_PATH);

db.pragma('journal_mode = OFF');
db.pragma('synchronous  = OFF');
db.pragma('temp_store   = MEMORY');
db.pragma('cache_size   = 100000');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generic bulk insert
// ─────────────────────────────────────────────────────────────────────────────
function bulkInsert(tableName, rows, preparedStmt) {
    const insert = db.transaction((items) => {
        for (const row of items) preparedStmt.run(row);
    });
    insert(rows);
    console.log(`   ✅  ${rows.length.toLocaleString()} rows → ${tableName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ayat
// ─────────────────────────────────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS Ayat (
        id              INTEGER PRIMARY KEY,
        sura            INTEGER NOT NULL,
        aya             INTEGER NOT NULL,
        goza            INTEGER NOT NULL,
        page            INTEGER NOT NULL,
        type            INTEGER NOT NULL DEFAULT 0,
        hizb            REAL,
        text            TEXT,
        text_safy       TEXT,
        text_talkback   TEXT,
        text_search     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ayat_sura_aya      ON Ayat (sura, aya);
    CREATE INDEX IF NOT EXISTS idx_ayat_page          ON Ayat (page);
    CREATE INDEX IF NOT EXISTS idx_ayat_goza          ON Ayat (goza);
    CREATE INDEX IF NOT EXISTS idx_ayat_text_search   ON Ayat (text_search);
`);

const ayatRows = data['Ayat'] || [];
console.log(`📝  Inserting ${ayatRows.length.toLocaleString()} Ayat rows…`);
bulkInsert('Ayat', ayatRows, db.prepare(`
    INSERT OR REPLACE INTO Ayat
        (id, sura, aya, goza, page, type, hizb, text, text_safy, text_talkback, text_search)
    VALUES
        (@id, @sura, @aya, @goza, @page, @type, @hizb, @text, @text_safy, @text_talkback, @text_search)
`));

// ─────────────────────────────────────────────────────────────────────────────
// 2–10. M0_ayainfo … M8_ayainfo  (9 mushaf variant coordinate tables)
//        Schema (from Realm): id, page_number, sura_number, aya_number,
//                             position_number, min_x, min_y, max_x, max_y
// ─────────────────────────────────────────────────────────────────────────────
const AYAINFO_TABLES = [
    'M0_ayainfo', 'M1_ayainfo', 'M2_ayainfo', 'M3_ayainfo',
    'M4_ayainfo', 'M5_ayainfo', 'M6_ayainfo', 'M7_ayainfo', 'M8_ayainfo',
];

for (const tbl of AYAINFO_TABLES) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS ${tbl} (
            id              INTEGER PRIMARY KEY,
            page_number     INTEGER NOT NULL,
            sura_number     INTEGER NOT NULL,
            aya_number      INTEGER NOT NULL,
            position_number INTEGER NOT NULL DEFAULT 1,
            min_x           INTEGER NOT NULL,
            min_y           INTEGER NOT NULL,
            max_x           INTEGER NOT NULL,
            max_y           INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_${tbl}_page    ON ${tbl} (page_number);
        CREATE INDEX IF NOT EXISTS idx_${tbl}_sura    ON ${tbl} (sura_number, aya_number);
    `);

    const rows = data[tbl] || [];
    console.log(`📝  Inserting ${rows.length.toLocaleString()} ${tbl} rows…`);
    bulkInsert(tbl, rows, db.prepare(`
        INSERT OR REPLACE INTO ${tbl}
            (id, page_number, sura_number, aya_number, position_number, min_x, min_y, max_x, max_y)
        VALUES
            (@id, @page_number, @sura_number, @aya_number, @position_number, @min_x, @min_y, @max_x, @max_y)
    `));
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Tafsir_muyassar
// ─────────────────────────────────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS Tafsir_muyassar (
        id      INTEGER PRIMARY KEY,
        sura    INTEGER NOT NULL,
        aya     INTEGER NOT NULL,
        page    INTEGER NOT NULL,
        text    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tafsir_sura_aya ON Tafsir_muyassar (sura, aya);
    CREATE INDEX IF NOT EXISTS idx_tafsir_page     ON Tafsir_muyassar (page);
`);

const tafsirRows = data['Tafsir_muyassar'] || [];
console.log(`📝  Inserting ${tafsirRows.length.toLocaleString()} Tafsir_muyassar rows…`);
bulkInsert('Tafsir_muyassar', tafsirRows, db.prepare(`
    INSERT OR REPLACE INTO Tafsir_muyassar (id, sura, aya, page, text)
    VALUES (@id, @sura, @aya, @page, @text)
`));

// ─────────────────────────────────────────────────────────────────────────────
// Optimize
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⚡  Running ANALYZE + VACUUM…');
db.exec('ANALYZE;');
db.exec('VACUUM;');
db.close();

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
const stats = fs.statSync(DB_PATH);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
console.log(`\n✅  Done!  ayat.db created at:\n   ${DB_PATH}`);
console.log(`   Size: ${sizeMB} MB`);
console.log('\n   Tables included:');
console.log('     Ayat, M0_ayainfo – M8_ayainfo, Tafsir_muyassar');
console.log('\n👉  Next steps:');
console.log('   1. Restart Metro bundler (Ctrl-C, then npx expo start --android)');
console.log('   2. Clear app data on the device OR it will self-heal on first launch');
