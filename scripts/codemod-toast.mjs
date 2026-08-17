/**
 * scripts/codemod-toast.mjs
 *
 * Replaces notification-style Alert.alert calls with the new toast API.
 * True confirmations (multi-button) are intentionally kept as Alerts.
 * Each replacement is an exact source string — fails loudly if not found.
 */
import fs from 'node:fs';

const T = (rel, importLine) => ({ file: rel, importLine });

// [file, import line to add if missing, [ [exactOld, exactNew], ... ] ]
const JOBS = [
  {
    file: 'app/bookmarks.tsx',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('خطأ', result.error || 'فشل حذف الإشارة المرجعية');`,
       `toast.error(result.error || 'فشل حذف الإشارة المرجعية');`],
    ],
  },
  {
    file: 'app/notifications.tsx',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`if (token) Alert.alert('✅ تم', 'تم تفعيل الإشعارات بنجاح!');`,
       `if (token) toast.success('تم تفعيل الإشعارات بنجاح!');`],
      [`else Alert.alert('خطأ', 'تعذّر الحصول على إذن الإشعارات');`,
       `else toast.error('تعذّر الحصول على إذن الإشعارات');`],
    ],
  },
  {
    file: 'app/recite.tsx',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('خطأ', 'يجب تسجيل الدخول أولاً');`,
       `toast.error('يجب تسجيل الدخول أولاً');`],
      [`Alert.alert('خطأ', 'لم يتم الحصول على نتائج.');`,
       `toast.error('لم يتم الحصول على نتائج.');`],
      [`Alert.alert('خطأ في التحليل', aggregatedResult.error);`,
       `toast.error(aggregatedResult.error);`],
      [`Alert.alert('خطأ', 'فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.');`,
       `toast.error('فشل في تحليل التلاوة. يرجى المحاولة مرة أخرى.');`],
    ],
  },
  {
    file: 'app/search.tsx',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('✅ تم النسخ', \`تم نسخ \${results.length} آية\`);`,
       `toast.success(\`تم نسخ \${results.length} آية\`);`],
    ],
  },
  {
    file: 'components/dashboard/DailyWard.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      [`Alert.alert('مغلق', 'يجب إكمال الأوراد السابقة أولاً');`,
       `toast.info('يجب إكمال الأوراد السابقة أولاً');`],
    ],
  },
  {
    file: 'app/settings.tsx',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('خطأ', 'تعذّر مسح الذاكرة المؤقتة. حاول مرة أخرى.');`,
       `toast.error('تعذّر مسح الذاكرة المؤقتة. حاول مرة أخرى.');`],
      [`Alert.alert('خطأ', 'فشل تسجيل الخروج');`,
       `toast.error('فشل تسجيل الخروج');`],
    ],
  },
  {
    file: 'app/(tabs)/profile.tsx',
    imports: ["import { toast } from '../../components/ui/Toast';"],
    edits: [
      [`Alert.alert('خطأ', 'فشل توليد التقرير. يرجى المحاولة مرة أخرى.');`,
       `toast.error('فشل توليد التقرير. يرجى المحاولة مرة أخرى.');`],
    ],
  },
  {
    file: 'components/mushaf/BookmarkModal.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      [`Alert.alert('Success', 'Bookmark added successfully!');`,
       `toast.success('تمت إضافة الإشارة المرجعية بنجاح');`],
      [`Alert.alert('Error', result.error || 'Failed to add bookmark');`,
       `toast.error(result.error || 'فشل إضافة الإشارة المرجعية');`],
      [`Alert.alert('Error', 'Failed to add bookmark');`,
       `toast.error('فشل إضافة الإشارة المرجعية');`],
    ],
  },
  {
    file: 'components/mushaf/TafseerBottomSheet.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      ["Alert.alert('خطأ', `فشل تحميل التفسير: ${e?.message}`);",
       "toast.error(`فشل تحميل التفسير: ${e?.message}`);"],
    ],
  },
  {
    file: 'components/mushaf/TafsirDownloadModal.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      ["Alert.alert('خطأ في التنزيل', e?.message ?? 'فشل التنزيل. تحقق من الاتصال بالإنترنت.');",
       "toast.error(e?.message ?? 'فشل التنزيل. تحقق من الاتصال بالإنترنت.');"],
    ],
  },
  {
    file: 'components/recite/AyahContextMenu.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      [`Alert.alert('تم النسخ ✅', 'تم نسخ نص الآية');`,
       `toast.success('تم نسخ نص الآية');`],
    ],
  },
  {
    file: 'components/recite/ArcMenu.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      [`Alert.alert('تم النسخ', 'تم نسخ الآية إلى الحافظة');`,
       `toast.success('تم نسخ الآية إلى الحافظة');`],
    ],
  },
  {
    file: 'components/recite/ReciterDownloadSheet.tsx',
    imports: ["import { toast } from '../ui/Toast';"],
    edits: [
      ["Alert.alert('خطأ', `فشل التنزيل: ${e?.message}`);",
       "toast.error(`فشل التنزيل: ${e?.message}`);"],
      ["Alert.alert('خطأ', `فشل تنزيل السورة ${surah}: ${e?.message}`);",
       "toast.error(`فشل تنزيل السورة ${surah}: ${e?.message}`);"],
      ["Alert.alert('خطأ', `فشل تنزيل قاعدة التوقيت: ${e?.message}`);",
       "toast.error(`فشل تنزيل قاعدة التوقيت: ${e?.message}`);"],
    ],
  },
  {
    file: 'hooks/useVADRecorder.ts',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الميكروفون');`,
       `toast.error('يرجى السماح بالوصول إلى الميكروفون');`],
      [`Alert.alert('خطأ', 'فشل بدء التسجيل. حاول مرة أخرى.');`,
       `toast.error('فشل بدء التسجيل. حاول مرة أخرى.');`],
    ],
  },
  {
    file: 'hooks/useRecitationSync.ts',
    imports: ["import { toast } from '../components/ui/Toast';"],
    edits: [
      [`Alert.alert('تم الحفظ ✅', 'تم حفظ تقدمك! تمت إضافة نقاط XP 🎉');`,
       `toast.success('تم حفظ تقدمك! تمت إضافة نقاط XP 🎉');`],
      [`Alert.alert('خطأ', 'فشل حفظ النتائج. يرجى المحاولة مرة أخرى.');`,
       `toast.error('فشل حفظ النتائج. يرجى المحاولة مرة أخرى.');`],
    ],
  },
];

let applied = 0, failed = 0;
for (const job of JOBS) {
  let src = fs.readFileSync(job.file, 'utf8');

  for (const [oldStr, newStr] of job.edits) {
    const count = src.split(oldStr).length - 1;
    if (count === 0) {
      console.log(`MISSING in ${job.file}: ${oldStr.slice(0, 70)}...`);
      failed++;
      continue;
    }
    src = src.split(oldStr).join(newStr);
    applied++;
  }

  for (const imp of job.imports) {
    if (!src.includes(imp)) {
      // Insert after the last import line.
      const lines = src.split('\n');
      let lastImport = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImport = i;
      }
      if (lastImport >= 0) {
        lines.splice(lastImport + 1, 0, imp);
        src = lines.join('\n');
      } else {
        src = imp + '\n' + src;
      }
    }
  }

  fs.writeFileSync(job.file, src);
}

console.log(`\nApplied: ${applied} replacements | Missing: ${failed}`);
