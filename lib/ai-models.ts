/**
 * Multi-Model AI Routing System
 * Implements waterfall strategy with fallback for API efficiency
 */

import { GoogleGenerativeAI, Part } from '@google/generative-ai';

// ============================================
// Model IDs (CRITICAL - DO NOT CHANGE)
// ============================================
export const AI_MODELS = {
    PLAN_ARCHITECT: 'gemini-2.5-flash-lite',      // One-time plan generation
    PRIMARY_AUDITOR: 'gemini-flash-latest',        // Daily recitation checks (Gemini 3 Flash)
    RANDOM_TESTER: 'gemini-2.5-flash',             // Random tests + Fallback
} as const;

export type ModelType = typeof AI_MODELS[keyof typeof AI_MODELS];

// Model display names for UI transparency
export const MODEL_DISPLAY_NAMES: Record<ModelType, string> = {
    [AI_MODELS.PLAN_ARCHITECT]: 'Gemini 2.5 Flash Lite',
    [AI_MODELS.PRIMARY_AUDITOR]: 'Gemini 3 Flash',
    [AI_MODELS.RANDOM_TESTER]: 'Gemini 2.5 Flash',
};

// ============================================
// Types
// ============================================
export interface AIResponse<T> {
    data: T;
    modelUsed: ModelType;
    error?: string;
}

export interface RecitationAssessment {
    mistakes: Array<{
        text: string;
        correction: string;
        description: string;
        category?: 'tajweed' | 'pronunciation' | 'elongation' | 'waqf';
        severity?: 'minor' | 'moderate' | 'major';
    }>;
    score: number;
    error?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Sleep function for delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limit cache to track temporarily unavailable models
 */
const rateLimitCache = new Map<ModelType, { until: Date; count: number }>();

function isModelRateLimited(model: ModelType): boolean {
    const limit = rateLimitCache.get(model);
    if (!limit) return false;

    if (new Date() > limit.until) {
        rateLimitCache.delete(model);
        return false;
    }

    return true;
}

function markModelRateLimited(model: ModelType, durationMs: number = 60000) {
    const existing = rateLimitCache.get(model);
    rateLimitCache.set(model, {
        until: new Date(Date.now() + durationMs),
        count: (existing?.count || 0) + 1
    });
    console.log(`⚠️ ${MODEL_DISPLAY_NAMES[model]} marked as rate limited for ${durationMs}ms`);

    // Log to system_logs table for monitoring
    logRateLimitToSupabase(model, durationMs).catch(err =>
        console.warn('Failed to log rate limit:', err)
    );
}

/**
 * Log rate limit event to Supabase for monitoring
 */
async function logRateLimitToSupabase(model: ModelType, durationMs: number): Promise<void> {
    try {
        const { supabase } = await import('./supabase');
        const { user } = await import('./auth').then(m => ({ user: null })); // Get user if available

        await supabase.rpc('log_api_rate_limit', {
            p_user_id: user || null,
            p_model: model,
            p_details: {
                model_display_name: MODEL_DISPLAY_NAMES[model],
                duration_ms: durationMs,
                timestamp: new Date().toISOString(),
                cache_count: rateLimitCache.get(model)?.count || 1
            }
        });
    } catch (error) {
        // Silent fail - don't break app if logging fails
        console.warn('Failed to log rate limit to Supabase:', error);
    }
}

// ============================================
// Core Functions
// ============================================

/**
 * Get AI client instance
 */
function getAIClient(): GoogleGenerativeAI {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API key not found');
    }
    return new GoogleGenerativeAI(apiKey);
}

/**
 * Generate content with fallback strategy
 * Primary → Fallback → Error
 */
export async function generateWithFallback<T>(
    primaryModel: ModelType,
    fallbackModel: ModelType,
    prompt: string,
    options?: {
        responseMimeType?: string;
        inlineData?: { mimeType: string; data: string };
        maxRetries?: number;
    }
): Promise<AIResponse<T>> {
    const genAI = getAIClient();
    const maxRetries = options?.maxRetries || 3;

    // Check if primary model is cached as rate limited
    if (isModelRateLimited(primaryModel)) {
        console.log(`⚠️ ${MODEL_DISPLAY_NAMES[primaryModel]} is cached as rate limited. Using fallback immediately.`);
        return tryFallback(genAI, fallbackModel, prompt, options);
    }

    // Try primary model with exponential backoff
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`⏳ Waiting ${delay}ms before retry ${attempt}/${maxRetries}...`);
                await sleep(delay);
            }

            console.log(`🧠 Using ${MODEL_DISPLAY_NAMES[primaryModel]} (attempt ${attempt + 1}/${maxRetries})...`);

            const model = genAI.getGenerativeModel({
                model: primaryModel,
                generationConfig: options?.responseMimeType
                    ? { responseMimeType: options.responseMimeType }
                    : undefined,
            });

            const content: Part[] = options?.inlineData
                ? [{ inlineData: options.inlineData } as Part, { text: prompt } as Part]
                : [{ text: prompt } as Part];

            const result = await model.generateContent(content);
            const response = await result.response;
            const text = response.text();

            const data = options?.responseMimeType === 'application/json'
                ? JSON.parse(text)
                : text;

            return {
                data: data as T,
                modelUsed: primaryModel,
            };
        } catch (primaryError: any) {
            console.warn(`⚠️ Primary model attempt ${attempt + 1} failed:`, primaryError.message);

            // Check error type
            const is429 = primaryError.message?.includes('429') ||
                primaryError.message?.includes('quota') ||
                primaryError.message?.includes('rate limit');

            const isNetworkError = primaryError.message?.includes('network') ||
                primaryError.message?.includes('timeout') ||
                primaryError.message?.includes('ECONNREFUSED');

            // If rate limit error and exhausted retries, try fallback
            if (is429) {
                markModelRateLimited(primaryModel, 60000); // Cache for 60 seconds
                console.log(`🔄 Rate limit detected. Falling back to ${MODEL_DISPLAY_NAMES[fallbackModel]}...`);
                await sleep(2000); // Respectful delay before fallback
                return tryFallback(genAI, fallbackModel, prompt, options);
            }

            // If network error, retry
            if (isNetworkError && attempt < maxRetries - 1) {
                console.log(`🔄 Network error detected. Retrying...`);
                continue;
            }

            // If last attempt or non-retryable error, throw
            if (attempt === maxRetries - 1) {
                throw primaryError;
            }
        }
    }

    throw new Error('Unexpected error in generateWithFallback');
}

/**
 * Try fallback model
 */
async function tryFallback<T>(
    genAI: GoogleGenerativeAI,
    fallbackModel: ModelType,
    prompt: string,
    options?: any
): Promise<AIResponse<T>> {
    try {
        const model = genAI.getGenerativeModel({
            model: fallbackModel,
            generationConfig: options?.responseMimeType
                ? { responseMimeType: options.responseMimeType }
                : undefined,
        });

        const content: Part[] = options?.inlineData
            ? [{ inlineData: options.inlineData } as Part, { text: prompt } as Part]
            : [{ text: prompt } as Part];

        const result = await model.generateContent(content);
        const response = await result.response;
        const text = response.text();

        const data = options?.responseMimeType === 'application/json'
            ? JSON.parse(text)
            : text;

        return {
            data: data as T,
            modelUsed: fallbackModel,
        };
    } catch (fallbackError: any) {
        console.error(`🛑 Fallback model also failed:`, fallbackError.message);
        throw new Error('جميع نماذج الذكاء الاصطناعي غير متاحة حالياً. يرجى المحاولة لاحقاً.');
    }
}

/**
 * Check recitation using Primary Auditor with fallback
 */
export async function checkRecitationWithAI(
    audioBase64: string,
    referenceText: string
): Promise<AIResponse<RecitationAssessment>> {
    const prompt = `You are a Quran recitation expert specializing in Tajweed rules. Analyze the following audio recording and compare it to the reference text.

Reference Text (Arabic):
${referenceText}

Analyze for:
1. Tajweed rule violations (Ghunnah, Qalqalah, Madd, Idgham, etc.)
2. Pronunciation accuracy (Makharij al-Huruf)
3. Elongation (Madd) correctness
4. Proper stopping points (Waqf)

Return a JSON response with this EXACT structure:
{
  "score": number (0-100 representing overall accuracy),
  "mistakes": [
    { 
      "text": "the_incorrect_word_or_phrase", 
      "correction": "the_correct_pronunciation", 
      "description": "brief_explanation_in_arabic",
      "category": "tajweed|pronunciation|elongation|waqf",
      "severity": "minor|moderate|major"
    }
  ]
}

If the recitation is perfect, return an empty array for mistakes and a score of 95-100.
Focus on Tajweed rules and provide constructive Arabic feedback.`;

    try {
        return await generateWithFallback<RecitationAssessment>(
            AI_MODELS.PRIMARY_AUDITOR,
            AI_MODELS.RANDOM_TESTER,
            prompt,
            {
                responseMimeType: 'application/json',
                inlineData: {
                    mimeType: 'audio/mp3',
                    data: audioBase64,
                },
            }
        );
    } catch (error: any) {
        console.error('Error checking recitation:', error);

        let errorMessage = 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.';
        if (error.message?.includes('quota')) {
            errorMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        } else if (error.message?.includes('network')) {
            errorMessage = 'مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
        }

        return {
            data: {
                mistakes: [],
                score: 0,
                error: errorMessage,
            },
            modelUsed: AI_MODELS.PRIMARY_AUDITOR,
            error: errorMessage,
        };
    }
}

/**
 * Generate memorization plan using Plan Architect
 */
export async function generateMemorizationPlan(
    targetDate: string,
    age: number,
    userNotes: string,
    qiraat: string
): Promise<AIResponse<any>> {
    const prompt = `You are an expert Quran memorization planner. Generate a comprehensive 604-page memorization schedule.

User Profile:
- Target completion date: ${targetDate}
- Age: ${age}
- Qiraat: ${qiraat}
- Special notes: ${userNotes}

Requirements:
1. Use a 6-days memorization + 1-day cumulative review cycle
2. Tailor the daily load based on age (younger = more capacity)
3. Consider user notes for pacing adjustments
4. Cover all 604 pages of the Quran
5. Include both "Memorize" and "Review" task types

Return a JSON array with this structure:
[
  {
    "day": 1,
    "verses": {"surah": 1, "from_ayah": 1, "to_ayah": 7},
    "task_type": "Memorize",
    "estimated_time": 30
  },
  {
    "day": 7,
    "verses": {"surah": 1, "from_ayah": 1, "to_ayah": 50},
    "task_type": "Review",
    "estimated_time": 45
  }
]

Generate the complete plan for all days needed to finish 604 pages.`;

    return await generateWithFallback(
        AI_MODELS.PLAN_ARCHITECT,
        AI_MODELS.RANDOM_TESTER,
        prompt,
        { responseMimeType: 'application/json' }
    );
}

/**
 * Perform random test after 5 wards
 */
export async function performRandomTest(
    audioBase64: string,
    completedWardsToday: Array<{ surah: number; from_ayah: number; to_ayah: number; text: string }>
): Promise<AIResponse<RecitationAssessment>> {
    // Randomly select one ward from today's completed wards
    const randomWard = completedWardsToday[Math.floor(Math.random() * completedWardsToday.length)];

    const prompt = `You are conducting a surprise recitation test. The student has completed 5 wards today and wants to continue.

Test Segment (randomly selected from today's wards):
Surah ${randomWard.surah}, Ayah ${randomWard.from_ayah}-${randomWard.to_ayah}

Reference Text:
${randomWard.text}

Analyze the recitation strictly. The student must score ≥85% to continue.

Return JSON:
{
  "score": number (0-100),
  "mistakes": [
    {
      "text": "incorrect_part",
      "correction": "correct_pronunciation",
      "description": "explanation_in_arabic",
      "category": "tajweed|pronunciation|elongation|waqf",
      "severity": "minor|moderate|major"
    }
  ]
}`;

    return await generateWithFallback<RecitationAssessment>(
        AI_MODELS.RANDOM_TESTER,
        AI_MODELS.PRIMARY_AUDITOR,
        prompt,
        {
            responseMimeType: 'application/json',
            inlineData: {
                mimeType: 'audio/mp3',
                data: audioBase64,
            },
        }
    );
}
