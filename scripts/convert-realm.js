/**
 * scripts/convert-realm.js
 *
 * ONE-TIME migration script.
 * Converts assets/database/ayat.realm (file format v9, Realm Java 3.x era)
 * to a fresh Realm file that Realm JS v20 can open natively.
 *
 * Usage:
 *   1. node scripts/convert-realm.js
 *
 * How it works:
 *   - Uses realm@10 (installed into scripts/node_modules/) to READ the v9 file
 *   - Uses the project's realm@20 to WRITE a fresh file
 *   - Replaces assets/database/ayat.realm with the converted version
 *
 * After running this script:
 *   - Delete the bootstrap marker on device/emulator so the app re-copies:
 *       adb shell rm /data/data/com.ahmedzaki254.mutqinapp/files/.realm_bootstrapped_v1
 *       adb shell rm /data/data/com.ahmedzaki254.mutqinapp/files/ayat.realm
 *   Then restart the app.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DB_SRC = path.join(ROOT, 'assets', 'database', 'ayat.realm');
const DB_OUT = path.join(ROOT, 'assets', 'database', 'ayat_v20.realm');
const SCRIPTS = __dirname;
const REALM_OLD = path.join(SCRIPTS, 'node_modules', 'realm');

// ─── Step 1: Install realm@10 locally into scripts/node_modules ──────────────
if (!fs.existsSync(REALM_OLD)) {
    console.log('📦 Installing realm@10 locally (one-time)…');
    execSync('npm install realm@10 --prefix .', { cwd: SCRIPTS, stdio: 'inherit' });
    console.log('✅ realm@10 installed');
} else {
    console.log('✅ realm@10 already installed in scripts/node_modules/');
}

// ─── Step 2: Read the v9 database with realm@10 ──────────────────────────────
console.log('\n📖 Opening v9 Realm file with realm@10…');
const OldRealm = require(REALM_OLD);

let rows = [];
let oldRealm;
try {
    oldRealm = new OldRealm({
        path: DB_SRC,
        // Open with empty schema to get dynamic access to all tables
        schema: [],
        readOnly: true,
    });

    // List all tables
    const tables = oldRealm.schema.map(s => s.name);
    console.log('Tables found:', tables.join(', '));

    // Read M0_ayainfo
    const TABLE = 'M0_ayainfo';
    if (!tables.includes(TABLE)) {
        throw new Error(`Table ${TABLE} not found. Available: ${tables.join(', ')}`);
    }

    const results = oldRealm.objects(TABLE);
    console.log(`Reading ${results.length} rows from ${TABLE}…`);

    for (const row of results) {
        rows.push({
            id: Number(row.id),
            page_number: Number(row.page_number),
            sura_number: Number(row.sura_number),
            aya_number: Number(row.aya_number),
            min_x: Number(row.min_x),
            max_x: Number(row.max_x),
            min_y: Number(row.min_y),
            max_y: Number(row.max_y),
        });
    }

    // Also read Ayat table
    let ayatRows = [];
    if (tables.includes('Ayat')) {
        const ayatResults = oldRealm.objects('Ayat');
        console.log(`Reading ${ayatResults.length} rows from Ayat…`);
        for (const row of ayatResults) {
            ayatRows.push({
                id: Number(row.id),
                sura: Number(row.sura),
                aya: Number(row.aya),
                page: Number(row.page),
                goza: Number(row.goza),
                hizb: row.hizb != null ? Number(row.hizb) : undefined,
                rub3: row.rub3 != null ? Number(row.rub3) : undefined,
            });
        }
    }

    oldRealm.close();
    console.log(`✅ Extracted ${rows.length} M0_ayainfo rows, ${ayatRows.length} Ayat rows`);

    // ─── Step 3: Write a fresh Realm v20 database ────────────────────────────
    console.log('\n✍️  Writing fresh Realm v20 database…');
    const NewRealm = require('realm');

    // Delete any existing output file
    if (fs.existsSync(DB_OUT)) fs.unlinkSync(DB_OUT);

    const newRealm = new NewRealm({
        path: DB_OUT,
        schema: [
            {
                name: 'M0_ayainfo',
                primaryKey: 'id',
                properties: {
                    id: { type: 'int', indexed: true },
                    page_number: { type: 'int', indexed: true },
                    sura_number: { type: 'int', indexed: true },
                    aya_number: { type: 'int', indexed: true },
                    min_x: 'int',
                    max_x: 'int',
                    min_y: 'int',
                    max_y: 'int',
                },
            },
            {
                name: 'Ayat',
                primaryKey: 'id',
                properties: {
                    id: { type: 'int', indexed: true },
                    sura: { type: 'int', indexed: true },
                    aya: { type: 'int', indexed: true },
                    page: { type: 'int', indexed: true },
                    goza: { type: 'int', indexed: true },
                    hizb: { type: 'int', optional: true },
                    rub3: { type: 'int', optional: true },
                },
            },
        ],
        schemaVersion: 0,
    });

    console.log('Inserting rows (this may take a moment)…');
    newRealm.write(() => {
        let count = 0;
        for (const row of rows) {
            newRealm.create('M0_ayainfo', row);
            count++;
            if (count % 10000 === 0) process.stdout.write(`  ${count}/${rows.length}\r`);
        }
        console.log(`  Inserted ${rows.length} M0_ayainfo rows`);

        for (const row of ayatRows) {
            newRealm.create('Ayat', row);
        }
        console.log(`  Inserted ${ayatRows.length} Ayat rows`);
    });

    newRealm.close();

    const sizeMB = (fs.statSync(DB_OUT).size / 1024 / 1024).toFixed(1);
    console.log(`✅ Written: ${DB_OUT} (${sizeMB} MB)`);

    // ─── Step 4: Replace original ─────────────────────────────────────────────
    fs.copyFileSync(DB_OUT, DB_SRC);
    fs.unlinkSync(DB_OUT);
    console.log(`✅ Replaced assets/database/ayat.realm with the v20 format`);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CONVERSION COMPLETE

Next steps:
  1. Clear the bootstrap marker + old realm from device:
       adb shell rm /data/data/com.ahmedzaki254.mutqinapp/files/.realm_bootstrapped_v1
       adb shell rm /data/data/com.ahmedzaki254.mutqinapp/files/ayat.realm

  2. Restart Expo:
       npx expo start --android --clear
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

} catch (err) {
    if (oldRealm && !oldRealm.isClosed) oldRealm.close();
    console.error('\n❌ Conversion failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}
