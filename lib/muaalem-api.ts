/**
 * lib/muaalem-api.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * High-Speed Google AI Studio Recitation Assessment API
 *
 * Replaces slow Hugging Face Space (dr364873-tajweed-base.hf.space) with
 * direct Google AI Studio Gemini API calls (@google/generative-ai).
 * 
 * Provides sub-second / 1-2 second evaluation with zero cold-start delay!
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { checkRecitation, RecitationAssessment } from './gemini';

// ─── Public types ────────────────────────────────────────────────────────────

export interface MuaalemMistake {
    word: string;
    expected: string;
    description: string;
    category: 'تجويد' | 'نطق' | 'مد' | 'وقف' | 'حذف';
    severity: 'minor' | 'moderate' | 'major' | 'critical';
}

export interface MuaalemAssessment {
    score: number; // 0-100
    mistakes: MuaalemMistake[];
    error?: string;
    modelUsed?: string;
}

export interface AyahRange {
    surah: number;
    ayahFrom?: number;
    ayahTo?: number;
    fromAyah?: number;
    toAyah?: number;
}

/**
 * No-op warm up helper for backwards compatibility.
 * Google AI Studio APIs require zero cold-start warming!
 */
export function wakeUpMuaalemSpace(signal?: AbortSignal): void {
    console.log('[Google AI Studio] Gemini Recitation Engine ready — no warm-up needed.');
}

/**
 * Perform AI Tajweed evaluation on recorded user audio against expected Uthmani text.
 *
 * @param audioUri Local file URI of user recording (.m4a, .wav, .mp3)
 * @param uthmaniText Correct Uthmani reference text
 * @param ayahRange Surah + ayah range
 * @returns MuaalemAssessment with score + detailed mistakes
 */
export async function checkRecitationWithMuaalem(
    audioUri: string,
    uthmaniText: string,
    ayahRange?: AyahRange,
): Promise<MuaalemAssessment> {
    try {
        // Validate file exists before processing
        const fileInfo = await getInfoAsync(audioUri);
        if (!fileInfo.exists) {
            return { score: 0, mistakes: [], error: 'ملف التسجيل غير موجود.' };
        }

        // Guard against near-silent / empty recordings
        const MIN_AUDIO_BYTES = 5_000; // 5 KB
        const fileSize = (fileInfo as any).size ?? 0;
        if (fileSize < MIN_AUDIO_BYTES) {
            console.warn(
                `[Google AI Studio] Audio file too small (${fileSize} bytes < ${MIN_AUDIO_BYTES} bytes). Skipping.`
            );
            return {
                score: 0,
                mistakes: [],
                error: 'التسجيل قصير جداً أو صامت. يرجى التحدث بوضوح وإعادة المحاولة.',
            };
        }

        console.log('[Google AI Studio] Converting audio to base64 for Gemini multimodal evaluation...');
        
        // Read local audio file as base64 string for Gemini API
        const base64Audio = await readAsStringAsync(audioUri, {
            encoding: EncodingType.Base64,
        });

        console.log('[Google AI Studio] Invoking Gemini recitation assessment model...');
        const geminiResult: RecitationAssessment = await checkRecitation(
            base64Audio,
            uthmaniText,
            undefined,
            undefined,
            undefined,
            audioUri
        );

        if (geminiResult.error) {
            return {
                score: 0,
                mistakes: [],
                error: geminiResult.error,
            };
        }

        return mapGeminiResponseToMuaalem(geminiResult);
    } catch (error: any) {
        console.error('[Google AI Studio] Recitation assessment error:', error);

        let errorMessage = 'حدث خطأ أثناء تحليل التلاوة بالذكاء الاصطناعي.';
        if (error.message?.includes('network') || error.message?.includes('Network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
        }

        return { score: 0, mistakes: [], error: errorMessage };
    }
}

/**
 * Map standard Gemini RecitationAssessment format into MuaalemAssessment format.
 */
function mapGeminiResponseToMuaalem(geminiRes: RecitationAssessment): MuaalemAssessment {
    const mistakes: MuaalemMistake[] = [];

    const categoryMap: Record<string, MuaalemMistake['category']> = {
        tajweed: 'تجويد',
        pronunciation: 'نطق',
        elongation: 'مد',
        waqf: 'وقف',
        omission: 'حذف',
    };

    if (geminiRes.mistakes && Array.isArray(geminiRes.mistakes)) {
        for (const m of geminiRes.mistakes) {
            const cat = categoryMap[m.category || ''] || 'تجويد';
            const sev = m.severity || 'moderate';

            mistakes.push({
                word: m.text || 'كلمة',
                expected: m.correction || m.description || '',
                description: m.description || `${m.text} ← ${m.correction}`,
                category: cat,
                severity: sev,
            });
        }
    }

    return {
        score: Math.max(0, Math.min(100, Math.round(geminiRes.score || 0))),
        mistakes,
    };
}
