/**
 * quran-audio-api.ts
 *
 * Utility for fetching ayah audio URLs from quranapi.pages.dev.
 *
 * Endpoint: GET https://quranapi.pages.dev/api/{surahNo}/{ayahNo}.json
 *
 * Response shape (relevant part):
 * {
 *   "audio": {
 *     "1": { "reciter": "Mishary Rashid Al Afasy", "url": "...", "originalUrl": "..." },
 *     "4": { "reciter": "Yasser Al Dosari",        "url": "...", "originalUrl": "..." },
 *     ...
 *   }
 * }
 *
 * If the reciter has no apiId (legacy reciters), we fall back to constructing
 * the URL from baseUrl in the everyayah.com format.
 */

import { Reciter } from './audio-reciters';

// ── elmushaf.com base URL ─────────────────────────────────────────────────────
const ELMUSHAF_BASE = 'https://elmushaf.com';

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
 * Fetches the audio URL for a given ayah from quranapi.pages.dev.
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
    // Priority 1: elmushaf.com (if reciter has elmushafPath)
    if (reciter.elmushafPath) {
        return getElmushafAudioUrl(reciter.elmushafPath, reciter.audioType, surahNo, ayahNo);
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

// ── elmushaf.com URL builder ──────────────────────────────────────────────────

/**
 * Constructs a URL for elmushaf.com audio.
 *
 * From h3.java enum:
 *   - Gapless (type=1, _sura): {ELMUSHAF_BASE}{elmushafPath}{SSS}.mp3
 *     e.g. https://elmushaf.com/mushaf/audio/mishari_alafasy_sura/001.mp3
 *   - Ayah (type=2, _ayat):   {ELMUSHAF_BASE}{elmushafPath}{SSSAAA}.mp3
 *     e.g. https://elmushaf.com/mushaf/audio/efassy_ayat/001002.mp3
 *
 * From y3.n.b(int sura, int aya): generates the 6-digit filename.
 */
export function getElmushafAudioUrl(
    elmushafPath: string,
    audioType: 'gapless' | 'ayah',
    surahNo: number,
    ayahNo: number,
): string {
    const s = surahNo.toString().padStart(3, '0');

    if (audioType === 'gapless') {
        // Surah-level file: 001.mp3
        return `${ELMUSHAF_BASE}${elmushafPath}${s}.mp3`;
    } else {
        // Per-verse file: 001002.mp3 (mirrors y3.n.b())
        const a = ayahNo.toString().padStart(3, '0');
        return `${ELMUSHAF_BASE}${elmushafPath}${s}${a}.mp3`;
    }
}
