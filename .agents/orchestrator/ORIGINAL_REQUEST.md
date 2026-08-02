# Original User Request

## Initial Request — 2026-08-02T00:21:24+01:00

# Teamwork Project Prompt — MutqinApp Development & AI Optimization

تطوير وتحديث تطبيق "مُتقِن" (MutqinApp): إلغاء HuggingFace واستبداله باستدعاء مباشر لنماذج Google AI Studio لتقييم التسميع الصوتي الفوري، الحفاظ الكامل على نظام تلاوة الشيوخ، تطوير الواجهات بهوية قرآنية زمردية فاخرة، ومعالجة أمان قواعد بيانات Supabase.

Working directory: c:\Users\ELBOSTAN\Desktop\MutqinApp
Integrity mode: development

## Requirements

### R1. Google AI Studio Direct API Recitation Engine (Replacing Hugging Face)
- إلغاء الاعتماد على خادم Hugging Face (`dr364873-tajweed-base.hf.space`) بالكامل لنظام التسميع نظراً لبطء التشغيل الكبيرة (3-5 دقائق).
- استبداله بالتحليل المباشر عبر API من Google AI Studio باستخدام مكتبة `@google/generative-ai` أو REST API مباشرة مع تحويل الصوت لـ Base64 واستخدام نماذج Gemini 2.5 Flash و Gemini 3.5 Flash للحصول على نتيجة التقييم والتجود في 1-2 ثانية فقط.

### R2. Preserving Existing Quran & Reciters Audio System
- الإبقاء الكامل على نظام تشغيل تلاوات الشيوخ الحالي (`lib/audio-engine.ts`, `lib/audio-reciters.ts`, `react-native-track-player`) لضمان تمكين المستخدم من الاستماع والتكرار والتنقل بين القراء بدون أي تعديل سلبي.

### R3. UI/UX Modernization & Islamic Emerald Aesthetic
- تطوير وتجميل واجهات التطبيق (الشاشة الرئيسية، المصحف، التسميع، إعداد الخطة) بهوية قرآنية راقية تعتمد على درجات الأخضر الزمردي الزاهي والداكن (`#10b981`, `#064e3b`, `#022c22`)، مع تحسين الخطوط والتلميحات البصرية والانتقالات السلسة.

### R4. Supabase MCP Database & Security Audit
- مراجعة جداول مشروع Supabase (`uolpnjnzshgfjanuruyc`) وتطبيق السياسات الأمنية (RLS) الموصى بها للجداول الأربعة (`profiles`, `daily_logs`, `mistake_log`, `qiraat_metadata`) لمنع الوصول غير المصرح به.

## Acceptance Criteria

### Technical & Performance
- [ ] التخلص الكامل من انتظار HuggingFace وإجراء التسميع بواسطة Google AI Studio في أقل من 3 ثوانٍ.
- [ ] عمل تشغيل الصوتيات وتلاوات القراء الحالية بكفاءة وتدفق سلس.
- [ ] معالجة تنبيهات RLS الأمنية في Supabase بإنشاء سياسات الوصول المناسبة.

### Design & User Experience
- [ ] تصميم بكتلة visual هادئة وفاخرة تليق بتطبيق قرآن كريم.
- [ ] استجابة فورية للواجهات وحظر أي تجميد للواجهة أو تسريب في الذاكرة.
