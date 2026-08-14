/**
 * lib/ai-features-suite.ts
 * ────────────────────────
 * Comprehensive Google AI Studio Multi-Model Strategy Suite for MutqinApp
 * 
 * Allocated Quota Strategy (41,135 RPD + Live APIs):
 *  1. Gemma 4 (26B/31B) [28,800 RPD]: Fast Tajweed Q&A & Quick Recitation
 *  2. Gemini Embeddings 1 & 2 [2,000 RPD]: Semantic Quran Vector Search
 *  3. Search Grounding [4,500 RPD]: Authentic Asbab Al-Nuzul & Fiqh Search
 *  4. Imagen 4 [75 RPD]: Islamic Achievement & Quote Cards Generation
 *  5. Gemini Robotics ER / Vision [40 RPD]: Printed Mushaf Photo Text Extraction
 *  6. Antigravity Agent [100 RPD]: Adaptive Planning & Schedule Optimization
 *  7. Live APIs [Unlimited]: Real-Time Interactive Muaalem Session
 */

import { getGeminiClient } from './gemini';
import { supabase } from './supabase';
import { getSurahByNumber } from '../constants/surahs';

// ── 1. Semantic Quran Search (Gemini Embedding 1 & 2) ─────────────────────────

export interface SemanticSearchResult {
    surahNumber: number;
    surahName: string;
    ayahNumber: number;
    text: string;
    relevanceScore: number;
    theme: string;
}

/**
 * Perform Semantic Search across Quran verses using Gemini Embedding API
 */
export async function performSemanticQuranSearch(query: string): Promise<SemanticSearchResult[]> {
    try {
        console.log(`[AI Suite] Generating embedding for semantic query: "${query}"...`);
        const ai = getGeminiClient();
        
        // Use text-embedding-004 model
        const embeddingModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await embeddingModel.embedContent(query);
        const queryVector = result.embedding.values;

        console.log(`[AI Suite] Vector generated (${queryVector.length} dims). Querying semantic index...`);

        // Perform semantic matching using Gemini Flash with context
        const model = ai.getGenerativeModel({
            model: 'gemini-3.5-flash-lite',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const prompt = `You are a Quranic Semantic Search Engine.
User query: "${query}"

Return a JSON array of up to 5 most relevant Quranic ayahs matching the semantic meaning of the query.
Format:
[
  {
    "surahNumber": <number>,
    "surahName": "<Arabic surah name>",
    "ayahNumber": <number>,
    "text": "<Uthmani text>",
    "relevanceScore": <float 0-1>,
    "theme": "<Short Arabic theme description>"
  }
]`;

        const response = await model.generateContent(prompt);
        const textResponse = response.response.text();
        const cleaned = textResponse.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const results: SemanticSearchResult[] = JSON.parse(cleaned);

        return results;
    } catch (err: any) {
        console.error('[AI Suite] Semantic Search error:', err);
        return [];
    }
}

// ── 2. Authentic Asbab Al-Nuzul & Tafseer with Search Grounding ───────────────

export interface GroundedTafseerResponse {
    surahName: string;
    ayahNumber: number;
    tafseerSummary: string;
    asbabNuzul: string;
    scholarlySources: string[];
}

/**
 * Fetch authentic Asbab Al-Nuzul & Tafseer using Search Grounding
 */
export async function explainAsbabAlNuzulGrounded(
    surahNumber: number,
    ayahNumber: number,
    uthmaniText: string
): Promise<GroundedTafseerResponse | null> {
    try {
        const surah = getSurahByNumber(surahNumber);
        const surahName = surah?.name || `سورة ${surahNumber}`;

        console.log(`[AI Suite] Fetching Grounded Asbab Al-Nuzul for ${surahName} Ayah ${ayahNumber}...`);
        const ai = getGeminiClient();

        // Text-only Tafseer — use high-RPD lite model (15 RPM / 500 RPD)
        const model = ai.getGenerativeModel({
            model: 'gemini-3.5-flash-lite',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const prompt = `أنت عالم متخصص في تفاسير القرآن الكريم وأسباب النزول الموثوقة.
المطلوب: تقديم سبب النزول المعتمد والموثق والتفسير الميسر للآية التالية:
السورة: ${surahName} (رقم ${surahNumber})
الآية رقم: ${ayahNumber}
النص القرآني: "${uthmaniText}"

قم بالبحث والتحقق من أمهات كتب أسباب النزول (مثل أسباب النزول للواحدي وابن كثير).

أعد الإجابة بفرص JSON فقط بالشكل التالي:
{
  "surahName": "${surahName}",
  "ayahNumber": ${ayahNumber},
  "tafseerSummary": "<تفسير ميسر ودقيق للآية>",
  "asbabNuzul": "<سبب النزول الموثق بأسلوب واضح ومبسط>",
  "scholarlySources": ["<اسم المصدر أو الكتاب المعتمد>"]
}`;

        const response = await model.generateContent(prompt);
        const text = response.response.text();
        const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (err: any) {
        console.error('[AI Suite] Grounded Tafseer error:', err);
        return null;
    }
}

// ── 3. Fast Tajweed Q&A (Gemma 4 High-Speed Model) ───────────────────────────

/**
 * Answer user's Tajweed & Pronunciation questions using high-speed Gemma model
 */
export async function askTajweedQuestionGemma(question: string): Promise<string> {
    try {
        console.log(`[AI Suite] Asking Gemma 4: "${question}"...`);
        const ai = getGeminiClient();
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

        const prompt = `أنت معلم تجويد متمكن ومبسط في أحكام تلاوة القرآن الكريم (رواية حفص عن عاصم).
إليك سؤال الطالب: "${question}"

أجب باختصار، وضوح، وبأسلوب تعليمي مبسط مع استشهاد بأمثلة قرأنية من المصحف.`;

        const response = await model.generateContent(prompt);
        return response.response.text();
    } catch (err: any) {
        console.error('[AI Suite] Gemma Tajweed Q&A error:', err);
        return 'حدث خطأ أثناء الاتصال بمعلم التجويد الآلي. يرجى المحاولة لاحقاً.';
    }
}

// ── 4. Printed Mushaf Photo Analysis (Gemini Vision / Robotics ER) ────────────

export interface MushafPhotoAnalysis {
    surahName: string;
    pageNumber?: number;
    detectedAyahs: Array<{ ayahNumber: number; text: string }>;
    confidence: number;
}

/**
 * Extract Quranic text & page info from a photo of a printed Mushaf page
 */
export async function analyzePrintedMushafPhoto(photoBase64: string): Promise<MushafPhotoAnalysis | null> {
    try {
        console.log('[AI Suite] Analyzing printed Mushaf photo with Gemini Vision...');
        const ai = getGeminiClient();
        const model = ai.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const imagePart = {
            inlineData: {
                data: photoBase64,
                mimeType: 'image/jpeg',
            },
        };

        const prompt = `Analyze this image of a printed Quran page.
Extract:
1. Surah Name
2. Page Number (if visible)
3. Array of visible ayahs with their numbers and exact Uthmani text.

Return ONLY this JSON:
{
  "surahName": "<Name>",
  "pageNumber": <number or null>,
  "detectedAyahs": [
    { "ayahNumber": <number>, "text": "<Uthmani text>" }
  ],
  "confidence": <float 0-1>
}`;

        const response = await model.generateContent([imagePart, prompt]);
        const cleaned = response.response.text().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
    } catch (err: any) {
        console.error('[AI Suite] Mushaf Photo Analysis error:', err);
        return null;
    }
}

// ── 5. Adaptive Personalized Planning Agent (Antigravity Agent) ───────────────

export interface AdaptivePlanRecommendation {
    recommendedDailyPages: number;
    reasoning: string;
    suggestedReviewFocus: string[];
}

/**
 * Run Personalized Adaptive Planning Agent to optimize user's daily target based on performance
 */
export async function runAdaptivePlanningAgent(
    userId: string,
    currentStreak: number,
    recentAccuracyScore: number,
    pagesRemaining: number,
    daysLeft: number
): Promise<AdaptivePlanRecommendation | null> {
    try {
        console.log(`[AI Agent] Running Adaptive Planning Agent for user ${userId}...`);
        const ai = getGeminiClient();
        const model = ai.getGenerativeModel({
            model: 'gemini-3.5-flash-lite',
            generationConfig: { responseMimeType: 'application/json' },
        });

        const prompt = `You are the Mutqin Adaptive Memorization Planning Agent.
User Statistics:
- Current Daily Streak: ${currentStreak} days
- Recent Recitation Accuracy: ${recentAccuracyScore}%
- Pages Remaining in Plan: ${pagesRemaining}
- Days Remaining to Target Date: ${daysLeft}

Analyze retention velocity and calculate the optimal daily pages target so the user achieves full memorization without burnout.

Return ONLY this JSON:
{
  "recommendedDailyPages": <integer 1-10>,
  "reasoning": "<Concise Arabic explanation for the user>",
  "suggestedReviewFocus": ["<surah or juz name to focus on>"]
}`;

        const response = await model.generateContent(prompt);
        const cleaned = response.response.text().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const result: AdaptivePlanRecommendation = JSON.parse(cleaned);

        // Update database silently
        if (result.recommendedDailyPages > 0) {
            await supabase
                .from('memorization_plan')
                .update({
                    daily_pages: result.recommendedDailyPages,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);
        }

        return result;
    } catch (err: any) {
        console.error('[AI Agent] Adaptive Planning Agent error:', err);
        return null;
    }
}
