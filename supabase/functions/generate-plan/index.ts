// @ts-nocheck
// Supabase Edge Function: Generate Memorization Plan (Optimized)
// Deploy: supabase functions deploy generate-plan
// Note: This file runs in Deno runtime, not Node.js

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaceTemplate {
    pages_per_day: number;
    review_frequency: number;
    estimated_total_days: number;
    reasoning: string;
}

interface PlanDay {
    day: number;
    page_from: number;
    page_to: number;
    task_type: 'Memorize' | 'Review';
    estimated_time: number;
}

/**
 * Generate plan algorithmically from pace template
 * This prevents timeout issues and token exhaustion
 */
function generatePlanFromPace(
    pagesPerDay: number,
    reviewFrequency: number
): PlanDay[] {
    const plan: PlanDay[] = [];
    let currentPage = 1;
    let dayNumber = 1;
    const totalPages = 604;

    while (currentPage <= totalPages) {
        if (dayNumber % reviewFrequency === 0) {
            // Review day - review previous week's pages
            const reviewStart = Math.max(1, currentPage - Math.floor(pagesPerDay * (reviewFrequency - 1)));
            const reviewEnd = currentPage - 1;

            if (reviewEnd >= reviewStart) {
                plan.push({
                    day: dayNumber,
                    page_from: reviewStart,
                    page_to: reviewEnd,
                    task_type: 'Review',
                    estimated_time: Math.ceil((reviewEnd - reviewStart + 1) * 15), // 15 min per page for review
                });
            }
        } else {
            // Memorization day
            const endPage = Math.min(currentPage + Math.floor(pagesPerDay) - 1, totalPages);

            plan.push({
                day: dayNumber,
                page_from: currentPage,
                page_to: endPage,
                task_type: 'Memorize',
                estimated_time: Math.ceil((endPage - currentPage + 1) * 30), // 30 min per page for memorization
            });

            currentPage = endPage + 1;
        }

        dayNumber++;

        // Safety check to prevent infinite loops
        if (dayNumber > 2000) {
            console.warn('Plan generation exceeded 2000 days, breaking loop');
            break;
        }
    }

    return plan;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        console.log('✅ CORS preflight request handled');
        return new Response('ok', { headers: corsHeaders })
    }

    const startTime = Date.now();
    console.log('🚀 Edge Function: generate-plan started');

    try {
        console.log('📥 Request received, parsing body...');
        const { targetDate, age, userNotes, qiraat, userId } = await req.json()

        if (!targetDate || !age || !userId) {
            console.error('❌ Missing required parameters:', { targetDate, age, userId });
            throw new Error('Missing required parameters')
        }

        console.log(`📋 Generating plan for user ${userId}, age ${age}, target: ${targetDate}`);

        // Step 1: Ask AI for PACE TEMPLATE ONLY (small response, fast)
        const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY')!)

        // Model priority (based on actual free-tier quotas for this API key):
        //   gemini-3.1-flash-lite-preview → 500 RPD  ← best choice
        //   gemini-2.5-flash              →  20 RPD  ← fallback
        //   local algorithm               →   ∞      ← last resort
        const MODEL_CHAIN = [
            'gemini-3.1-flash-lite-preview',  // 500 req/day free ✅
            'gemini-2.5-flash',               // 20 req/day fallback
        ];

        let paceTemplate: PaceTemplate | null = null;
        let usedModel = '';

        for (const modelName of MODEL_CHAIN) {
            try {
                console.log(`🧠 Trying model: ${modelName}`);
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        responseMimeType: 'application/json',
                        maxOutputTokens: 512
                    }
                });

        const pacePrompt = `You are a Quran memorization expert. Analyze the user profile and return ONLY valid JSON.

User: age=${age}, target=${targetDate}, qiraat=${qiraat || 'Hafs'}, notes="${userNotes || 'none'}"

Rules:
- age<15: pages_per_day=1.0, age 15-25: 1.5, age 25-40: 1.0, age>40: 0.5
- review_frequency=7 (every 7th day is review)
- estimated_total_days = Math.ceil(604 / pages_per_day * 1.15)

Return ONLY this JSON (no extra text):
{"pages_per_day":1.5,"review_frequency":7,"estimated_total_days":464,"reasoning":"optimal pace for user"}`;

                const result = await model.generateContent([{ text: pacePrompt }]);
                const text = result.response.text().trim();
                // Strip markdown code fences if any
                const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
                paceTemplate = JSON.parse(jsonStr);
                usedModel = modelName;
                console.log(`✅ Model ${modelName} succeeded:`, paceTemplate);
                break; // success - exit loop
            } catch (modelErr: any) {
                console.warn(`⚠️ Model ${modelName} failed: ${modelErr.message}`);
                // continue to next model
            }
        }

        // If all AI models failed → use smart local fallback
        if (!paceTemplate) {
            console.warn('🔄 All AI models failed. Using algorithmic fallback.');
            const ageNum2 = Number(age);
            const pagesPerDay = ageNum2 < 15 ? 1.0 : ageNum2 < 25 ? 1.5 : ageNum2 < 40 ? 1.0 : 0.5;
            paceTemplate = {
                pages_per_day: pagesPerDay,
                review_frequency: 7,
                estimated_total_days: Math.ceil(604 / pagesPerDay * 1.15),
                reasoning: 'Calculated locally based on age profile',
            };
            usedModel = 'local-fallback';
        }

        console.log(`✅ Pace template (${usedModel}): ${paceTemplate.pages_per_day} pages/day`);
        console.log(`💡 Reasoning: ${paceTemplate.reasoning}`);

        // Step 2: Generate full plan algorithmically (fast, deterministic)
        console.log('⚙️ Algorithm started: Generating plan from pace template...');
        const plan = generatePlanFromPace(
            paceTemplate.pages_per_day,
            paceTemplate.review_frequency
        );

        console.log(`📊 Generated ${plan.length} days`);

        // Step 3: Store plan in Supabase
        console.log('🔌 Initializing Supabase client with service role...');
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // Delete existing plan if any
        console.log('🗑️ Deleting existing plan for user:', userId);
        const { error: deleteError } = await supabaseClient
            .from('user_plans')
            .delete()
            .eq('user_id', userId)

        if (deleteError) {
            console.error('❌ Error deleting existing plan:', deleteError);
            // Continue anyway - user might not have a plan yet
        } else {
            console.log('✅ Existing plan deleted successfully');
        }

        // Convert to database format
        console.log(`📦 Converting ${plan.length} days to database format...`);
        const planRecords = plan.map((day) => ({
            user_id: userId,
            day_number: day.day,
            verses_range: {
                page_from: day.page_from,
                page_to: day.page_to
            },
            task_type: day.task_type,
            is_unlocked: day.day === 1, // Unlock day 1 automatically
        }))

        // Bulk insert (efficient)
        console.log(`💾 Database insert started: Inserting ${planRecords.length} records...`);
        const { error: insertError } = await supabaseClient
            .from('user_plans')
            .insert(planRecords)

        if (insertError) {
            console.error('❌ Database insert error:', insertError);
            console.error('Error details:', JSON.stringify(insertError, null, 2));
            throw new Error(`Database insert failed: ${insertError.message}`);
        }

        console.log('✅ Database insert completed successfully');

        const processingTime = Date.now() - startTime;
        console.log(`✅ Plan generation complete in ${processingTime}ms`);

        return new Response(
            JSON.stringify({
                success: true,
                totalDays: plan.length,
                pagesPerDay: paceTemplate.pages_per_day,
                reviewFrequency: paceTemplate.review_frequency,
                aiReasoning: paceTemplate.reasoning,
                processingTimeMs: processingTime,
                message: 'تم إنشاء خطة الحفظ بنجاح',
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            },
        )
    } catch (error: any) {
        const processingTime = Date.now() - startTime;
        console.error('❌ CRITICAL ERROR generating plan:', error);
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error(`Failed after ${processingTime}ms`);

        let errorMessage = 'فشل في إنشاء الخطة. يرجى المحاولة مرة أخرى.';
        let errorDetails = error.message || 'Unknown error';

        if (error.message?.includes('quota')) {
            errorMessage = 'تم تجاوز حد الاستخدام المسموح به. يرجى المحاولة لاحقاً.';
        } else if (error.message?.includes('timeout')) {
            errorMessage = 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.';
        } else if (error.message?.includes('Database')) {
            errorMessage = 'خطأ في قاعدة البيانات. يرجى المحاولة مرة أخرى.';
        } else if (error.message?.includes('GEMINI_API_KEY')) {
            errorMessage = 'خطأ في إعدادات الذكاء الاصطناعي.';
            errorDetails = 'Missing or invalid Gemini API key';
        }

        console.log('📤 Sending error response to client');
        return new Response(
            JSON.stringify({
                success: false,
                error: errorMessage,
                details: errorDetails,
                processingTimeMs: processingTime,
                errorType: error.constructor.name,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            },
        )
    }
})
