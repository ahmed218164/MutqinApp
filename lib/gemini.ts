import { GoogleGenerativeAI } from '@google/generative-ai';
import { getModelsForTask } from './ai-models';
import { getActiveGeminiApiKey } from './gemini-api-key';

/**
 * Lazy getter for GoogleGenerativeAI client instance
 */
export function getGeminiClient(): GoogleGenerativeAI {
    const apiKey = getActiveGeminiApiKey();
    if (!apiKey) {
        throw new Error('EXPO_PUBLIC_GEMINI_API_KEY environment variable is not defined.');
    }
    if (/^bearer\s|^ya29\./i.test(apiKey)) {
        throw new Error('Invalid Gemini API key. OAuth access tokens cannot be used as a Gemini API key.');
    }
    return new GoogleGenerativeAI(apiKey);
}

/**
 * Resolves the MIME type for audio input, handling full MIME types, file URIs/paths, or extensions.
 * Defaults to audio/m4a.
 */
export function getAudioMimeType(input?: string): string {
    if (!input) return 'audio/m4a';
    if (input.startsWith('audio/')) return input;
    if (input.includes('/')) {
        const filename = input.split('/').pop() || '';
        return getAudioMimeType(filename);
    }
    const lower = input.toLowerCase().trim();
    if (lower.endsWith('.wav') || lower === 'wav') return 'audio/wav';
    if (lower.endsWith('.mp3') || lower === 'mp3') return 'audio/mp3';
    if (lower.endsWith('.ogg') || lower === 'ogg') return 'audio/ogg';
    if (lower.endsWith('.webm') || lower === 'webm') return 'audio/webm';
    if (lower.endsWith('.aac') || lower === 'aac') return 'audio/aac';
    if (lower.endsWith('.flac') || lower === 'flac') return 'audio/flac';
    if (lower.endsWith('.3gp') || lower === '3gp') return 'audio/3gpp';
    if (lower.endsWith('.caf') || lower === 'caf') return 'audio/x-caf';
    if (lower.endsWith('.m4a') || lower === 'm4a' || lower.endsWith('.mp4') || lower === 'mp4') return 'audio/m4a';
    return 'audio/m4a';
}

export interface RecitationAssessment {
    mistakes: Array<{
        text: string;
        correction: string;
        description: string;
        category?: 'tajweed' | 'pronunciation' | 'elongation' | 'waqf' | 'omission';
        severity?: 'minor' | 'moderate' | 'major' | 'critical';
        phonetic_expected?: string;
        phonetic_heard?: string;
    }>;
    score: number;
    error?: string;
    modelUsed?: string;
}

/**
 * Check Quran recitation using Gemini AI with Comprehensive 6-Phase Hafs Tajweed Verification
 * @param userAudioBase64 - Base64 encoded user audio file
 * @param referenceText - The correct Quranic text with full tashkeel
 * @param sheikhAudioBase64 - (Optional) Base64 encoded sheikh reference audio
 * @param sheikhMimeType - (Optional) MIME type of sheikh audio
 * @param phoneticRef - (Optional) Phonetic ground-truth for Madd & Ghunnah
 * @param userAudioMimeType - (Optional) Dynamic MIME type or URI for user audio
 * @returns Assessment with mistakes and score
 */
export async function checkRecitation(
    userAudioBase64: string,
    referenceText: string,
    sheikhAudioBase64?: string,
    sheikhMimeType?: string,
    phoneticRef?: string,
    userAudioMimeType?: string,
): Promise<RecitationAssessment> {
    try {
        const genAI = getGeminiClient();
        const modelNames = [...getModelsForTask('detailedRecitation')];

        const COMPREHENSIVE_TAJWEED_PROMPT = `You are a world-class Quran Tajweed Examiner and Shaykh (برواية حفص عن عاصم من طريق الشاطبية).
Evaluate the student's recitation audio with uncompromising phonetic and Tajweed accuracy.

INPUT SPECIFICATION:
- AUDIO 1: The student's recitation recording.
- AUDIO 2 (if present): Reference Sheikh clip for articulation benchmark.
- UTHMANI_TEXT: The exact Quranic text the student must recite (with full diacritics / Tashkeel).
- PHONETIC_REF (if present): Mathematical ground truth for timing rules:
  • Repeated vowel chars = Madd counts: اا = 2 counts (طبيعي) · اااا = 4 counts (منفصل/متصل) · اااااا = 6 counts (لازم).
  • Repeated ن/م chars = Ghunnah duration (2 counts).

═══ 6-PHASE EVALUATION PROTOCOL (STRICT ORDER) ═══

PHASE 1 — VERBATIM WORD AUDIT & COMPLETENESS:
- Transcribe student's audio verbatim. Compare word-by-word against UTHMANI_TEXT.
- Missing / Omitted word → Category: "omission", Severity: "critical".
- Substituted word / Added word → Category: "pronunciation", Severity: "major".
- Completeness check: completenessRatio = recited_words / total_words.
  If completenessRatio < 0.50, final score MUST NOT exceed 50.

PHASE 2 — TASHKEEL & LAHN JALI (اللحن الجلي في الحركات والإعراب):
- Check every single Harakah: Fatha (ـَ), Damma (ـُ), Kasra (ـِ), Sukun (ـْ), Tanween, Shadda (ـّ).
- Vowel substitution (e.g. Damma instead of Fatha, or moving a Saakin letter) → Severity: "major" / "critical".

PHASE 3 — MAKHARIJ AL-HURUF (مخارج الحروف):
- Audit articulation points with zero tolerance for confusable letter pairs:
  1. (ع / ء) [Ayn vs Hamza]
  2. (ح / هـ) [Haa vs Haa']
  3. (ق / ك) [Qaf vs Kaf]
  4. (ط / ت) [Taa Mufakhama vs Taa Muraqaqa]
  5. (ص / س) [Saad vs Seen]
  6. (ظ / ذ / ز) [Zhaa vs Dhal vs Zay]
  7. (ض / د) [Daad Mustateela vs Daal]
  8. (ث / س) [Thaa vs Seen]
- Flag any letter confusion under Category: "pronunciation", Severity: "major".

PHASE 4 — SIFAT & TAFKHEEM / TARQEEQ (الصفات والتفخيم والترقيق):
- Tafkheem letters: (خ, ص, ض, غ, ط, ق, ظ) must be pronounced with Isti'laa & Tafkheem.
- Raa (ر): Check Tafkheem vs Tarqeeq based on preceding vowel and sukun.
- Lam (ل): Check Tafkheem in Lafz al-Jalalah (الله / اللهم) when preceded by Fatha/Damma.
- Qalqalah: Check clear bounce on (ق, ط, ب, ج, د) when Saakin or at Waqf.
- Hams: Check audible breath on (ت, ك) when Saakin.

PHASE 5 — MADD & GHUNNAH (أحكام المدود والغنة):
- Match student durations against PHONETIC_REF (or Hafs rules):
  • Madd Tabee = 2 counts. If prolonged to 4 → error.
  • Madd Monfasel = 4 counts (Shatibiyyah). If cut to 2 without license → error.
  • Madd Mottasel = 4-5 counts.
  • Madd Lazem = 6 counts strictly.
  • Ghunnah in Noon/Meem Mushaddadah, Idgham bi-ghunnah, Ikhfa, Iqlab = 2 counts.

PHASE 6 — WAQF & IBTIDA (الوقف والابتداء):
- Check appropriate pausing without breath interruptions inside single words or ugly stops (وقف قبيح).

═══ SCORING ALGORITHM ═══
- Base Score = completenessRatio * 100
- Deduct 15-25 points per Critical/Major error (Lahn Jali / Word Omission).
- Deduct 5-10 points per Moderate error (Makhraj / Sifat / Madd Lazem/Mottasel violation).
- Deduct 2-4 points per Minor error (Slight timing or mild Tajweed inaccuracy).
- Score is clamped between 0 and 100.

═══ OUTPUT JSON FORMAT (NO MARKDOWN OUTSIDE JSON) ═══
{
  "score": <integer 0-100>,
  "mistakes": [
    {
      "text": "<Arabic word heard incorrectly>",
      "correction": "<correct Uthmani word with tashkeel>",
      "description": "<Detailed Arabic explanation naming the specific Tajweed rule / error>",
      "category": "tajweed|pronunciation|elongation|waqf|omission",
      "severity": "minor|moderate|major|critical",
      "phonetic_expected": "<expected phonetic string>",
      "phonetic_heard": "<heard phonetic string>"
    }
  ]
}`;

        const ayahCount = referenceText.split(' * ').length;
        const hasSheikhClip = !!sheikhAudioBase64;
        const hasPhoneticRef = !!phoneticRef;

        const sheikhNote = hasSheikhClip
            ? `[AUDIO 2 is the Sheikh's reference clip — use for Makhraj & Sifat comparison benchmark]\n\n`
            : '';

        const phoneticSection = hasPhoneticRef
            ? `\nPHONETIC_REF (Ground truth for Madd & Ghunnah timing):\n${phoneticRef}\n`
            : '';

        const promptText = `${COMPREHENSIVE_TAJWEED_PROMPT}\n\n═══ INPUT DATA ═══\n\n${sheikhNote}UTHMANI_TEXT (${ayahCount} Ayah${ayahCount > 1 ? 's' : ''}):\n${referenceText}${phoneticSection}`;

        const userMime = getAudioMimeType(userAudioMimeType);

        const parts: any[] = [
            {
                inlineData: {
                    mimeType: userMime,
                    data: userAudioBase64,
                },
            },
        ];

        if (sheikhAudioBase64 && sheikhMimeType) {
            parts.push({
                inlineData: {
                    mimeType: sheikhMimeType,
                    data: sheikhAudioBase64,
                },
            });
        }

        parts.push({ text: promptText });

        let result: any;
        let modelUsed = modelNames[0];

        for (let i = 0; i < modelNames.length; i++) {
            try {
                modelUsed = modelNames[i];
                console.log(`🤖 Auditing recitation with model: ${modelUsed}`);
                const model = genAI.getGenerativeModel({
                    model: modelUsed,
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.1,
                    },
                });
                result = await model.generateContent(parts);
                break;
            } catch (modelError: any) {
                console.warn(`⚠️ Model ${modelUsed} failed: ${modelError.message}`);
                if (i === modelNames.length - 1) throw modelError;
            }
        }

        const response = await result.response;
        const text = response.text();

        let assessment: RecitationAssessment;
        try {
            const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            assessment = JSON.parse(cleaned);
        } catch (parseError) {
            console.error('[gemini] Failed to parse AI response as JSON:', text.substring(0, 200));
            return {
                mistakes: [],
                score: 0,
                error: 'فشل في قراءة نتيجة التحليل التجويدي. يرجى المحاولة مرة أخرى.',
            };
        }

        assessment.modelUsed = modelUsed;
        return assessment;
    } catch (error: any) {
        console.error('Error in comprehensive recitation check:', error);

        let errorMessage = 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.';
        if (error.message?.includes('quota') || error.message?.includes('429')) {
            errorMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        } else if (error.message?.includes('network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
        } else if (error.message?.includes('payload too large') || error.message?.includes('413')) {
            errorMessage = 'التسجيل طويل جداً. يرجى تسجيل آيات أقل والمحاولة مرة أخرى.';
        }

        return {
            mistakes: [],
            score: 0,
            error: errorMessage,
        };
    }
}
