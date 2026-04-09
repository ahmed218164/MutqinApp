/**
 * quran-audio-api.ts
 *
 * Audio URL resolution with DIRECT CDN access.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  CRITICAL: elmushaf.com/mushaf/audio/* returns 404 HTML pages.      │
 * │  The reference app relies on a 301 redirect to a hidden CDN.       │
 * │  We bypass the redirect and hit the CDN directly:                  │
 * │                                                                    │
 * │  Ayah-by-Ayah (Type 2):                                           │
 * │    https://storage.elmushaf.com/sound_ayat/{reciter_id}/{SSS}{AAA}.mp3    │
 * │                                                                    │
 * │  Gapless Surah (Type 1):                                          │
 * │    https://storage.elmushaf.com/sound_sura/{reciter_id}/{SSS}.mp3  │
 * │                                                                    │
 * │  Timing DB (for gapless verse tracking):                           │
 * │    https://storage.elmushaf.com/sound_sura/{reciter_id}/{reciter_id}.db  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Fallback chain:
 *   1. storage.elmushaf.com (CDN direct — 80+ reciters)
 *   2. quranapi.pages.dev   (5 reciters, JSON API)
 *   3. cdn.islamic.network  (legacy baseUrl pattern)
 */

import { Reciter } from './audio-reciters';

// ── CDN base URL (direct storage, no redirect) ──────────────────────────────
const STORAGE_CDN = 'https://storage.elmushaf.com';

interface QuranApiAudioEntry {
    reciter: string;
    url: string;
    originalUrl: string;
}

interface QuranApiResponse {
    surahNo: number;
    ayahNo: number;
    audio: Record<string, QuranApiAudioEntry>;
}

// Simple in-memory cache so we don't re-fetch the same ayah while pre-buffering
const responseCache = new Map<string, QuranApiResponse>();

/**
 * Fetches the audio URL for a given ayah.
 *
 * @param surahNo - Surah number (1–114)
 * @param ayahNo  - Ayah number within the surah
 * @param reciter - The selected Reciter object
 * @returns The audio URL string, or null if unavailable
 */
export async function getAyahAudioUrl(
    surahNo: number,
    ayahNo: number,
    reciter: Reciter
): Promise<string | null> {
    // Priority 1: storage.elmushaf.com CDN (if reciter has elmushafPath)
    if (reciter.elmushafPath) {
        return getStorageCdnUrl(reciter.id, reciter.audioType, surahNo, ayahNo);
    }

    // Priority 2: quranapi.pages.dev (if reciter has apiId)
    if (reciter.apiId !== undefined) {
        const cacheKey = `${surahNo}:${ayahNo}`;

        try {
            let data = responseCache.get(cacheKey);

            if (!data) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await fetch(
                        `https://quranapi.pages.dev/api/${surahNo}/${ayahNo}.json`,
                        { 
                            signal: controller.signal,
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'MutqinApp/1.0.0 (Mobile)',
                            }
                        }
                    );
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    data = (await response.json()) as QuranApiResponse;
                    responseCache.set(cacheKey, data);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    throw fetchError;
                }
            }

            const audioEntry = data.audio[String(reciter.apiId)];
            if (audioEntry?.url) {
                return audioEntry.url;
            }
        } catch (error) {
            console.warn(`[quran-audio-api] quranapi.pages.dev failed:`, error);
        }
    }

    // Priority 3: Legacy fallback (cdn.islamic.network baseUrl)
    if (reciter.baseUrl) {
        return getLegacyAudioUrl(surahNo, ayahNo, reciter.baseUrl);
    }

    return null;
}

/**
 * Get the URL for a full surah file (gapless).
 * Used by the gapless engine to stream/download the single surah MP3.
 */
export function getGaplessSurahUrl(reciterId: string): string | null;
export function getGaplessSurahUrl(reciterId: string, surahNo: number): string;
export function getGaplessSurahUrl(reciterId: string, surahNo?: number): string | null {
    if (surahNo === undefined) return null;
    const s = surahNo.toString().padStart(3, '0');
    return `${STORAGE_CDN}/sound_sura/${reciterId}/${s}.mp3`;
}

/**
 * Get the URL for the timing database of a gapless reciter.
 * The DB is a SQLite file with table `timings(sura, ayah, time)`.
 */
export function getTimingDbUrl(reciterId: string): string {
    return `${STORAGE_CDN}/sound_sura/${reciterId}/${reciterId}.db`;
}

/**
 * Pre-warms the cache for a given ayah without returning the result.
 * Call this speculatively while the current ayah is playing.
 */
export async function prefetchAyahAudio(surahNo: number, ayahNo: number): Promise<void> {
    const cacheKey = `${surahNo}:${ayahNo}`;
    if (responseCache.has(cacheKey)) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(
                `https://quranapi.pages.dev/api/${surahNo}/${ayahNo}.json`,
                { 
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'MutqinApp/1.0.0 (Mobile)',
                    }
                }
            );
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = (await response.json()) as QuranApiResponse;
                responseCache.set(cacheKey, data);
            }
        } catch {
            clearTimeout(timeoutId);
        }
    } catch {
        // Silently ignore prefetch failures
    }
}

/**
 * Clears the response cache. Call when the surah changes.
 */
export function clearAyahAudioCache(): void {
    responseCache.clear();
}

// ── storage.elmushaf.com CDN URL builder ─────────────────────────────────────

/**
 * Constructs a DIRECT CDN URL for storage.elmushaf.com.
 *
 * From reverse-engineering the reference app's redirect chain:
 *   - Ayah (type=2, _ayat):   {CDN}/sound_ayat/{reciter_id}/{SSSAAA}.mp3
 *   - Gapless (type=1, _sura): {CDN}/sound_sura/{reciter_id}/{SSS}.mp3
 *
 * @param reciterId  The reciter enum name (e.g. "efassy_ayat", "mishari_alafasy_sura")
 * @param audioType  'gapless' or 'ayah'
 * @param surahNo    Surah number 1-114
 * @param ayahNo     Ayah number (only used for ayah-by-ayah)
 */
export function getStorageCdnUrl(
    reciterId: string,
    audioType: 'gapless' | 'ayah',
    surahNo: number,
    ayahNo: number,
): string {
    const s = surahNo.toString().padStart(3, '0');

    if (audioType === 'gapless') {
        // Surah-level file: sound_sura/{reciter_id}/001.mp3
        return `${STORAGE_CDN}/sound_sura/${reciterId}/${s}.mp3`;
    } else {
        // Per-verse file: sound_ayat/{reciter_id}/001002.mp3
        const a = ayahNo.toString().padStart(3, '0');
        return `${STORAGE_CDN}/sound_ayat/${reciterId}/${s}${a}.mp3`;
    }
}

// ── Legacy fallback ────────────────────────────────────────────────────────────

/**
 * Constructs a URL using the everyayah.com / cdn.islamic.network baseUrl pattern.
 * Format: {baseUrl}/SSSVVV.mp3  (e.g. 001002.mp3)
 */
function getLegacyAudioUrl(surahNo: number, ayahNo: number, baseUrl: string): string {
    const s = surahNo.toString().padStart(3, '0');
    const v = ayahNo.toString().padStart(3, '0');
    return `${baseUrl}/${s}${v}.mp3`;
}
