/**
 * test-edge-function.js
 * اختبار Edge Function مباشرة
 */

const SUPABASE_URL = 'https://uolpnjnzshgfjanuruyc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvbHBuam56c2hnZmphbnVydXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzQ4MzcsImV4cCI6MjA4NjMxMDgzN30.KQ1z1NEx8dGHPA3ZUIiuoQj8QhQSr_dIKpG71pRxJ2c';

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
