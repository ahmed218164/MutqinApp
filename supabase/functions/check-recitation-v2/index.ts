// @ts-nocheck
// Supabase Edge Function — Hybrid Recitation Evaluation (check-recitation-v2)
// Phase 3a: Hybrid Architecture (Sheikh Makhraj clip + Uthmani text context)
//
// Accepts:
//   audioPath     — user recording path in Supabase Storage
//   referenceText — Uthmani text of selected ayahs joined by " * "
//   userId        — for RLS and cleanup
//   sheikhClipUrl — (optional) CDN URL of sheikh's first ayah in the range (~150KB)
//                   used ONLY as Makhraj acoustic reference, NOT for timing
//
// Deploy: supabase functions deploy check-recitation-v2

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Convert ArrayBuffer to Base64 safely (chunked to avoid stack overflow) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

/** Detect audio MIME type from file path extension */
function detectMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        'mp3':  'audio/mp3',
        'mp4':  'audio/mp4',
        'm4a':  'audio/mp4',
        'wav':  'audio/wav',
        'ogg':  'audio/ogg',
        'webm': 'audio/webm',
        'aac':  'audio/aac',
        'flac': 'audio/flac',
        '3gp':  'audio/3gpp',
    };
    return map[ext] ?? 'audio/mp4';
}

// ── Hybrid System Prompt ────────────────────────────────────────────────────
// Based on the quran-muaalem architecture analysis.
// See: recitation_eval_architecture.md — Part 4
//
// Instructs Gemini to:
//   1. Use AUDIO 1 (user) as the primary evaluation target
//   2. Use AUDIO 2 (sheikh — first ayah only) ONLY for Makhraj/letter articulation reference
//   3. Use PHONETIC_REF string as the hard ground-truth for Madd/Ghunnah durations
//   4. Never use sheikh timing as Madd reference (timing comes from phonetic string)

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
}

Category guide:
- "omission"      → entire ayah or large section absent
- "tajweed"       → Tajweed rule violated (Qalqalah, Idgham, Ikhfaa, etc.)
- "pronunciation" → Wrong letter Makhraj
- "elongation"    → Madd duration wrong
- "waqf"          → Stopping at wrong place

Severity guide:
- "critical" → entire ayah missing or completely wrong word
- "major"    → clear rule broken (e.g. Madd 2 counts instead of 6)
- "moderate" → noticeable error but word recognizable
- "minor"    → subtle imperfection`;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userAudioBase64, referenceText, userId, sheikhAudioBase64, sheikhMimeType, phoneticRef } = await req.json();

        if (!userAudioBase64 || !referenceText) {
            return new Response(
                JSON.stringify({ mistakes: [], score: 0, error: 'Missing required parameters' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        const mimeType = 'audio/m4a'; // Default for Expo audio recordings
        let sheikhClipPart: object | null = null;
        if (sheikhAudioBase64 && sheikhMimeType) {
            sheikhClipPart = {
                inlineData: {
                    mimeType: sheikhMimeType,
                    data: sheikhAudioBase64,
                },
            };
            console.log(`✅ Sheikh clip included as Makhraj reference`);
        }

        // ── Build prompt ─────────────────────────────────────────────────────
        const ayahCount = referenceText.split(' * ').length;
        const hasSheikhClip = sheikhClipPart !== null;
        const hasPhoneticRef = phoneticRef && typeof phoneticRef === 'string' && phoneticRef.length > 0;

        const sheikhNote = hasSheikhClip
            ? `[AUDIO 2 is the Sheikh's reference clip for the FIRST ayah — use ONLY for Makhraj comparison]\n\n`
            : '';

        // Phase 3b: Phonetic reference injected as hard Tajweed constraints.
        // Character repetitions encode exact Madd durations (اا=2, اааа=4, аааааа=6 harakat).
        // Ghunnah duration is encoded as repeated nasal characters.
        // Gemini MUST use these counts in Phase 3 of its evaluation.
        const phoneticSection = hasPhoneticRef
            ? `\nPHONETIC_REF (absolute ground-truth for Madd & Ghunnah durations):\n${phoneticRef}\n\nLEGEND:\n- Repeated vowel chars = Madd duration: اا=2 counts, اааа=4 counts, аааааа=6 counts\n- Repeated ن chars = Ghunnah duration\n- Use PHONETIC_REF character counts in PHASE 3 — DO NOT estimate from audio timing\n`
            : '';

        if (hasPhoneticRef) {
            console.log(`📜 Phonetic ref included: ${phoneticRef.length} chars — Madd hallucination eliminated`);
        }

        const promptText = `${HYBRID_SYSTEM_PROMPT}

═══ INPUT DATA ═══

${sheikhNote}UTHMANI_TEXT (${ayahCount} Ayah${ayahCount > 1 ? 's' : ''} — student must recite ALL of this):
${referenceText}${phoneticSection}`;

        // ── Assemble Gemini parts ────────────────────────────────────────────
        // Part order matters: user audio first, then sheikh (if any), then text prompt
        const parts: object[] = [
            { inlineData: { mimeType, data: userAudioBase64 } },
        ];
        if (sheikhClipPart) {
            parts.push(sheikhClipPart);
        }
        parts.push({ text: promptText });

        console.log(`🧠 Calling Gemini (${parts.length} parts, sheikh_clip=${hasSheikhClip})`);

        // ── Call Gemini with model fallback ──────────────────────────────────
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiKey) throw new Error('GEMINI_API_KEY environment variable is not set');

        const genAI = new GoogleGenerativeAI(geminiKey);
        // ── Model fallback chain (free tier, March 2026) ──────────────────────
        // Priority: newest/smartest first → most stable → highest daily limit
        //   1. gemini-3-flash-preview:      Gemini 3, best comprehension (20 RPD)
        //   2. gemini-2.5-flash:            Proven audio multimodal      (20 RPD)
        //   3. gemini-3.1-flash-lite-preview: Emergency fallback         (500 RPD)
        const modelNames = [
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-3.1-flash-lite-preview',
        ];
        let result: any;
        let modelUsed = modelNames[0];

        for (let i = 0; i < modelNames.length; i++) {
            try {
                modelUsed = modelNames[i];
                console.log(`🤖 Trying model: ${modelUsed}`);

                const model = genAI.getGenerativeModel({
                    model: modelUsed,
                    generationConfig: { responseMimeType: 'application/json' }
                });

                result = await model.generateContent(parts);
                break;
            } catch (modelError: any) {
                console.warn(`⚠️ Model ${modelUsed} failed: ${modelError.message}`);
                if (i === modelNames.length - 1) throw modelError;
            }
        }

        const response = await result!.response;
        let assessment: any;
        try {
            const rawText = response.text();
            const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            assessment = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error('Failed to parse Gemini JSON response:', response.text().substring(0, 200));
            return new Response(
                JSON.stringify({ mistakes: [], score: 0, error: 'فشل في قراءة نتيجة التحليل من النموذج.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }
        console.log(`✅ Score: ${assessment.score}, Mistakes: ${assessment.mistakes?.length ?? 0}, Model: ${modelUsed}`);

        // ── Finished Processing ──────────────────────────────────────────────

        return new Response(
            JSON.stringify({ ...assessment, modelUsed }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('Unhandled error in check-recitation-v2:', error?.message ?? error);

        let userMessage: string;
        const msg = error?.message ?? String(error);

        if (msg.includes('quota') || msg.includes('429')) {
            userMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        } else if (msg.includes('GEMINI_API_KEY') || msg.includes('API_KEY_INVALID')) {
            userMessage = `مفتاح الذكاء الاصطناعي غير مضبوط: ${msg}`;
        } else if (msg.includes('network')) {
            userMessage = 'مشكلة في الاتصال بالإنترنت.';
        } else {
            userMessage = `خطأ في التحليل: ${msg}`;
        }

        return new Response(
            JSON.stringify({ mistakes: [], score: 0, error: userMessage }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    }
});
