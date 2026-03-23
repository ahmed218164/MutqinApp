/**
 * lib/tafsir-engine.ts
 *
 * Multi-Source Tafsir Engine
 *
 * Architecture (mirrors q4/z0.java Tafsir Controller / TafsirDownloadActivity):
 *   - Each Tafsir is a separate SQLite .db file (not bundled in app)
 *   - Files are downloaded on-demand to {DocumentDirectory}/tafsir/
 *   - The active Tafsir source can be switched at runtime
 *   - Page sync: load all ayahs for the current Mushaf page at once
 *
 * DB Schema (each .db file):
 *   CREATE TABLE tafsir (
 *     surah    INTEGER NOT NULL,
 *     ayah     INTEGER NOT NULL,
 *     text     TEXT NOT NULL,
 *     PRIMARY KEY (surah, ayah)
 *   );
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TAFSIR_ROOT = `${FileSystem.documentDirectory}tafsir/`;

// ── Tafsir Source Registry ────────────────────────────────────────────────────

export interface TafsirSource {
    id: string;
    nameAr: string;
    nameEn: string;
    filename: string;
    /** Download URL — replace with actual CDN once confirmed */
    url: string;
    /** Approx. size in MB for display */
    sizeMb: number;
}

export const TAFSIR_SOURCES: TafsirSource[] = [
    {
        id: 'muyassar',
        nameAr: 'التفسير الميسر',
        nameEn: 'Al-Muyassar',
        filename: 'tafsir_muyassar.db',
        url: 'https://raw.githubusercontent.com/islamic-network/cdn/master/info/tafsirs/muyassar.db',
        sizeMb: 2.1,
    },
    {
        id: 'jalalayn',
        nameAr: 'تفسير الجلالين',
        nameEn: 'Jalalayn',
        filename: 'tafsir_jalalayn.db',
        url: 'https://raw.githubusercontent.com/islamic-network/cdn/master/info/tafsirs/jalalayn.db',
        sizeMb: 3.4,
    },
    {
        id: 'tabari',
        nameAr: 'تفسير الطبري المختصر',
        nameEn: 'Al-Tabari (Abr.)',
        filename: 'tafsir_tabari.db',
        url: 'https://raw.githubusercontent.com/islamic-network/cdn/master/info/tafsirs/tabari.db',
        sizeMb: 8.2,
    },
    {
        id: 'saadi',
        nameAr: 'تفسير السعدي',
        nameEn: 'Al-Saadi',
        filename: 'tafsir_saadi.db',
        url: 'https://raw.githubusercontent.com/islamic-network/cdn/master/info/tafsirs/saadi.db',
        sizeMb: 4.6,
    },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TafsirEntry {
    surah: number;
    ayah: number;
    text: string;
    sourceId: string;
}

// ── Open DB Registry ──────────────────────────────────────────────────────────

const openDbs = new Map<string, SQLite.SQLiteDatabase>();

async function getDb(sourceId: string): Promise<SQLite.SQLiteDatabase | null> {
    const existing = openDbs.get(sourceId);
    if (existing) return existing;

    const source = TAFSIR_SOURCES.find(s => s.id === sourceId);
    if (!source) return null;

    const path = `${TAFSIR_ROOT}${source.filename}`;
    try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) return null;
        const db = await SQLite.openDatabaseAsync(path);
        openDbs.set(sourceId, db);
        return db;
    } catch {
        return null;
    }
}

// ── Existence Check ───────────────────────────────────────────────────────────

/**
 * hasTafsirDb — check if a tafsir .db file has been downloaded
 */
export async function hasTafsirDb(sourceId: string): Promise<boolean> {
    const source = TAFSIR_SOURCES.find(s => s.id === sourceId);
    if (!source) return false;
    try {
        const info = await FileSystem.getInfoAsync(`${TAFSIR_ROOT}${source.filename}`);
        return info.exists && (info as any).size > 1024;
    } catch {
        return false;
    }
}

/**
 * checkAllSources — returns download status for all 4 sources
 */
export async function checkAllSources(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(
        TAFSIR_SOURCES.map(async s => {
            results[s.id] = await hasTafsirDb(s.id);
        })
    );
    return results;
}

// ── Download ──────────────────────────────────────────────────────────────────

const activeDownloads = new Map<string, FileSystem.DownloadResumable>();
const cancelFlags = new Map<string, boolean>();

/**
 * downloadTafsirDb — download a tafsir SQLite DB file
 */
export async function downloadTafsirDb(
    sourceId: string,
    onProgress?: (pct: number) => void,
): Promise<void> {
    const source = TAFSIR_SOURCES.find(s => s.id === sourceId);
    if (!source) throw new Error(`Unknown tafsir source: ${sourceId}`);

    cancelFlags.set(sourceId, false);

    // Ensure tafsir dir exists
    const dirInfo = await FileSystem.getInfoAsync(TAFSIR_ROOT);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TAFSIR_ROOT, { intermediates: true });
    }

    const destPath = `${TAFSIR_ROOT}${source.filename}`;

    const dl = FileSystem.createDownloadResumable(
        source.url,
        destPath,
        {},
        (progress) => {
            if (cancelFlags.get(sourceId)) return;
            if (progress.totalBytesExpectedToWrite > 0) {
                onProgress?.(Math.round(
                    (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100
                ));
            }
        }
    );

    activeDownloads.set(sourceId, dl);

    try {
        const result = await dl.downloadAsync();
        activeDownloads.delete(sourceId);

        if (cancelFlags.get(sourceId)) {
            await FileSystem.deleteAsync(destPath, { idempotent: true });
            cancelFlags.delete(sourceId);
            return;
        }
        if (!result || result.status !== 200) {
            await FileSystem.deleteAsync(destPath, { idempotent: true });
            throw new Error(`HTTP ${result?.status ?? 'unknown'}`);
        }
    } catch (err) {
        activeDownloads.delete(sourceId);
        await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
        throw err;
    }
}

/**
 * cancelTafsirDownload
 */
export function cancelTafsirDownload(sourceId: string): void {
    cancelFlags.set(sourceId, true);
    activeDownloads.get(sourceId)?.pauseAsync().catch(() => {});
}

/**
 * deleteTafsirDb — remove a downloaded tafsir DB
 */
export async function deleteTafsirDb(sourceId: string): Promise<void> {
    const source = TAFSIR_SOURCES.find(s => s.id === sourceId);
    if (!source) return;
    const db = openDbs.get(sourceId);
    if (db) { await db.closeAsync().catch(() => {}); openDbs.delete(sourceId); }
    await FileSystem.deleteAsync(`${TAFSIR_ROOT}${source.filename}`, { idempotent: true });
}

// ── Fetch Functions ───────────────────────────────────────────────────────────

/**
 * getAyahTafsir
 *
 * Fetch tafsir text for a single ayah from the active source DB.
 * Returns null if DB not downloaded or ayah not found.
 */
export async function getAyahTafsir(
    sourceId: string,
    surah: number,
    ayah: number,
): Promise<TafsirEntry | null> {
    const db = await getDb(sourceId);
    if (!db) return null;

    try {
        const row = await db.getFirstAsync<{ text: string }>(
            'SELECT text FROM tafsir WHERE surah = ? AND ayah = ?',
            [surah, ayah]
        );
        if (!row) return null;
        return { surah, ayah, text: row.text, sourceId };
    } catch {
        return null;
    }
}

/**
 * getPageTafsir
 *
 * Fetch tafsir for all ayahs on a given Mushaf page.
 * Mirrors q4/f1.java (Tafsir Adapter — fetches multiple ayahs at once).
 *
 * @param sourceId  Active tafsir source ID
 * @param ayahList  Array of {surah, ayah} for all ayahs on the page
 */
export async function getPageTafsir(
    sourceId: string,
    ayahList: { surah: number; ayah: number }[],
): Promise<TafsirEntry[]> {
    if (!ayahList.length) return [];

    const db = await getDb(sourceId);
    if (!db) return [];

    // Build a single query for all ayahs (better than N separate queries)
    const placeholders = ayahList.map(() => '(?,?)').join(',');
    const params = ayahList.flatMap(a => [a.surah, a.ayah]);

    try {
        const rows = await db.getAllAsync<{ surah: number; ayah: number; text: string }>(
            `SELECT surah, ayah, text FROM tafsir
             WHERE (surah, ayah) IN (${placeholders})
             ORDER BY surah ASC, ayah ASC`,
            params
        );
        return rows.map(r => ({ ...r, sourceId }));
    } catch {
        // Fallback for SQLite versions that don't support tuple IN
        const results: TafsirEntry[] = [];
        for (const { surah, ayah } of ayahList) {
            const entry = await getAyahTafsir(sourceId, surah, ayah);
            if (entry) results.push(entry);
        }
        return results;
    }
}

// ── Global Active Source State ────────────────────────────────────────────────

let _activeSourceId = 'muyassar';

export function getActiveTafsirSourceId(): string { return _activeSourceId; }
export function setActiveTafsirSourceId(id: string): void { _activeSourceId = id; }
export function getActiveTafsirSource(): TafsirSource {
    return TAFSIR_SOURCES.find(s => s.id === _activeSourceId) ?? TAFSIR_SOURCES[0];
}
