/**
 * lib/muaalem-api.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Muaalem Recitation Assessment API
 *
 * Replaces Gemini-based recitation evaluation with a dedicated
 * Tajweed-trained ASR model hosted on Hugging Face Spaces.
 *
 * Endpoint: POST /correct-recitation
 *   - Accepts: multipart/form-data { file: audio, uthmani_text: string }
 *   - Returns: { score, mistakes[], sifat[], ... }
 *
 * This module converts the Muaalem response format into the standard
 * MuaalemAssessment interface used throughout MutqinApp.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as FileSystem from 'expo-file-system';
import { getInfoAsync } from 'expo-file-system/legacy';

const MUAALEM_API_URL = 'https://dr364873-tajweed-base.hf.space/correct-recitation';
const MUAALEM_BASE_URL = 'https://dr364873-tajweed-base.hf.space';

// ─── Request timeout (ms) ────────────────────────────────────────────────────
// Cold start on HF Spaces downloads a 2.42GB model → can take 3-4 min.
// After warm-up, inference for 6 ayahs takes ~20s.
// Set to 5 minutes to cover cold-start + inference.
const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes

// ─── Public types ────────────────────────────────────────────────────────────

export interface MuaalemMistake {
    word: string;
    expected: string;
    description: string;
    category: 'تجويد' | 'نطق' | 'مد' | 'وقف' | 'حذف';
    severity: 'minor' | 'moderate' | 'major' | 'critical';
}

export interface MuaalemAssessment {
    score: number;
    mistakes: MuaalemMistake[];
    error?: string;
}

// ─── Warm-up helper ──────────────────────────────────────────────────────────
// Call this when the recitation screen MOUNTS (before the user starts recording)
// to wake the HF Space from sleep. Cold boot takes ~3 min — this buys time.

let _warmUpSent = false;

/**
 * Fire-and-forget HEAD request to wake the HF Space.
 * Safe to call multiple times — only fires once per app session.
 */
export function wakeUpMuaalemSpace(signal?: AbortSignal): void {
    if (_warmUpSent) return;
    _warmUpSent = true;
    console.log('[Muaalem API] Sending warm-up ping to HF Space...');
    fetch(MUAALEM_BASE_URL, { method: 'HEAD', signal })
        .then(() => console.log('[Muaalem API] Warm-up ping OK'))
        .catch((e) => {
            if (e?.name !== 'AbortError') {
                console.log('[Muaalem API] Warm-up ping failed (Space may be starting)');
            }
        });
}

// ─── Main API call ───────────────────────────────────────────────────────────

export interface AyahRange {
    surah: number;
    ayahFrom: number;
    ayahTo: number;
}

/**
 * Send an audio recording to the Muaalem Tajweed API for evaluation.
 *
 * @param audioUri  Local file URI (e.g. from expo-av Recording.getURI())
 * @param uthmaniText  The Uthmani reference text (fallback if ayahRange not provided)
 * @param ayahRange  Surah + ayah range — backend uses Aya class for canonical text
 * @returns MuaalemAssessment with score + detailed mistakes
 */
export async function checkRecitationWithMuaalem(
    audioUri: string,
    uthmaniText: string,
    ayahRange?: AyahRange,
): Promise<MuaalemAssessment> {
    try {
        // Validate file exists before uploading
        const fileInfo = await getInfoAsync(audioUri);
        if (!fileInfo.exists) {
            return { score: 0, mistakes: [], error: 'ملف التسجيل غير موجود.' };
        }

        // Guard against near-silent / empty recordings from VAD
        // Anything under 10 KB is almost certainly too short to be a real recitation
        const MIN_AUDIO_BYTES = 10_240; // 10 KB
        const fileSize = (fileInfo as any).size ?? 0;
        if (fileSize < MIN_AUDIO_BYTES) {
            console.warn(
                `[Muaalem API] Audio file too small (${fileSize} bytes < ${MIN_AUDIO_BYTES} bytes). ` +
                `Likely a silent chunk — skipping upload.`
            );
            return {
                score: 0,
                mistakes: [],
                error: 'التسجيل قصير جداً أو صامت. يرجى التحدث بوضوح وإعادة المحاولة.',
            };
        }

        const formData = new FormData();
        const filename = audioUri.split('/').pop() || 'recitation.m4a';
        const ext = filename.split('.').pop()?.toLowerCase() ?? 'm4a';
        const mimeType = ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/webm';
        formData.append('file', {
            uri: audioUri,
            name: filename,
            type: mimeType,
        } as any);
        formData.append('uthmani_text', uthmaniText);

        // If ayah range is provided, send it so the backend can use the Aya class
        // for canonical text lookup (bypasses SQLite encoding differences).
        if (ayahRange) {
            formData.append('surah', String(ayahRange.surah));
            formData.append('ayah_from', String(ayahRange.ayahFrom));
            formData.append('ayah_to', String(ayahRange.ayahTo));
        }

        // ── Debug: log what we are about to send ─────────────────────────────
        console.log('[Muaalem API] Sending payload:', {
            audioUri,
            filename,
            mimeType,
            fileSizeBytes: fileSize,
            uthmaniTextLength: uthmaniText.length,
            uthmaniTextPreview: uthmaniText.slice(0, 80),
            ayahRange: ayahRange ?? 'not provided',
            endpoint: MUAALEM_API_URL,
        });

        // Race between fetch and a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(MUAALEM_API_URL, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: formData,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            console.error(`[Muaalem API] HTTP ${response.status}: ${body}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return mapMuaalemResponseToMutqin(data);
    } catch (error: any) {
        console.error('[Muaalem API] Error:', error);

        // User-friendly error mapping
        let errorMessage = 'حدث خطأ أثناء الاتصال بالخادم.';
        if (error.name === 'AbortError' || error.message?.includes('abort')) {
            errorMessage = 'انتهت مهلة الاتصال بالخادم. الخادم قد يكون في مرحلة التشغيل. يرجى الانتظار دقيقة والمحاولة مرة أخرى.';
        } else if (error.message?.includes('network') || error.message?.includes('Network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
        }

        return { score: 0, mistakes: [], error: errorMessage };
    }
}

// ─── Human-readable Arabic labels for tajweed properties ─────────────────────

const PROPERTY_LABELS: Record<string, string> = {
    hams_or_jahr:       'الهمس والجهر',
    shidda_or_rakhawa:  'الشدة والرخاوة',
    tafkheem_or_taqeeq: 'التفخيم والترقيق',
    itbaq:              'الإطباق والانفتاح',
    safeer:             'الصفير',
    qalqla:             'القلقلة',
    tikraar:            'التكرار',
    tafashie:           'التفشي',
    istitala:           'الاستطالة',
    ghonna:             'الغنة',
};

// ─── Response mapper ─────────────────────────────────────────────────────────

/**
 * Convert the raw Muaalem API response into a MuaalemAssessment.
 *
 * The backend now returns (comparison-based scoring):
 *   - `score`:               Integer 0–100
 *   - `total_sifat`:         Total sifa objects (one per phoneme group)
 *   - `total_rules_checked`: Total tajweed rule comparisons made
 *   - `total_mismatches`:    Rules where predicted ≠ reference
 *   - `mistakes`:            Array of {ayah, phoneme, rule, expected, actual, confidence}
 *
 * Each mistake means the model detected a DIFFERENT tajweed property value
 * in the audio compared to the expected reference recitation.
 */
function mapMuaalemResponseToMutqin(data: any): MuaalemAssessment {
    const mistakes: MuaalemMistake[] = [];

    // ── Step 1: Use backend pre-computed score ────────────────────────────
    let score: number;
    if (typeof data.score === 'number' && data.score >= 0 && data.score <= 100) {
        score = data.score;
        console.log(
            `[Muaalem] Backend score: ${score}% ` +
            `(${data.total_mismatches ?? '?'}/${data.total_rules_checked ?? '?'} rules mismatched)`
        );
    } else {
        score = 100; // fallback if backend didn't return score
    }

    // ── Step 2: Map backend mistakes to MuaalemMistake format ─────────────
    // Backend mistake shape: {ayah, phoneme, rule, expected, actual, confidence}
    if (data.mistakes && Array.isArray(data.mistakes)) {
        for (const m of data.mistakes) {
            const phoneme = m.phoneme || '';
            const rule = m.rule || '';
            const expected = m.expected || '';
            const actual = m.actual || '';
            const confidence = m.confidence ?? null;
            const ayah = m.ayah || '';

            // Map rule name to Arabic label
            const arabicRule = PROPERTY_LABELS[rule] || rule;

            // Severity: high confidence on a WRONG prediction = critical mistake.
            // Low confidence on a wrong prediction = the model is unsure, minor.
            let severity: MuaalemMistake['severity'] = 'moderate';
            if (confidence !== null) {
                if (confidence >= 0.8)      severity = 'critical'; // model is very sure it's different
                else if (confidence >= 0.6) severity = 'major';
                else if (confidence >= 0.4) severity = 'moderate';
                else                        severity = 'minor';   // model unsure, might be borderline
            }

            // Category mapping based on rule type
            let category: MuaalemMistake['category'] = 'تجويد';
            if (['qalqla', 'ghonna', 'tafashie', 'istitala'].includes(rule)) {
                category = 'نطق';
            }

            const description =
                `خطأ في ${arabicRule} عند "${phoneme}" (${ayah}): ` +
                `المتوقع "${expected}" لكن تم نطق "${actual}".`;

            mistakes.push({
                word:     phoneme || 'حرف',
                expected: `${arabicRule}: ${expected}`,
                description,
                category,
                severity,
            });
        }
    }

    // ── Step 3: If score < 100 but no specific mistakes were mapped ────────
    if (score < 100 && mistakes.length === 0) {
        const mismatches = data.total_mismatches ?? 0;
        if (mismatches > 0) {
            mistakes.push({
                word: '—',
                expected: 'قواعد التجويد',
                description: `تم اكتشاف ${mismatches} خطأ في قواعد التجويد عند مقارنة التلاوة بالمرجع.`,
                category: 'تجويد',
                severity: score < 70 ? 'major' : score < 90 ? 'moderate' : 'minor',
            });
        }
    }

    return { score, mistakes };
}

