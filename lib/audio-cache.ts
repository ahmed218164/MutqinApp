/**
 * lib/audio-cache.ts
 *
 * Offline Audio Storage — Local-First Architecture
 *
 * Storage path (matches native android structure from y3/n.java):
 *   {DocumentDirectory}/mushaf/{reciterId}/SSSAAA.mp3   (ayah files)
 *   {DocumentDirectory}/mushaf/{reciterId}/{reciterId}.db (timing DB)
 *
 * Priority order (mirrors QuranDownloadService approach):
 *   1. local file:// exists  → return immediately (works offline)
 *   2. cache miss            → return remote URL + start background download
 */

import * as FileSystem from 'expo-file-system/legacy';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Root of all offline Mushaf audio storage */
export const MUSHAF_ROOT = `${FileSystem.documentDirectory}mushaf/`;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function safeName(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Mirrors y3.n.b(surah, ayah):
 *   String.format("%03d", surah) + String.format("%03d", ayah) + ".mp3"
 */
export function ayahFilename(surah: number, ayah: number): string {
    return `${surah.toString().padStart(3, '0')}${ayah.toString().padStart(3, '0')}.mp3`;
}

/** Mirrors y3.n.b for gapless surah files: SSS.mp3 */
export function surahFilename(surah: number): string {
    return `${surah.toString().padStart(3, '0')}.mp3`;
}

/** Full local path for an ayah file */
export function ayahLocalPath(reciterId: string, surah: number, ayah: number): string {
    return `${MUSHAF_ROOT}${safeName(reciterId)}/${ayahFilename(surah, ayah)}`;
}

/** Full local path for a gapless surah file */
export function surahLocalPath(reciterId: string, surah: number): string {
    return `${MUSHAF_ROOT}${safeName(reciterId)}/${surahFilename(surah)}`;
}

/** Timing DB local path — mirrors y3.n.d(): {reciterPath}/{reciterName}.db */
export function timingDbLocalPath(reciterId: string): string {
    return `${MUSHAF_ROOT}${safeName(reciterId)}/${safeName(reciterId)}.db`;
}

/** Ensure the per-reciter storage directory exists */
export async function ensureReciterDir(reciterId: string): Promise<string> {
    const dir = `${MUSHAF_ROOT}${safeName(reciterId)}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
}

// ── In-flight download deduplication ─────────────────────────────────────────
const inProgress = new Map<string, Promise<string>>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * ensureAudioLocal
 *
 * The core local-first routing function — mirrors QuranDownloadService file check.
 *
 * Returns:
 *   - `file://…` path if already on disk  (instant, offline-safe)
 *   - `remoteUrl` otherwise, and starts a background download for next time
 *
 * @param reciterId  Reciter directory name (e.g. "efassy_ayat")
 * @param surah      Surah number 1-114
 * @param ayah       Ayah number within surah
 * @param remoteUrl  Remote URL to use as fallback and to download from
 */
export async function ensureAudioLocal(
    reciterId: string,
    surah: number,
    ayah: number,
    remoteUrl: string,
): Promise<string> {
    const localPath = ayahLocalPath(reciterId, surah, ayah);
    const key = `ayah:${reciterId}:${surah}:${ayah}`;

    // ── Step 1: Check local file first ───────────────────────────────────────
    try {
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && (info as any).size > 0) {
            return localPath;   // ✅ cache hit — serve from disk immediately
        }
    } catch {
        // Ignore unexpected FS errors — fall through to remote
    }

    // ── Step 2: Cache miss — serve remote, download in background ────────────
    if (!inProgress.has(key)) {
        const downloadPromise = (async () => {
            try {
                await ensureReciterDir(reciterId);
                const dl = FileSystem.createDownloadResumable(remoteUrl, localPath, {});
                const result = await dl.downloadAsync();
                if (!result || result.status !== 200) {
                    await FileSystem.deleteAsync(localPath, { idempotent: true });
                }
            } catch {
                await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
            } finally {
                inProgress.delete(key);
            }
            return localPath;
        })();
        inProgress.set(key, downloadPromise);
    }

    return remoteUrl; // Return remote immediately, don't block playback
}

/**
 * ensureGaplessSurahLocal
 *
 * Same as ensureAudioLocal but for gapless surah-level files (SSS.mp3).
 */
export async function ensureGaplessSurahLocal(
    reciterId: string,
    surah: number,
    remoteUrl: string,
): Promise<string> {
    const localPath = surahLocalPath(reciterId, surah);
    const key = `surah:${reciterId}:${surah}`;

    try {
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && (info as any).size > 0) {
            return localPath;
        }
    } catch {}

    if (!inProgress.has(key)) {
        const downloadPromise = (async () => {
            try {
                await ensureReciterDir(reciterId);
                const dl = FileSystem.createDownloadResumable(remoteUrl, localPath, {});
                const result = await dl.downloadAsync();
                if (!result || result.status !== 200) {
                    await FileSystem.deleteAsync(localPath, { idempotent: true });
                }
            } catch {
                await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
            } finally {
                inProgress.delete(key);
            }
            return localPath;
        })();
        inProgress.set(key, downloadPromise);
    }

    return remoteUrl;
}

/**
 * isAyahCached — synchronous-equivalent existence check
 */
export async function isAyahCached(reciterId: string, surah: number, ayah: number): Promise<boolean> {
    try {
        const info = await FileSystem.getInfoAsync(ayahLocalPath(reciterId, surah, ayah));
        return info.exists && (info as any).size > 0;
    } catch {
        return false;
    }
}

/**
 * isSurahFullyCached
 *
 * Returns true if ALL ayahs in the given surah are cached locally.
 * Uses the surah verse counts from constants.
 */
export async function isSurahFullyCached(
    reciterId: string,
    surah: number,
    totalAyahs: number,
): Promise<boolean> {
    const checks = await Promise.all(
        Array.from({ length: totalAyahs }, (_, i) => isAyahCached(reciterId, surah, i + 1))
    );
    return checks.every(Boolean);
}

/**
 * warmCacheAsync — fire-and-forget background speculative download
 */
export function warmCacheAsync(
    reciterId: string,
    surah: number,
    ayah: number,
    remoteUrl: string,
): void {
    ensureAudioLocal(reciterId, surah, ayah, remoteUrl).catch(() => {});
}

/**
 * clearAudioCache — wipe entire mushaf audio directory
 */
export async function clearAudioCache(): Promise<void> {
    try {
        await FileSystem.deleteAsync(MUSHAF_ROOT, { idempotent: true });
    } catch {}
}

/**
 * clearReciterCache — wipe a single reciter's audio directory
 */
export async function clearReciterCache(reciterId: string): Promise<void> {
    try {
        const dir = `${MUSHAF_ROOT}${safeName(reciterId)}/`;
        await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch {}
}

/**
 * getReciterCacheSize — directory size in bytes (best-effort)
 */
export async function getReciterCacheSize(reciterId: string): Promise<number> {
    try {
        const dir = `${MUSHAF_ROOT}${safeName(reciterId)}/`;
        const info = await FileSystem.getInfoAsync(dir);
        return (info as any).size ?? 0;
    } catch {
        return 0;
    }
}
