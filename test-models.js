// SECURITY: API key must be provided via environment variable
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ GEMINI_API_KEY environment variable is not set.\n   Usage: GEMINI_API_KEY=your_key node test-models.js");
    process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function listModels() {
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("📋 الموديلات المتاحة لك:");
        if (data.models) {
            data.models.forEach(model => {
                // نفلتر فقط الموديلات التي تدعم 'generateContent'
                if (model.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- ${model.name.replace("models/", "")}`);
                }
            });
        } else {
            console.log("لم يتم العثور على موديلات، تأكد من صحة المفتاح.");
            console.log(data);
        }
    } catch (error) {
        console.error("خطأ في الاتصال:", error);
    }
}

listModels();