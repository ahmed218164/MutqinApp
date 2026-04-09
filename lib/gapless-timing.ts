/**
 * lib/gapless-timing.ts
 *
 * Gapless Timestamps Engine — Reverse-engineered from reference app.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  REFERENCE: service/audio/c.java + m3/f.java                          │
 * │                                                                        │
 * │  The timing DB is a SQLite database at:                                │
 * │   https://storage.elmushaf.com/sound_sura/{reciter_id}/{reciter_id}.db │
 * │                                                                        │
 * │  Schema:  table "timings" (sura INT, ayah INT, time INT)               │
 * │   - sura: surah number (1-114)                                         │
 * │   - ayah: verse number within surah                                    │
 * │   - time: millisecond offset into the surah MP3 file                   │
 * │                                                                        │
 * │  The reference app loads timings into a SparseIntArray(ayah → ms),     │
 * │  then uses seekTo() to jump within a single-file surah stream.         │
 * │  We replicate this approach exactly.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { getTimingDbUrl } from './quran-audio-api';
import { MUSHAF_ROOT, safeName, ensureReciterDir } from './audio-cache';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Timing offset for a single verse within a surah MP3 */
export interface VerseTiming {
    ayah: number;
    /** Millisecond offset from the start of the surah MP3 */
    timeMs: number;
}

/** All verse timings for a single surah, sorted by ayah */
export interface SurahTimings {
    surah: number;
    verses: VerseTiming[];
    /** Special key 999 from reference app — marks end of surah (total duration) */
    totalDurationMs: number;
}

// ── In-memory cache ──────────────────────────────────────────────────────────

/** Cache: reciterId → Map<surahNo, SurahTimings> */
const timingsCache = new Map<string, Map<number, SurahTimings>>();

/** Track ongoing DB downloads to prevent duplicate downloads */
const dbDownloadInProgress = new Map<string, Promise<string | null>>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads (if needed) and loads verse timings for a gapless reciter + surah.
 *
 * Returns null if the timing DB is unavailable or corrupt.
 *
 * @param reciterId  The reciter enum ID (e.g. "mishari_alafasy_sura")
 * @param surahNo    Surah number (1-114)
 */
export async function getVerseTimings(
    reciterId: string,
    surahNo: number,
): Promise<SurahTimings | null> {
    // Check in-memory cache first
    const reciterMap = timingsCache.get(reciterId);
    if (reciterMap?.has(surahNo)) {
        return reciterMap.get(surahNo)!;
    }

    try {
        // Ensure the timing DB is downloaded locally
        const dbPath = await ensureTimingDbLocal(reciterId);
        if (!dbPath) {
            console.warn(`[GaplessTiming] No timing DB available for reciter: ${reciterId}`);
            return null;
        }

        // Query the timing DB for this surah
        const timings = await queryTimingsFromDb(dbPath, reciterId, surahNo);
        if (!timings) return null;

        // Cache the result
        if (!timingsCache.has(reciterId)) {
            timingsCache.set(reciterId, new Map());
        }
        timingsCache.get(reciterId)!.set(surahNo, timings);

        return timings;
    } catch (err) {
        console.error(`[GaplessTiming] Failed to load timings for ${reciterId}:${surahNo}:`, err);
        return null;
    }
}

/**
 * Get the verse that should be highlighted at a given playback position.
 *
 * Mirrors AudioService.java `a()` method (updateAudioPlayPosition):
 *   Walk the timing array to find which ayah contains the current position.
 *
 * @param timings    The loaded SurahTimings for the current surah
 * @param positionMs Current playback position in milliseconds
 * @returns The ayah number that should be highlighted, or -1 if not found
 */
export function getVerseAtPosition(timings: SurahTimings, positionMs: number): number {
    const { verses } = timings;
    if (verses.length === 0) return -1;

    // Walk backwards to find the last verse whose offset ≤ current position
    // (Same logic as the reference app's SparseIntArray binary scan)
    for (let i = verses.length - 1; i >= 0; i--) {
        if (verses[i].timeMs <= positionMs) {
            return verses[i].ayah;
        }
    }

    // Position is before verse 1 (e.g. Bismillah intro)
    return verses[0].ayah;
}

/**
 * Get the millisecond offset for a specific ayah.
 * Used for seek-to-verse when user taps an ayah on the Mushaf.
 *
 * @returns Millisecond offset, or -1 if not found
 */
export function getVerseOffset(timings: SurahTimings, ayahNo: number): number {
    const entry = timings.verses.find(v => v.ayah === ayahNo);
    return entry ? entry.timeMs : -1;
}

/**
 * Check if the surah MP3 has finished playing (reached end-of-surah marker).
 * Reference app uses key 999 in the SparseIntArray for this.
 */
export function isSurahComplete(timings: SurahTimings, positionMs: number): boolean {
    return timings.totalDurationMs > 0 && positionMs >= timings.totalDurationMs;
}

/**
 * Clear all cached timings (e.g. when switching reciters).
 */
export function clearTimingsCache(): void {
    timingsCache.clear();
}

/**
 * Clear cached timings for a specific reciter.
 */
export function clearReciterTimings(reciterId: string): void {
    timingsCache.delete(reciterId);
}

// ── Private: DB download & query ─────────────────────────────────────────────

/**
 * Ensures the timing DB for a reciter is available locally.
 * Downloads from the CDN if not present.
 *
 * @returns Local file path to the DB, or null if download failed
 */
async function ensureTimingDbLocal(reciterId: string): Promise<string | null> {
    const localPath = `${MUSHAF_ROOT}${safeName(reciterId)}/${safeName(reciterId)}.db`;

    // Check if already on disk
    try {
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && (info as any).size > 1024) {
            // Already downloaded — at least 1KB (sanity check against empty/404 responses)
            return localPath;
        }
    } catch { /* fall through to download */ }

    // Check if download is already in progress (deduplication)
    if (dbDownloadInProgress.has(reciterId)) {
        return dbDownloadInProgress.get(reciterId)!;
    }

    // Start background download
    const downloadPromise = (async (): Promise<string | null> => {
        try {
            await ensureReciterDir(reciterId);
            const remoteUrl = getTimingDbUrl(reciterId);
            console.log(`[GaplessTiming] Downloading timing DB: ${remoteUrl}`);

            const dl = FileSystem.createDownloadResumable(remoteUrl, localPath, {});
            const result = await dl.downloadAsync();

            if (!result || result.status !== 200) {
                console.warn(`[GaplessTiming] DB download failed: status=${result?.status}`);
                await FileSystem.deleteAsync(localPath, { idempotent: true });
                return null;
            }

            // Verify the downloaded file is a valid SQLite DB (starts with "SQLite format 3")
            const fileInfo = await FileSystem.getInfoAsync(localPath);
            if (!fileInfo.exists || (fileInfo as any).size < 1024) {
                console.warn(`[GaplessTiming] Downloaded DB too small, likely 404 HTML`);
                await FileSystem.deleteAsync(localPath, { idempotent: true });
                return null;
            }

            console.log(`[GaplessTiming] Timing DB downloaded successfully: ${localPath}`);
            return localPath;
        } catch (err) {
            console.error(`[GaplessTiming] DB download error:`, err);
            await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
            return null;
        } finally {
            dbDownloadInProgress.delete(reciterId);
        }
    })();

    dbDownloadInProgress.set(reciterId, downloadPromise);
    return downloadPromise;
}

/**
 * Queries the timing DB for all verse offsets in a surah.
 *
 * Reference query from m3/f.java line 32:
 *   SELECT sura, ayah, time FROM timings WHERE sura={surahNo} ORDER BY ayah ASC
 *
 * Returns a SurahTimings with verses sorted by ayah and a total duration marker.
 */
async function queryTimingsFromDb(
    dbPath: string,
    reciterId: string,
    surahNo: number,
): Promise<SurahTimings | null> {
    try {
        // Open the database using expo-sqlite
        // The DB file is in the document directory, so we use the relative path
        const dbName = `${safeName(reciterId)}_timings`;
        
        // Copy to a location expo-sqlite can open if needed
        const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
        const sqliteDbPath = `${sqliteDir}${dbName}.db`;
        
        // Ensure SQLite directory exists
        const sqliteDirInfo = await FileSystem.getInfoAsync(sqliteDir);
        if (!sqliteDirInfo.exists) {
            await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
        }
        
        // Copy the timing DB to SQLite directory if not already there or if source is newer
        const sourceInfo = await FileSystem.getInfoAsync(dbPath);
        const destInfo = await FileSystem.getInfoAsync(sqliteDbPath);
        
        if (!destInfo.exists || (sourceInfo.exists && (sourceInfo as any).modificationTime > (destInfo as any).modificationTime)) {
            await FileSystem.copyAsync({ from: dbPath, to: sqliteDbPath });
        }
        
        // Open the database
        const db = await SQLite.openDatabaseAsync(dbName);
        
        // Query timings — exact mirror of m3/f.java:
        //   db.query("timings", ["sura", "ayah", "time"], "sura=" + surahNo, null, null, null, "ayah ASC")
        const rows = await db.getAllAsync<{ sura: number; ayah: number; time: number }>(
            `SELECT sura, ayah, time FROM timings WHERE sura = ? ORDER BY ayah ASC`,
            [surahNo]
        );

        if (!rows || rows.length === 0) {
            console.warn(`[GaplessTiming] No timing data for surah ${surahNo} in ${reciterId}`);
            await db.closeAsync();
            return null;
        }

        const verses: VerseTiming[] = [];
        let totalDurationMs = 0;

        for (const row of rows) {
            if (row.ayah === 999) {
                // Special end-of-surah marker (reference app convention)
                totalDurationMs = row.time;
            } else {
                verses.push({
                    ayah: row.ayah,
                    timeMs: row.time,
                });
            }
        }

        await db.closeAsync();

        console.log(
            `[GaplessTiming] Loaded ${verses.length} verse timings for ${reciterId}:${surahNo}, ` +
            `duration=${totalDurationMs}ms`
        );

        return {
            surah: surahNo,
            verses,
            totalDurationMs,
        };
    } catch (err) {
        console.error(`[GaplessTiming] DB query error for ${reciterId}:${surahNo}:`, err);
        return null;
    }
}
