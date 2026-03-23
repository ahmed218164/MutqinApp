/**
 * lib/audio-timing-db.ts
 *
 * Timing Database for Gapless Reciters
 *
 * For gapless reciters (who play a continuous surah MP3 file), each
 * ayah starts at a specific millisecond offset within that file.
 *
 * This module mirrors the reference app's AudioService.java approach:
 *   - SparseIntArray H  →  stores {ayah → start_ms} for the current surah
 *   - d(path, reciter) in y3/n.java → check if timing .db file exists
 *
 * DB path: {DocumentDirectory}/mushaf/{reciterId}/{reciterId}.db
 * DB URL:  https://elmushaf.com/mushaf/audio/{elmushafPath}/{reciterId}.db
 *
 * Table schema (inferred from AudioService timing array):
 *   CREATE TABLE timing (
 *     surah    INTEGER NOT NULL,
 *     ayah     INTEGER NOT NULL,
 *     start_ms INTEGER NOT NULL,   -- millisecond offset in the surah file
 *     PRIMARY KEY (surah, ayah)
 *   )
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Reciter } from './audio-reciters';
import { MUSHAF_ROOT, safeName, timingDbLocalPath, ensureReciterDir } from './audio-cache';

const ELMUSHAF_BASE = 'https://elmushaf.com';

// ── In-memory timing cache {reciterId→surah→ayah→ms} ─────────────────────────
// Mirrors AudioService's SparseIntArray H — loaded once per surah change
const timingCache = new Map<string, Map<number, Map<number, number>>>();

// ── Open DB handles ───────────────────────────────────────────────────────────
const openDbs = new Map<string, SQLite.SQLiteDatabase>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * hasTimingDb
 *
 * Mirrors y3.n.d(): checks if timing .db file exists on disk.
 */
export async function hasTimingDb(reciter: Reciter): Promise<boolean> {
    if (!reciter.elmushafPath || reciter.audioType !== 'gapless') return false;
    try {
        const info = await FileSystem.getInfoAsync(timingDbLocalPath(reciter.id));
        return info.exists && (info as any).size > 100; // must be non-empty
    } catch {
        return false;
    }
}

/**
 * downloadTimingDb
 *
 * Downloads the timing database from elmushaf.com.
 * URL format: {ELMUSHAF_BASE}/mushaf/audio/{elmushafPath}/{reciterId}.db
 */
export async function downloadTimingDb(
    reciter: Reciter,
    onProgress?: (pct: number) => void,
): Promise<void> {
    if (!reciter.elmushafPath || reciter.audioType !== 'gapless') {
        throw new Error(`Reciter ${reciter.id} is not a gapless reciter — no timing DB needed`);
    }

    const destPath = timingDbLocalPath(reciter.id);
    const url = `${ELMUSHAF_BASE}${reciter.elmushafPath}${safeName(reciter.id)}.db`;

    await ensureReciterDir(reciter.id);

    const dl = FileSystem.createDownloadResumable(
        url,
        destPath,
        {},
        (progress) => {
            if (onProgress && progress.totalBytesExpectedToWrite > 0) {
                onProgress(Math.round(
                    (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100
                ));
            }
        }
    );

    const result = await dl.downloadAsync();
    if (!result || result.status !== 200) {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
        throw new Error(`Failed to download timing DB for ${reciter.id}: HTTP ${result?.status}`);
    }
}

/**
 * openTimingDb
 *
 * Opens the SQLite timing database using expo-sqlite.
 * Caches the open handle to avoid repeated opens.
 */
async function openTimingDb(reciter: Reciter): Promise<SQLite.SQLiteDatabase | null> {
    const existing = openDbs.get(reciter.id);
    if (existing) return existing;

    const dbPath = timingDbLocalPath(reciter.id);
    const exists = await FileSystem.getInfoAsync(dbPath);
    if (!exists.exists) return null;

    try {
        const db = await SQLite.openDatabaseAsync(dbPath);
        openDbs.set(reciter.id, db);
        return db;
    } catch {
        return null;
    }
}

/**
 * loadSurahTiming
 *
 * Loads all ayah timings for a given surah into memory.
 * Mirrors AudioService's SparseIntArray H — loaded when surah changes.
 */
async function loadSurahTiming(reciter: Reciter, surah: number): Promise<void> {
    const db = await openTimingDb(reciter);
    if (!db) return;

    try {
        const rows = await db.getAllAsync<{ ayah: number; start_ms: number }>(
            'SELECT ayah, start_ms FROM timing WHERE surah = ? ORDER BY ayah ASC',
            [surah]
        );

        const surahMap = new Map<number, number>();
        for (const row of rows) {
            surahMap.set(row.ayah, row.start_ms);
        }

        let reciterMap = timingCache.get(reciter.id);
        if (!reciterMap) {
            reciterMap = new Map();
            timingCache.set(reciter.id, reciterMap);
        }
        reciterMap.set(surah, surahMap);
    } catch (e) {
        console.warn('[audio-timing-db] Failed to load surah timing:', e);
    }
}

/**
 * getAyahStartMs
 *
 * Returns the millisecond offset of a given ayah within its surah's MP3 file.
 * Returns null if not available (DB not downloaded, or ayah not found).
 *
 * In AudioService, this is used as: mediaPlayer.seekTo(H.get(ayahNumber))
 */
export async function getAyahStartMs(
    reciter: Reciter,
    surah: number,
    ayah: number,
): Promise<number | null> {
    // Check in-memory cache first
    const cached = timingCache.get(reciter.id)?.get(surah)?.get(ayah);
    if (cached !== undefined) return cached;

    // Load from DB
    await loadSurahTiming(reciter, surah);

    const fromDb = timingCache.get(reciter.id)?.get(surah)?.get(ayah);
    return fromDb ?? null;
}

/**
 * getAyahDurationMs
 *
 * Returns the duration of an ayah by computing (nextAyahStart - thisAyahStart).
 * Returns null if not determinable.
 */
export async function getAyahDurationMs(
    reciter: Reciter,
    surah: number,
    ayah: number,
    totalAyahsInSurah: number,
): Promise<number | null> {
    const start = await getAyahStartMs(reciter, surah, ayah);
    if (start === null) return null;

    if (ayah < totalAyahsInSurah) {
        const nextStart = await getAyahStartMs(reciter, surah, ayah + 1);
        if (nextStart !== null) return nextStart - start;
    }

    return null; // Last ayah — duration unknown
}

/**
 * clearTimingCache — clear in-memory timing cache for a reciter
 */
export function clearTimingCache(reciterId?: string): void {
    if (reciterId) {
        timingCache.delete(reciterId);
        const db = openDbs.get(reciterId);
        if (db) { db.closeAsync().catch(() => {}); openDbs.delete(reciterId); }
    } else {
        timingCache.clear();
        for (const db of openDbs.values()) { db.closeAsync().catch(() => {}); }
        openDbs.clear();
    }
}
