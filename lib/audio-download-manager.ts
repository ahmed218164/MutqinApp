/**
 * lib/audio-download-manager.ts
 *
 * Bulk Offline Download Manager
 *
 * Mirrors QuranDownloadService.java:
 *   - Downloads full Surah ZIP files from storage.elmushaf.com CDN
 *   - Unzips to {DocumentDirectory}/mushaf/{reciterId}/
 *   - Deletes ZIP after successful extraction
 *   - 3-retry logic with 15s back-off
 *   - Progress reporting via callbacks
 *   - Cancel support
 *
 * ZIP URL pattern: https://storage.elmushaf.com/sound_ayat/{reciterId}/{SSS}.zip
 */

import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { Reciter } from './audio-reciters';
import { MUSHAF_ROOT, safeName, ensureReciterDir } from './audio-cache';
import { downloadTimingDb, hasTimingDb } from './audio-timing-db';

const STORAGE_CDN = 'https://storage.elmushaf.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type DownloadStatus = 'idle' | 'downloading' | 'extracting' | 'done' | 'error' | 'cancelled';

export interface SurahDownloadState {
    surah: number;
    status: DownloadStatus;
    progress: number;   // 0-100
    error?: string;
}

export interface DownloadProgressCallback {
    (surah: number, status: DownloadStatus, progress: number): void;
}

// ── Active Cancellation Registry ──────────────────────────────────────────────
const cancellationFlags = new Map<string, boolean>();   // key = `${reciterId}:${surah}`
const activeDownloads = new Map<string, FileSystem.DownloadResumable>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function surahKey(reciterId: string, surah: number): string {
    return `${reciterId}:${surah}`;
}

function zipUrl(reciter: Reciter, surah: number): string {
    const s = surah.toString().padStart(3, '0');
    // Use the CDN subdirectory based on audio type
    const folder = reciter.audioType === 'gapless' ? 'sound_sura' : 'sound_ayat';
    return `${STORAGE_CDN}/${folder}/${reciter.id}/${s}.zip`;
}

function tempZipPath(reciterId: string, surah: number): string {
    return `${FileSystem.cacheDirectory}zip_${safeName(reciterId)}_${surah}.zip`;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
}

// ── Core Download Logic ───────────────────────────────────────────────────────

/**
 * downloadSurahPack
 *
 * Downloads a full surah ZIP and extracts all ayah MP3s.
 * Mirrors QuranDownloadService.a() — download → unzip → delete ZIP.
 *
 * @param reciter    Target reciter (must have elmushafPath)
 * @param surah      Surah number 1-114
 * @param onProgress Progress callback (surah, status, pct)
 */
export async function downloadSurahPack(
    reciter: Reciter,
    surah: number,
    onProgress?: DownloadProgressCallback,
): Promise<void> {
    if (!reciter.elmushafPath) {
        throw new Error(`Reciter ${reciter.id} has no elmushafPath`);
    }

    const key = surahKey(reciter.id, surah);
    cancellationFlags.set(key, false);

    const destDir = await ensureReciterDir(reciter.id);
    const zipPath = tempZipPath(reciter.id, surah);
    const url = zipUrl(reciter, surah);

    // ── 3-Retry loop (mirrors QuranDownloadService while i13 < 3) ─────────────
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (cancellationFlags.get(key)) {
            onProgress?.(surah, 'cancelled', 0);
            cancellationFlags.delete(key);
            return;
        }

        if (attempt > 0) {
            onProgress?.(surah, 'downloading', 0);
            await sleep(RETRY_DELAY_MS);
        }

        // ── Download ZIP ──────────────────────────────────────────────────────
        try {
            onProgress?.(surah, 'downloading', 0);

            const dl = FileSystem.createDownloadResumable(
                url,
                zipPath,
                {},
                (prog) => {
                    if (cancellationFlags.get(key)) return;
                    if (prog.totalBytesExpectedToWrite > 0) {
                        const pct = Math.round(
                            (prog.totalBytesWritten / prog.totalBytesExpectedToWrite) * 100
                        );
                        onProgress?.(surah, 'downloading', pct);
                    }
                }
            );

            activeDownloads.set(key, dl);
            const result = await dl.downloadAsync();
            activeDownloads.delete(key);

            if (cancellationFlags.get(key)) {
                await FileSystem.deleteAsync(zipPath, { idempotent: true });
                onProgress?.(surah, 'cancelled', 0);
                cancellationFlags.delete(key);
                return;
            }

            if (!result || result.status !== 200) {
                throw new Error(`HTTP ${result?.status ?? 'unknown'}`);
            }

            // ── Extract ZIP → destDir ─────────────────────────────────────────
            // Mirrors QuranDownloadService: ZipFile → iterate entries → write files
            onProgress?.(surah, 'extracting', 0);
            await unzip(zipPath, destDir);

            // ── Cleanup ZIP (mirrors file.delete()) ───────────────────────────
            await FileSystem.deleteAsync(zipPath, { idempotent: true });

            onProgress?.(surah, 'done', 100);
            cancellationFlags.delete(key);
            return; // ✅ success

        } catch (err: any) {
            await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(() => {});
            activeDownloads.delete(key);

            if (cancellationFlags.get(key)) {
                onProgress?.(surah, 'cancelled', 0);
                cancellationFlags.delete(key);
                return;
            }

            const isLastAttempt = attempt === MAX_RETRIES - 1;
            if (isLastAttempt) {
                onProgress?.(surah, 'error', 0);
                throw new Error(`Failed after ${MAX_RETRIES} attempts: ${err?.message}`);
            }
            // else retry
        }
    }
}

/**
 * downloadAllSurahs
 *
 * Convenience method: download all 114 surahs for a reciter sequentially.
 * Also downloads the timing DB if this is a gapless reciter.
 */
export async function downloadAllSurahs(
    reciter: Reciter,
    onProgress?: DownloadProgressCallback,
    onSurahComplete?: (surah: number, total: number) => void,
): Promise<void> {
    // Download timing DB first for gapless reciters
    if (reciter.audioType === 'gapless') {
        const hasDb = await hasTimingDb(reciter);
        if (!hasDb && reciter.elmushafPath) {
            try {
                await downloadTimingDb(reciter);
            } catch {
                // Non-fatal — continue without timing DB
            }
        }
    }

    // Download each surah sequentially to avoid overwhelming the connection
    for (let surah = 1; surah <= 114; surah++) {
        const anyCancel = cancellationFlags.get(`${reciter.id}:ALL`);
        if (anyCancel) break;

        try {
            await downloadSurahPack(reciter, surah, onProgress);
            onSurahComplete?.(surah, 114);
        } catch {
            // Continue with next surah even if one fails
        }
    }
    cancellationFlags.delete(`${reciter.id}:ALL`);
}

/**
 * cancelSurahDownload — cancel a specific surah download
 */
export function cancelSurahDownload(reciterId: string, surah: number): void {
    const key = surahKey(reciterId, surah);
    cancellationFlags.set(key, true);

    const dl = activeDownloads.get(key);
    if (dl) {
        dl.pauseAsync().catch(() => {});
        activeDownloads.delete(key);
    }
}

/**
 * cancelAllDownloads — cancel all active downloads for a reciter
 */
export function cancelAllDownloads(reciterId: string): void {
    cancellationFlags.set(`${reciterId}:ALL`, true);

    for (const [key, dl] of activeDownloads) {
        if (key.startsWith(reciterId)) {
            cancellationFlags.set(key, true);
            dl.pauseAsync().catch(() => {});
        }
    }
}

/**
 * getSurahStatus — check current download status of a surah
 */
export async function getSurahStatus(
    reciter: Reciter,
    surah: number,
    totalAyahsInSurah: number,
): Promise<DownloadStatus> {
    const key = surahKey(reciter.id, surah);

    if (activeDownloads.has(key)) return 'downloading';

    // Check if surah file exists (gapless) or all ayahs exist (ayah-by-ayah)
    if (reciter.audioType === 'gapless') {
        const { surahLocalPath } = await import('./audio-cache');
        const info = await FileSystem.getInfoAsync(surahLocalPath(reciter.id, surah));
        return info.exists ? 'done' : 'idle';
    } else {
        const { isSurahFullyCached } = await import('./audio-cache');
        const cached = await isSurahFullyCached(reciter.id, surah, totalAyahsInSurah);
        return cached ? 'done' : 'idle';
    }
}
