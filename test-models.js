const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBwFrGOBHJ3dar4QYL2riQANdrGytlhRHY"
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