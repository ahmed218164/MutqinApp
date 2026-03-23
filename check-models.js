const { GoogleGenerativeAI } = require("@google/generative-ai");

// ⚠️ ضع مفتاحك هنا
const API_KEY = "AIzaSyBwFrGOBHJ3dar4QYL2riQANdrGytlhRHY";
const genAI = new GoogleGenerativeAI(API_KEY);

async function runMedicalTest() {
    // استخدام الموديل اللي طلع عندك في التقرير بالضبط
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    const prompt = `
    بصفتك خبيراً في الطب وعلوم القرآن:
    1. اشرح باختصار آلية عمل "Action Potential" في خلايا القلب.
    2. استخرج حكماً تجويدياً واحداً من قول الله تعالى: "الرَّحْمَنُ عَلَى الْعَرْشِ اسْتَوَى".
  `;

    try {
        console.log("🚀 جاري الاتصال بـ Gemini 3 Pro Preview...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("\n--- ✨ نتيجة التحليل من Gemini 3 Pro ---");
        console.log(text);
        console.log("\n----------------------------------------");
        console.log("✅ تمت العملية بنجاح!");
        console.log("🔗 لمشاهدة الاستهلاك الآن، افتح: https://aistudio.google.com/app/plan");

    } catch (error) {
        console.error("🛑 حدث خطأ:", error.message);
    }
}

runMedicalTest();