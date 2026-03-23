const axios = require('axios');
const fs = require('fs');

// 1. ضع رمز الوصول (Access Token) الخاص بك هنا
const HF_TOKEN = "YOUR_API_KEY_HERE";

// 2. تم تحديث الرابط هنا ليعمل مع نظام التوجيه الجديد (Router) لعام 2026
const MODEL_URL = "https://router.huggingface.co/models/obadx/muaalem-model-v3_2";

async function query(filename) {
  try {
    if (!fs.existsSync(filename)) {
      throw new Error(`الملف ${filename} غير موجود.`);
    }

    const data = fs.readFileSync(filename);
    console.log(`جاري تحليل التلاوة من الملف: ${filename}...`);

    const response = await axios.post(MODEL_URL, data, {
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "audio/mpeg",
      },
    });

    return response.data;
  } catch (error) {
    // طباعة تفاصيل الخطأ في حالة حدوث مشكلة
    const errorData = error.response ? error.response.data : error.message;
    console.error("خطأ في الاتصال بالنموذج:");
    console.log(errorData);
  }
}

// 3. اسم الملف الخاص بك
query("recitation(1).mp3").then((result) => {
  if (result) {
    console.log("نتائج تحليل الفونيمات:");
    console.log(JSON.stringify(result, null, 2));
  }
});