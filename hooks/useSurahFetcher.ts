/**
 * hooks/useSurahFetcher.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Encapsulates all SQLite-based surah fetching logic that was previously
 * inlined in recite.tsx.
 *
 * Responsibilities:
 *  - Query ayahs from the local bundled DB (useAyatDB)
 *  - Manage loading / error states
 *  - Return a stable `verses` array + metadata
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import { useAyatDB } from '../lib/SQLiteProvider';

// ── Public types ─────────────────────────────────────────────────────────────

export interface Ayah {
    number: number;
    text: string;
    numberInSurah: number;
    page: number;
    juz: number;
    manzil: number;
    ruku: number;
    hizbQuarter: number;
    sajda: boolean;
}

export interface SurahFetcherResult {
    verses: Ayah[];
    loadingVerses: boolean;
    error: string | null;
    /** Re-fetch (e.g. retry on error). */
    refetch: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSurahFetcher(surahNumber: number): SurahFetcherResult {
    const db = useAyatDB();

    const [verses, setVerses] = React.useState<Ayah[]>([]);
    const [loadingVerses, setLoadingVerses] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const fetchSurah = React.useCallback((number: number) => {
        setLoadingVerses(true);
        setError(null);
        try {
            // Query all ayahs of this surah from the bundled DB
            const rows = db.getAllSync<{
                id: number;
                sura: number;
                aya: number;
                goza: number;
                page: number;
                type: number;
                hizb: number | null;
                text: string | null;
            }>(
                'SELECT id, sura, aya, goza, page, type, hizb, text FROM Ayat WHERE sura = ? ORDER BY aya',
                [number]
            );

            if (rows.length === 0) {
                throw new Error(`لم يتم العثور على سورة ${number}`);
            }

            // Map DB rows → Ayah shape expected by the rest of the screen
            const ayahs: Ayah[] = rows.map(row => ({
                number:        row.id,
                numberInSurah: row.aya,
                text:          row.text ?? '',
                page:          row.page,
                juz:           row.goza,
                manzil:        0,
                ruku:          0,
                hizbQuarter:   row.hizb ?? 0,
                sajda:         false,
            }));

            setVerses(ayahs);
            console.log(`[useSurahFetcher] Loaded ${ayahs.length} ayahs for surah ${number} from local DB ✔️`);
        } catch (err) {
            console.error('Error fetching surah from DB:', err);
            setError('فشل تحميل الآيات من قاعدة البيانات المحلية.');
        } finally {
            setLoadingVerses(false);
        }
    }, [db]);

    // Fetch on mount + when surahNumber changes
    React.useEffect(() => {
        fetchSurah(surahNumber);
    }, [surahNumber, fetchSurah]);

    const refetch = React.useCallback(() => {
        fetchSurah(surahNumber);
    }, [surahNumber, fetchSurah]);

    return { verses, loadingVerses, error, refetch };
}
