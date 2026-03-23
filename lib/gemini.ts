import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!);

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
 * Check Quran recitation using Gemini AI (Zero-cost client-side evaluation)
 * @param userAudioBase64 - Base64 encoded user audio file
 * @param referenceText - The correct Quranic text to compare against
 * @param sheikhAudioBase64 - (Optional) Base64 encoded sheikh reference audio
 * @param sheikhMimeType - (Optional) MIME type of sheikh audio
 * @param phoneticRef - (Optional) Phonetic ground-truth for Madd/Ghunnah
 * @returns Assessment with mistakes and score
 */
export async function checkRecitation(
    userAudioBase64: string,
    referenceText: string,
    sheikhAudioBase64?: string,
    sheikhMimeType?: string,
    phoneticRef?: string,
): Promise<RecitationAssessment> {
    try {
        const modelNames = [
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-3.1-flash-lite-preview',
        ];
        
        const HYBRID_SYSTEM_PROMPT = `You are an expert Quran Tajweed examiner with deep knowledge of Hafs recitation (حفص عن عاصم).

You will receive:
- AUDIO 1: The student's recitation — evaluate this audio
- AUDIO 2 (if present): A short Sheikh reference clip of the FIRST ayah ONLY
  → Use ONLY for Makhraj (letter articulation) reference. DO NOT use its Madd lengths as a timing standard.
- UTHMANI_TEXT: The Quranic text the student should recite
- PHONETIC_REF (if present): A mathematically precise phonetic transcription using the Quran phonetic alphabet.
  In this alphabet: repeated vowel characters = Madd duration (اا=2 counts, اааа=4, аааааа=6).
  Repeated ن characters = Ghunnah duration. This string is the ABSOLUTE GROUND TRUTH for timing rules.

═══ EVALUATION PHASES (follow in strict order) ═══

PHASE 1 — TRANSCRIPTION:
Silently transcribe everything in AUDIO 1. This is your ground truth for Phase 2.

PHASE 2 — COMPLETENESS CHECK (mandatory):
Compare transcription word-by-word against UTHMANI_TEXT.
- completenessRatio = words_recited / total_reference_words
- For every complete ayah absent from audio → add one "omission" mistake (severity: "critical")
- A student who stops early MUST receive a penalized score. Never give >50 if completenessRatio < 0.5.

PHASE 3 — MADD & GHUNNAH (use PHONETIC_REF if provided, otherwise estimate from knowledge):
If PHONETIC_REF is provided:
  - For each elongation group in student's audio, count repetitions of the vowel character
  - Compare to PHONETIC_REF character count at that position
  - If counts differ by 1+ → Madd error; severity = minor(1 count off), moderate(2 off), major(3+ off)
If PHONETIC_REF is NOT provided:
  - Apply standard Hafs rules: MaddTabee=2, MaddMonfasel=4, MaddMottasel=5, MaddLazem=6
  - Estimate based on your Tajweed knowledge

PHASE 4 — MAKHRAJ CHECK (use AUDIO 2 if present):
If AUDIO 2 is present:
  - Compare student's articulation of identical letters to the Sheikh's
  - Focus on these critical pairs: ع/ا, ح/ه, ق/ك, ط/ت, ص/س, ذ/ز, ظ/ز
  - Only flag CLEAR, AUDIBLE articulation differences — do not flag unless certain
If AUDIO 2 is NOT present:
  - Apply Makhraj knowledge from the Uthmani text only
  - Be conservative — only flag obvious errors

PHASE 5 — TAJWEED RULES:
Check for: Qalqalah (ق ط ب ج د when saakin), Idgham, Ikhfaa, Iqlab, Izhar
Apply the correct rule based on UTHMANI_TEXT context.

PHASE 6 — SCORE:
completenessRatio = words_recited / total_words_in_reference
tajweedAccuracy = 1 - (fraction of recited words with errors)
finalScore = round(completenessRatio × tajweedAccuracy × 100)

Hard rules:
- completenessRatio < 0.50 → score MUST be below 50
- Score ≥ 90 requires reciting ≥95% of text with near-perfect Tajweed
- NEVER inflate the score for incomplete recitation

═══ OUTPUT FORMAT ═══
Return ONLY this JSON object — no markdown, no explanation outside the JSON:
{
  "score": <integer 0-100>,
  "mistakes": [
    {
      "text": "<incorrect Arabic text heard>",
      "correction": "<correct form with explanation>",
      "description": "<Arabic explanation>",
      "category": "tajweed|pronunciation|elongation|waqf|omission",
      "severity": "minor|moderate|major|critical",
      "phonetic_expected": "<expected phonetic chars if known, else empty string>",
      "phonetic_heard": "<phonetic chars actually heard, else empty string>"
    }
  ]
}`;

        const ayahCount = referenceText.split(' * ').length;
        const hasSheikhClip = !!sheikhAudioBase64;
        const hasPhoneticRef = !!phoneticRef;

        const sheikhNote = hasSheikhClip
            ? `[AUDIO 2 is the Sheikh's reference clip for the FIRST ayah — use ONLY for Makhraj comparison]\n\n`
            : '';

        const phoneticSection = hasPhoneticRef
            ? `\nPHONETIC_REF (absolute ground-truth for Madd & Ghunnah durations):\n${phoneticRef}\n\nLEGEND:\n- Repeated vowel chars = Madd duration: اا=2 counts, اааа=4 counts, аааааа=6 counts\n- Repeated ن chars = Ghunnah duration\n- Use PHONETIC_REF character counts in PHASE 3 — DO NOT estimate from audio timing\n`
            : '';

        const promptText = `${HYBRID_SYSTEM_PROMPT}\n\n═══ INPUT DATA ═══\n\n${sheikhNote}UTHMANI_TEXT (${ayahCount} Ayah${ayahCount > 1 ? 's' : ''} — student must recite ALL of this):\n${referenceText}${phoneticSection}`;

        const parts: any[] = [
            {
                inlineData: {
                    mimeType: 'audio/m4a',
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
                console.log(`🤖 Trying model directly: ${modelUsed}`);
                const model = genAI.getGenerativeModel({
                    model: modelUsed,
                    generationConfig: { responseMimeType: 'application/json' }
                });
                result = await model.generateContent(parts);
                break;
            } catch (modelError: any) {
                console.warn(`⚠️ Model ${modelUsed} failed locally: ${modelError.message}`);
                // if it's a quota issue on 1.5-flash or 3-flash, try next.
                if (i === modelNames.length - 1) throw modelError;
            }
        }

        const response = await result.response;
        const text = response.text();

        // Parse the JSON response directly
        const assessment: RecitationAssessment = JSON.parse(text);
        assessment.modelUsed = modelUsed;
        return assessment;
    } catch (error: any) {
        console.error('Error checking recitation locally:', error);
        
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
            error: errorMessage
        };
    }
}
