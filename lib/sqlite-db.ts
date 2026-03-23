/**
 * lib/sqlite-db.ts
 *
 * SQLite-based replacement for the old Realm database (ayat.realm v9).
 *
 * The bundled file  assets/database/ayat.db  is copied to the writable
 * documents directory on first launch and then opened read-only via
 * expo-sqlite.  All queries are synchronous (SQLite synchronous API),
 * so they run on the JS thread but are extremely fast — only the rows
 * you ask for are read from disk (no 33 MB JSON load).
 *
 * Build the .db file once on your dev machine:
 *   node scripts/build-sqlite-db.js
 */

import * as SQLite from 'expo-sqlite';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AyahBoundingBox {
    sura_number: number;
    aya_number: number;
    /** Left edge  (0–1000 per-mille) */
    min_x: number;
    /** Right edge (0–1000 per-mille) */
    max_x: number;
    /** Top edge   (0–1000 per-mille) */
    min_y: number;
    /** Bottom edge(0–1000 per-mille) */
    max_y: number;
}

export interface AyatRow {
    id: number;
    sura: number;
    aya: number;
    goza: number;
    page: number;
    type: number;
    hizb: number | null;
    text: string | null;
    text_safy: string | null;
    text_talkback: string | null;
    text_search: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * queryPageCoords
 *
 * Returns all bounding boxes for every ayah on a given Quran page.
 * Equivalent to the old Realm: realm.objects<M0AyaInfo>('M0_ayainfo').filtered('page_number == $0', page)
 *
 * @param db    Open SQLite database from openAyatDB().
 * @param page  Quran page number (1–604).
 */
export function queryPageCoords(
    db: SQLite.SQLiteDatabase, 
    page: number,
    mushafTable: string = 'M0_ayainfo'
): AyahBoundingBox[] {
    const table = mushafTable.match(/^M[0-8]_ayainfo$/) ? mushafTable : 'M0_ayainfo';
    const rows = db.getAllSync<AyahBoundingBox>(
        `SELECT sura_number, aya_number, min_x, max_x, min_y, max_y
         FROM ${table}
         WHERE page_number = ?`,
        [page]
    );
    return rows;
}

/**
 * queryAyahCoords
 *
 * Returns bounding boxes for a single ayah (may span multiple rows/lines).
 * Equivalent to the old Realm: filtered('sura_number == $0 AND aya_number == $1', sura, aya)
 *
 * @param db   Open SQLite database.
 * @param sura Surah number.
 * @param aya  Ayah number within the surah.
 */
export function queryAyahCoords(
    db: SQLite.SQLiteDatabase,
    sura: number,
    aya: number,
    mushafTable: string = 'M0_ayainfo'
): AyahBoundingBox[] {
    const table = mushafTable.match(/^M[0-8]_ayainfo$/) ? mushafTable : 'M0_ayainfo';
    const rows = db.getAllSync<AyahBoundingBox>(
        `SELECT sura_number, aya_number, min_x, max_x, min_y, max_y
         FROM ${table}
         WHERE sura_number = ? AND aya_number = ?`,
        [sura, aya]
    );
    return rows;
}

/**
 * hitTestPage
 *
 * Given a touch in per-mille space (0–1000), returns the (sura, aya) of the
 * tapped ayah, or null if no match.
 *
 * This is a multi-candidate deepest-containment scoring algorithm that correctly
 * handles overlapping bounding boxes at line breaks.
 *
 * @param db         Open SQLite database.
 * @param page       Current page number.
 * @param touchX_pm  Touch X in per-mille.
 * @param touchY_pm  Touch Y in per-mille.
 */
export function hitTestPage(
    db: SQLite.SQLiteDatabase,
    page: number,
    touchX_pm: number,
    touchY_pm: number,
    mushafTable: string = 'M0_ayainfo'
): { sura: number; aya: number } | null {
    const table = mushafTable.match(/^M[0-8]_ayainfo$/) ? mushafTable : 'M0_ayainfo';

    // Find all candidates that contain the touch point
    const candidates = db.getAllSync<{ sura_number: number; aya_number: number; min_x: number; max_x: number; min_y: number; max_y: number }>(
        `SELECT sura_number, aya_number, min_x, max_x, min_y, max_y
         FROM ${table}
         WHERE page_number = ?
           AND min_y < ? AND max_y > ?
           AND min_x < ? AND max_x > ?`,
        [page, touchY_pm, touchY_pm, touchX_pm, touchX_pm]
    );

    if (candidates.length === 0) {
        return null;
    }

    // ── Deepest-containment scoring ───────────────────────────────────────────
    //
    // At line breaks, consecutive ayahs have bounding boxes that overlap
    // in Y. We resolve the ambiguity by asking: for which ayah is the touch
    // point most "inside" the box — i.e., furthest from all four edges?
    //
    // Score for each candidate box:
    //   dyTop   = touchY_pm - min_y   (distance from top edge,    ≥ 0)
    //   dyBot   = max_y - touchY_pm   (distance from bottom edge, ≥ 0)
    //   dxNear  = min(touchX_pm - min_x, max_x - touchX_pm)
    //   score   = 2 × min(dyTop, dyBot)   ← Y depth, weighted 2×
    //           +     dxNear              ← X depth
    //
    // Y is weighted 2× because at a line break the touch is a full line-height
    // away from the wrong row in Y, but only word-width away in X — the Y
    // signal is much stronger.
    //
    // A single ayah can span multiple lines (multiple rows with same sura/aya).
    // We keep only the BEST (largest) score per unique (sura, aya) pair.

    const ayahBest = new Map<string, { sura: number; aya: number; score: number }>();

    for (const c of candidates) {
        const dyTop  = touchY_pm - c.min_y;
        const dyBot  = c.max_y  - touchY_pm;
        const dxNear = Math.min(touchX_pm - c.min_x, c.max_x - touchX_pm);
        const score  = 2 * Math.min(dyTop, dyBot) + dxNear;

        const key = `${c.sura_number}:${c.aya_number}`;
        const prev = ayahBest.get(key);
        if (!prev || score > prev.score) {
            ayahBest.set(key, { sura: c.sura_number, aya: c.aya_number, score });
        }
    }

    // Return the ayah with the highest containment score
    let winner: { sura: number; aya: number; score: number } | null = null;
    for (const entry of ayahBest.values()) {
        if (!winner || entry.score > winner.score) winner = entry;
    }
    return winner ? { sura: winner.sura, aya: winner.aya } : null;
}

/**
 * queryAyatByPage
 *
 * Returns all Ayat metadata rows for a given page.
 *
 * @param db   Open SQLite database.
 * @param page Quran page number (1–604).
 */
export function queryAyatByPage(db: SQLite.SQLiteDatabase, page: number): AyatRow[] {
    return db.getAllSync<AyatRow>(
        `SELECT id, sura, aya, goza, page, type, hizb, text, text_safy, text_talkback, text_search
         FROM Ayat
         WHERE page = ?
         ORDER BY id`,
        [page]
    );
}

/**
 * queryAyah
 *
 * Returns a single Ayat row by (sura, aya).
 *
 * @param db   Open SQLite database.
 * @param sura Surah number.
 * @param aya  Ayah number within the surah.
 */
export function queryAyah(
    db: SQLite.SQLiteDatabase,
    sura: number,
    aya: number,
): AyatRow | null {
    return db.getFirstSync<AyatRow>(
        `SELECT id, sura, aya, goza, page, type, hizb, text, text_safy, text_talkback, text_search
         FROM Ayat
         WHERE sura = ? AND aya = ?`,
        [sura, aya]
    ) ?? null;
}

/**
 * normalizeArabic
 *
 * Mirrors g4.f.java's i() normalization function.
 * Strips all Arabic harakat (tashkeel) and unifies Hamza/Alef variants
 * and Taa Marbuta so that searches are forgiving of spelling variants.
 *
 * Character substitutions (from reference: `i(str, char, char)` calls):
 *   \u0623 (أ) → \u0627 (ا)
 *   \u0625 (إ) → \u0627 (ا)
 *   \u0622 (آ) → \u0627 (ا)
 *   \u0671 (ٱ) → \u0627 (ا)
 *   \u0629 (ة) → \u0647 (ه)
 *
 * Harakat stripped: \u064B–\u065F (tanwin/kasra/fatha/etc) + \u0670 (superscript alef)
 */
export function normalizeArabic(text: string): string {
    return text
        .replace(/[\u064B-\u065F\u0670]/g, '')   // strip harakat
        .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')  // أإآٱ → ا
        .replace(/\u0629/g, '\u0647');             // ة → ه
}

export interface SearchOptions {
    suraFilter?: number | null;   // null = all suras
    juzFilter?: number | null;    // null = all ajza'
    limit?: number;
}

/**
 * searchAyat
 *
 * Full-text search over text_search column (stripped + normalized diacritics).
 * Supports optional sura and juz filters.
 */
export function searchAyat(
    db: SQLite.SQLiteDatabase,
    rawQuery: string,
    limitOrOptions: number | SearchOptions = 50,
): AyatRow[] {
    const opts: SearchOptions = typeof limitOrOptions === 'number'
        ? { limit: limitOrOptions }
        : limitOrOptions;
    const limit = opts.limit ?? 50;

    // Normalize query to match the text_search column (mirrors g4.f.java)
    const query = normalizeArabic(rawQuery.trim());
    if (!query) return [];

    const params: (string | number)[] = [`%${query}%`];
    let sql = `SELECT id, sura, aya, goza, page, type, hizb, text, text_safy, text_talkback, text_search
               FROM Ayat
               WHERE text_search LIKE ?`;

    if (opts.suraFilter != null) {
        sql += ` AND sura = ?`;
        params.push(opts.suraFilter);
    }
    if (opts.juzFilter != null) {
        sql += ` AND goza = ?`;
        params.push(opts.juzFilter);
    }

    sql += ` ORDER BY sura ASC, aya ASC LIMIT ?`;
    params.push(limit);

    return db.getAllSync<AyatRow>(sql, params);
}

/**
 * countOccurrences
 *
 * Counts total occurrences of `keyword` across all matching verses,
 * including multiple hits within the same verse.
 */
export function countOccurrences(
    db: SQLite.SQLiteDatabase,
    rawKeyword: string,
    opts: Omit<SearchOptions, 'limit'> = {},
): number {
    const keyword = normalizeArabic(rawKeyword.trim());
    if (!keyword) return 0;

    const params: (string | number)[] = [`%${keyword}%`];
    let sql = `SELECT text_search FROM Ayat WHERE text_search LIKE ?`;
    if (opts.suraFilter != null) { sql += ` AND sura = ?`; params.push(opts.suraFilter); }
    if (opts.juzFilter  != null) { sql += ` AND goza = ?`; params.push(opts.juzFilter);  }

    const rows = db.getAllSync<{ text_search: string | null }>(sql, params);
    let total = 0;
    for (const row of rows) {
        const ts = row.text_search ?? '';
        let idx = 0;
        while ((idx = ts.indexOf(keyword, idx)) !== -1) {
            total++;
            idx += keyword.length;
        }
    }
    return total;
}

/**
 * scaleCoord  (mirrors l4/a.java line 8-10 from original Realm implementation)
 *
 * Converts a per-mille database value → screen pixels.
 * Java uses `(value * dim) / 1000` with integer division, which truncates.
 * We must use Math.trunc() to mirror this and avoid 1px gaps or anti-aliasing errors.
 *
 * @param dbValue          Value from the DB (0–1000).
 * @param imageDimensionPx Rendered width or height of the Mushaf image in pixels.
 */
export function scaleCoord(dbValue: number, imageDimensionPx: number): number {
    return Math.trunc((dbValue * imageDimensionPx) / 1000);
}
