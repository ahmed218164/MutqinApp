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
 *   - Returns: { sifat: [...], ... }
 *
 * This module converts the Muaalem response format into the standard
 * MuaalemAssessment interface used throughout MutqinApp.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as FileSystem from 'expo-file-system';

const MUAALEM_API_URL = 'https://dr364873-tajweed-base.hf.space/correct-recitation';

// ─── Request timeout (ms) ────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 45_000; // 45 seconds — HF Spaces cold-start can be slow

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

// ─── Main API call ───────────────────────────────────────────────────────────

/**
 * Send an audio recording to the Muaalem Tajweed API for evaluation.
 *
 * @param audioUri  Local file URI (e.g. from expo-av Recording.getURI())
 * @param uthmaniText  The Uthmani reference text the student should have recited
 * @returns MuaalemAssessment with score + detailed mistakes
 */
export async function checkRecitationWithMuaalem(
    audioUri: string,
    uthmaniText: string,
): Promise<MuaalemAssessment> {
    try {
        // Validate file exists before uploading
        const fileInfo = await FileSystem.getInfoAsync(audioUri);
        if (!fileInfo.exists) {
            return { score: 0, mistakes: [], error: 'ملف التسجيل غير موجود.' };
        }

        const formData = new FormData();
        const filename = audioUri.split('/').pop() || 'recitation.wav';
        formData.append('file', {
            uri: audioUri,
            name: filename,
            type: 'audio/wav',
        } as any);
        formData.append('uthmani_text', uthmaniText);

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
            errorMessage = 'انتهت مهلة الاتصال بالخادم. يرجى المحاولة مرة أخرى.';
        } else if (error.message?.includes('network') || error.message?.includes('Network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
        }

        return { score: 0, mistakes: [], error: errorMessage };
    }
}

// ─── Response mapper ─────────────────────────────────────────────────────────

/**
 * Convert the raw Muaalem API response into a MuaalemAssessment.
 *
 * The API returns an object with a `sifat` array. Each sifa represents a
 * Tajweed rule instance with `is_correct`, `name`, `golden_len`, `predicted_len`, etc.
 *
 * Penalty points:
 *   - major  (diff > 1 count): 10 points
 *   - moderate (diff == 1):     5 points
 *   - critical (0 diff but wrong):  8 points
 */
function mapMuaalemResponseToMutqin(data: any): MuaalemAssessment {
    const mistakes: MuaalemMistake[] = [];
    let penaltyPoints = 0;

    if (data.sifat && Array.isArray(data.sifat)) {
        for (const sifa of data.sifat) {
            const isCorrect = sifa.is_correct ?? true;
            if (isCorrect) continue;

            const ruleName: string = sifa.name || 'حكم تجويدي';
            const expectedLen: number = sifa.golden_len || 0;
            const actualLen: number = sifa.predicted_len || 0;
            const diff = Math.abs(expectedLen - actualLen);

            // Determine severity from the magnitude of the length difference
            let severity: MuaalemMistake['severity'] = 'moderate';
            if (diff > 1) severity = 'major';
            else if (diff === 0) severity = 'critical'; // wrong rule application, not a length issue

            // Determine category
            let category: MuaalemMistake['category'] = 'تجويد';
            if (diff > 0) category = 'مد';

            // Build human-readable description
            const description =
                diff > 0
                    ? `خطأ في مقدار ${ruleName}. نطقت ${actualLen} حركات والصحيح ${expectedLen}.`
                    : `خطأ في تطبيق ${ruleName}`;

            mistakes.push({
                word: sifa.word || 'كلمة',
                expected: ruleName,
                description,
                category,
                severity,
            });

            // Accumulate penalty
            penaltyPoints += severity === 'major' ? 10 : severity === 'critical' ? 8 : 5;
        }
    }

    const score = Math.max(0, 100 - penaltyPoints);
    return { score, mistakes };
}
