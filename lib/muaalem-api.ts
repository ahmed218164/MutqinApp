/**
 * lib/muaalem-api.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * High-Accuracy Comprehensive Quran Recitation & Tajweed Assessment Engine
 *
 * Integrates:
 * 1. Mathematical Ground-Truth Phonetizer (lib/quran-phonetizer.ts)
 * 2. High-Speed Word Alignment (Groq Whisper-Large-v3-Turbo when configured)
 * 3. Deep Multimodal Tajweed & Makharij Auditor (Gemini 2.5 Flash / Groq LLM)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getInfoAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { checkRecitation, RecitationAssessment } from './gemini';
import { phonetizeForQiraat } from './quran-phonetizer';
import { getActiveGroqApiKey } from './groq-api-key';
import { transcribeRecitationWithGroq } from './groq';

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
 */
export function wakeUpMuaalemSpace(signal?: AbortSignal): void {
    console.log('[Muaalem Engine] Recitation Engine ready.');
}

/**
 * Perform High-Accuracy Tajweed & Recitation evaluation on recorded user audio
 * against expected Uthmani text.
 *
 * @param audioUri Local file URI of user recording (.m4a, .wav, .mp3)
 * @param uthmaniText Correct Uthmani reference text with full tashkeel
 * @param ayahRange Surah + ayah range
 * @param qiraat Recitation narration (default 'Hafs')
 * @returns MuaalemAssessment with score + detailed mistakes
 */
export async function checkRecitationWithMuaalem(
    audioUri: string,
    uthmaniText: string,
    ayahRange?: AyahRange,
    qiraat: string = 'Hafs'
): Promise<MuaalemAssessment> {
    try {
        // 1. Validate file exists
        const fileInfo = await getInfoAsync(audioUri);
        if (!fileInfo.exists) {
            return { score: 0, mistakes: [], error: 'ملف التسجيل غير موجود.' };
        }

        // 2. Guard against near-silent / empty recordings
        const MIN_AUDIO_BYTES = 5_000; // 5 KB
        const fileSize = (fileInfo as any).size ?? 0;
        if (fileSize < MIN_AUDIO_BYTES) {
            console.warn(
                `[Muaalem Engine] Audio file too small (${fileSize} bytes < ${MIN_AUDIO_BYTES} bytes). Skipping.`
            );
            return {
                score: 0,
                mistakes: [],
                error: 'التسجيل قصير جداً أو صامت. يرجى التحدث بوضوح وإعادة المحاولة.',
            };
        }

        // 3. Generate mathematical phonetic ground truth
        const phoneticRef = phonetizeForQiraat(uthmaniText, qiraat);
        console.log(`[Muaalem Engine] Generated Phonetic Ground-Truth (${qiraat}):`, phoneticRef);

        // 4. Check if Groq Whisper is available for sub-second word-alignment assistance
        const groqApiKey = getActiveGroqApiKey();
        let groqTranscribedText = '';

        if (groqApiKey) {
            try {
                console.log('[Muaalem Engine] Executing Groq Whisper-Large-v3-Turbo ASR pass...');
                const groqResult = await transcribeRecitationWithGroq(audioUri, uthmaniText);
                if (groqResult && !groqResult.error && groqResult.text) {
                    groqTranscribedText = groqResult.text;
                    console.log('[Muaalem Engine] Groq ASR Transcription:', groqTranscribedText);
                }
            } catch (groqErr) {
                console.warn('[Muaalem Engine] Groq ASR pass skipped:', groqErr);
            }
        }

        // 5. Read local audio file as base64 string for Multimodal Tajweed evaluation
        console.log('[Muaalem Engine] Reading audio as Base64 for Deep Multimodal Tajweed Audit...');
        const base64Audio = await readAsStringAsync(audioUri, {
            encoding: EncodingType.Base64,
        });

        // 6. Invoke Gemini Comprehensive Tajweed Auditor
        console.log('[Muaalem Engine] Invoking Gemini Multimodal Tajweed Auditor with Phonetic Reference...');
        const assessmentResult: RecitationAssessment = await checkRecitation(
            base64Audio,
            uthmaniText,
            undefined, // sheikh clip
            undefined,
            phoneticRef,
            audioUri
        );

        if (assessmentResult.error) {
            return {
                score: 0,
                mistakes: [],
                error: assessmentResult.error,
            };
        }

        // 7. Map response to standard Muaalem format
        const mappedAssessment = mapGeminiResponseToMuaalem(assessmentResult);

        // 8. Cross-verify with Groq word-alignment if omissions were detected
        if (groqTranscribedText && uthmaniText) {
            const cleanRefWords = uthmaniText.replace(/[\u064B-\u065F\u0670]/g, '').trim().split(/\s+/);
            const cleanHeardWords = groqTranscribedText.replace(/[\u064B-\u065F\u0670]/g, '').trim().split(/\s+/);

            // If user recited significantly fewer words than reference
            if (cleanHeardWords.length < cleanRefWords.length * 0.6) {
                const alreadyHasOmission = mappedAssessment.mistakes.some(m => m.category === 'حذف');
                if (!alreadyHasOmission && cleanRefWords.length > 3) {
                    mappedAssessment.mistakes.unshift({
                        word: 'تلاوة غير مكتملة',
                        expected: uthmaniText,
                        description: `تمت تلاوة ${cleanHeardWords.length} كلمات فقط من أصل ${cleanRefWords.length} كلمة في الآية الكريمة.`,
                        category: 'حذف',
                        severity: 'critical',
                    });
                    mappedAssessment.score = Math.min(mappedAssessment.score, Math.round((cleanHeardWords.length / cleanRefWords.length) * 100));
                }
            }
        }

        return mappedAssessment;
    } catch (error: any) {
        console.error('[Muaalem Engine] Recitation assessment error:', error);

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
