/**
 * test-generate-plan.js
 * اختبار سريع لنموذج gemini-3.1-flash-lite-preview
 */

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBwFrGOBHJ3dar4QYL2riQANdrGytlhRHY";

async function testModel(modelName) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const prompt = `Age=25, target=2027-01-01, qiraat=Hafs, notes="none"
Return ONLY this JSON (no extra text):
{"pages_per_day":1.5,"review_frequency":7,"estimated_total_days":464,"reasoning":"optimal pace"}`;

    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 256,
        },
    };

    try {
        console.log(`🧠 Testing: ${modelName}...`);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await resp.json();

        if (!resp.ok) {
            console.error(`❌ HTTP ${resp.status}:`, data?.error?.message ?? JSON.stringify(data));
            return false;
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(jsonStr);

        console.log(`✅ ${modelName} SUCCESS:`);
        console.log(`   pages_per_day: ${parsed.pages_per_day}`);
        console.log(`   review_frequency: ${parsed.review_frequency}`);
        console.log(`   estimated_total_days: ${parsed.estimated_total_days}`);
        console.log(`   reasoning: ${parsed.reasoning}`);
        return true;
    } catch (err) {
        console.error(`❌ ${modelName} ERROR:`, err.message);
        return false;
    }
}

async function main() {
    const models = [
        'gemini-3.1-flash-lite-preview',
        'gemini-2.5-flash',
    ];

    for (const model of models) {
        const ok = await testModel(model);
        if (ok) {
            console.log(`\n✅ Best model to use: ${model}`);
            break;
        }
        console.log('');
    }
}

main();
