/**
 * test-edge-function.js
 * اختبار Edge Function مباشرة
 */

// SECURITY: Credentials must be provided via environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.\n   Usage: SUPABASE_URL=https://... SUPABASE_ANON_KEY=ey... node test-edge-function.js");
    process.exit(1);
}

async function testEdgeFunction() {
    console.log('🔌 Testing Edge Function: generate-plan...\n');

    const body = {
        targetDate: '2027-01-01',
        age: 25,
        userId: 'test-user-123',
        qiraat: 'Hafs',
        userNotes: '',
        memorization_level: 'beginner',
        preferred_time_slot: 'morning',
        intensity: 'moderate',
    };

    try {
        const resp = await fetch(
            `${SUPABASE_URL}/functions/v1/generate-plan`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(body),
            }
        );

        const data = await resp.json();
        console.log(`HTTP Status: ${resp.status}`);

        if (resp.ok) {
            console.log('✅ Edge Function SUCCESS!');
            console.log(`   success: ${data.success}`);
            console.log(`   totalDays: ${data.totalDays}`);
            console.log(`   pagesPerDay: ${data.pagesPerDay}`);
            console.log(`   aiReasoning: ${data.aiReasoning}`);
            console.log(`   processingTimeMs: ${data.processingTimeMs}ms`);
        } else {
            console.error('❌ Edge Function FAILED:');
            console.error('   error:', data.error);
            console.error('   details:', data.details);
            console.error('   errorType:', data.errorType);
        }
    } catch (err) {
        console.error('❌ Network/connection error:', err.message);
    }
}

testEdgeFunction();
