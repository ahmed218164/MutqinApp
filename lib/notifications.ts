import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export interface NotificationSettings {
    dailyReminder: boolean;
    dailyReminderTime: string; // HH:mm format
    reviewReminders: boolean;
    achievementNotifications: boolean;
}

// ─── Smart Notification Message Engine ─────────────────────────────────────

export interface UserContext {
    name?: string;
    streak?: number;
    dueReviews?: number;
    currentSurah?: string;
    dailyPages?: number;
    totalDaysLeft?: number;
}

/**
 * Returns a personalized notification title + body based on the user's current context.
 * Rotates through 4 pool categories so the message is never the same two days in a row.
 */
export function buildSmartNotification(ctx: UserContext, seed: number = Date.now()): {
    title: string;
    body: string;
} {
    const name   = ctx.name         ?? 'أخي الحافظ';
    const streak = ctx.streak       ?? 0;
    const due    = ctx.dueReviews   ?? 0;
    const surah  = ctx.currentSurah ?? 'وردك اليومي';
    const pages  = ctx.dailyPages   ?? 1;
    const hour   = new Date().getHours();

    // Time of day buckets
    const isFajr    = hour >= 4  && hour < 7;
    const isMorning = hour >= 7  && hour < 12;
    const isAfter   = hour >= 12 && hour < 17;
    const isEvening = hour >= 17 && hour < 21;
    // isNight = everything else (21-4)

    // ── Pool A: Streak-based ─────────────────────────────────────────────────
    const streakPool =
        streak === 0 ? [
            { title: '🌱 ابدأ رحلتك اليوم',        body: `يا ${name}، كل حافظ بدأ بخطوة واحدة. ورد اليوم بانتظارك! 📖` },
            { title: '🕌 لحظة تغيّر مسارك',        body: `افتح التطبيق الآن وابدأ حفظ سورة ${surah}. أنت تستطيع!` },
        ] : streak < 3 ? [
            { title: `🔥 ${streak} أيام متتالية!`, body: `أحسنت يا ${name}! لا تُوقف سلسلتك. ورد اليوم ينتظرك 💚` },
            { title: '💪 أنت في البداية الصحيحة', body: `${streak} أيام من الالتزام. استمر والعادة ستبنيها تلقائياً!` },
        ] : streak < 7 ? [
            { title: `🌙 ${streak} أيام — أروع!`,  body: `يا ${name}، لا تدع ورد ${surah} يفوتك اليوم 🌟` },
            { title: '⭐ مسيرة رائعة تتشكّل',      body: `${streak} أيام متتالية. الجنة تشهد على همّتك يا ${name}!` },
        ] : streak < 30 ? [
            { title: `🏆 ${streak} يوم بلا انقطاع!`, body: `يا ${name}، أنت في زمرة المجدّين. ورد اليوم: ${pages} صفحات 📖` },
            { title: `🔥 السلسلة لا تتوقف — ${streak} يوم`, body: `كل يوم تحفظه يُكتب لك. أتمم ورد ${surah} واكسب نقاطك! 🎯` },
        ] : [
            { title: `🌟 ${streak} يوم — ماشاء الله!`, body: `يا ${name}، شهر كامل من الالتزام! هذا دأب الصالحين 🤲` },
            { title: `👑 ${streak} يوم من عهد مع القرآن`, body: `لا تكسر ما بنيته. ورد اليوم خطوة أخرى نحو الختم يا ${name}!` },
        ];

    // ── Pool B: Due reviews ──────────────────────────────────────────────────
    const reviewPool =
        due === 0 ? [
            { title: '✅ لا مراجعات متأخرة!',        body: `أنت على القمة يا ${name}. ابدأ ورد الحفظ الجديد لسورة ${surah} 📖` },
            { title: '🎯 صفر تأخيرات — رائع!',       body: `يا ${name}، كل مراجعاتك محدّثة. الآن وقت حفظ جديد! 💪` },
        ] : due <= 3 ? [
            { title: `📚 ${due} مراجعات في انتظارك`, body: `مراجعة سريعة وتنتهي! لا تترك ما حفظته يُنسى يا ${name} 💫` },
            { title: '🔄 راجع لتُثبّت',             body: `${due} سور تحتاج مراجعتك. كل مراجعة تُرسّخ الحفظ أعمق 🌿` },
        ] : due <= 10 ? [
            { title: `⚠️ ${due} مراجعات مستحقة`,    body: `يا ${name}، لا تدع المراجعات تتراكم! ربع ساعة تُغني الكثير 💡` },
            { title: '🕐 وقتك الآن قبل فوات الأوان', body: `${due} سور بانتظار مراجعتها. ابدأ الآن! 🎯` },
        ] : [
            { title: `🚨 ${due} مراجعات متراكمة!`,   body: `يا ${name}، ابدأ بأصعبها لتشعر بالإنجاز 💪` },
            { title: '🧠 الدماغ ينسى بسرعة',         body: `${due} مراجعات مستحقة. كل تأخير يُضاعف الجهد لاحقاً!` },
        ];

    // ── Pool C: Time-of-day ───────────────────────────────────────────────────
    const timePool = isFajr ? [
        { title: '🌅 بركة الفجر',                   body: `يا ${name}، هذا أفضل وقت للحفظ! ورد ${surah} الآن والبركة معك 🤲` },
        { title: '✨ الفجر والقرآن — هِبةٌ إلهية',  body: `«إن قرآن الفجر كان مشهودًا». ابدأ وردك الآن يا ${name}!` },
    ] : isMorning ? [
        { title: '☀️ صباح القرآن أحلى',             body: `يا ${name}، الذهن صافٍ والبركة في الصباح. افتح سورة ${surah} 📖` },
        { title: '🌤️ الصباح لمن يبادر',             body: `لا شيء أجمل من بدء يومك بكلام الله. ${pages} صفحات فقط!` },
    ] : isAfter ? [
        { title: '🌞 استراحة الظهر مع القرآن',       body: `يا ${name}، خُذ استراحتك مع ورد ${surah}. دقائق تُريح القلب 💚` },
        { title: '📖 وسط اليوم — فرصة ذهبية',       body: `قبل أن يمر اليوم، اغتنم دقائق لحفظك يا ${name}! 💫` },
    ] : isEvening ? [
        { title: '🌆 المساء والورد اليومي',           body: `يا ${name}، لم يبقَ كثير من اليوم. أتمم ورد ${surah} قبل الغروب 🌅` },
        { title: '🌙 قبل أن يمضي اليوم',             body: `ورد اليوم لم يكتمل بعد يا ${name}. ${pages} صفحات وتنتهي! 🎯` },
    ] : /* night */ [
        { title: '🌙 الليل والقرآن',                  body: `يا ${name}، الليل هدوء والقرآن نور. ختم يومك بورد ${surah} 🌟` },
        { title: '⭐ لا يغيب النجم ولا يُنسى الورد', body: `قبل أن تنام يا ${name}، أتمم وردك. النوم بعد القرآن أطيب! 💤` },
    ];

    // ── Pool D: Progress milestone ────────────────────────────────────────────
    const milestonePool = ctx.totalDaysLeft ? [
        { title: `⏳ ${ctx.totalDaysLeft} يوم حتى الختم`,    body: `يا ${name}، أنت قريب! كل يوم يُقرّبك خطوة. لا تتوقف 🏁` },
        { title: '📅 رحلتك تقترب من نهايتها',               body: `${ctx.totalDaysLeft} يوم متبقي للختم. ورد ${surah} اليوم خطوة نحو الهدف! 🎯` },
    ] : null;

    // ── Pick pool for today, rotate message within pool by streak ─────────────
    const dayOfYear = Math.floor(seed / 86400000); // changes each day
    const pools = [...(milestonePool ? [milestonePool] : []), streakPool, reviewPool, timePool];
    const pool  = pools[dayOfYear % pools.length];
    const msg   = pool[streak % pool.length] ?? pool[0];

    return { title: msg.title, body: msg.body };
}

// ─── Request notification permissions ───────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
    // Only register on physical devices (push tokens don't work on emulators)
    if (!Device.isDevice) return null;

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') return null;

        // Android notification channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('mutqin-reminders', {
                name: 'تذكيرات مُتقِن',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#059669',
                sound: 'default',
            });
        }

        const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
        if (!projectId) return null;
        return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
        console.error('خطأ في إعداد الإشعارات:', e);
        return null;
    }
}

// ─── Save push token ─────────────────────────────────────────────────────────
export async function savePushToken(userId: string, token: string) {
    try {
        await supabase.from('push_tokens').upsert({
            user_id: userId, token, platform: Platform.OS,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform' });
    } catch (e) {
        console.error('خطأ في حفظ التوكن:', e);
    }
}

// ─── Schedule smart daily reminder ───────────────────────────────────────────
let _lastTime: string | null = null;
let _lastHash: string | null = null;

export async function scheduleDailyReminder(time: string, ctx: UserContext = {}) {
    const hash = JSON.stringify({ time, streak: ctx.streak, due: ctx.dueReviews });
    if (_lastTime === time && _lastHash === hash) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    const [hours, minutes] = time.split(':').map(Number);
    const { title, body }  = buildSmartNotification(ctx);

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title, body, sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                data: { type: 'daily_reminder' },
            },
            trigger: {
                hour: hours, minute: minutes,
                repeats: true, channelId: 'mutqin-reminders',
            },
        });
        _lastTime = time;
        _lastHash = hash;
        console.log(`✅ تذكير ذكي مجدول: "${title}"`);
    } catch (e) {
        console.error('خطأ في جدولة التذكير:', e);
    }
}

// ─── Send review reminder (smart, rotated) ────────────────────────────────────
export async function sendReviewReminder(surahName: string, daysUntilReview: number) {
    const pool = [
        { title: '🔄 واجب المراجعة',           body: `سورة ${surahName} على وشك أن تُنسى! راجعها قبل ${daysUntilReview} أيام 📖` },
        { title: '📚 لا تدع الحفظ يذبل',        body: `${surahName} — آخر موعد مراجعة خلال ${daysUntilReview} أيام. كل دقيقة تُفيدك! 💡` },
        { title: '⏰ تنبيه: مراجعة مستحقة',     body: `راجع سورة ${surahName} اليوم قبل أن تحتاج وقتاً أطول لإعادة حفظها 🧠` },
        { title: '🌿 المراجعة سرّ الثبات',      body: `لا يخسر الحافظ إلا بتركه المراجعة. راجع ${surahName} الآن! 💚` },
    ];
    const msg = pool[new Date().getDate() % pool.length];
    await Notifications.scheduleNotificationAsync({
        content: { ...msg, sound: true, data: { type: 'review_reminder', surahName } },
        trigger: null,
    });
}

// ─── Send achievement notification (rotated) ─────────────────────────────────
export async function sendAchievementNotification(
    achievementName: string,
    description: string,
    xpEarned: number,
) {
    const pool = [
        { title: `🏆 إنجاز جديد: ${achievementName}!`, body: `${description} — ربحت ${xpEarned} نقطة! استمر في التألق 🌟` },
        { title: `✨ ${achievementName} — تهانينا!`,    body: `${description}. +${xpEarned} XP أُضيفت لرصيدك! 🎉` },
        { title: `🥇 ${achievementName}`,               body: `حققت إنجازاً جديداً! ${description} — +${xpEarned} XP 💚` },
        { title: `🎖️ أحسنت يا حافظ!`,                  body: `${achievementName}: ${description}. +${xpEarned} XP 🔥` },
    ];
    const msg = pool[xpEarned % pool.length];
    await Notifications.scheduleNotificationAsync({
        content: { ...msg, sound: true, data: { type: 'achievement', achievementName } },
        trigger: null,
    });
}

// ─── Send surah completion notification (rotated) ────────────────────────────
export async function sendGoalCompletionNotification(surahName: string) {
    const pool = [
        { title: '🎉 بارك الله فيك!',           body: `أتممت حفظ سورة ${surahName}! إنجاز عظيم يستحق الاحتفال 🌹` },
        { title: `🌟 ماشاء الله — ${surahName}`, body: `انتهيت من حفظ ${surahName}! أضفتها لكنزك الأبدي. استمر! 💚` },
        { title: `📖 ${surahName} في قلبك للأبد`, body: `ما شاء الله! حفظت ${surahName} كاملة. السورة التالية في انتظارك 🚀` },
        { title: '🤲 الله يتقبّل منك',           body: `أتممت سورة ${surahName}. هنيئاً لك بهذا الإنجاز العظيم!` },
        { title: `💎 ${surahName} — دُرّة في صدرك`, body: `من ختم سورة بإتقان فقد أوتي كنزاً. تهانينا يا حافظ القرآن! 🌙` },
    ];
    const msg = pool[new Date().getDay() % pool.length];
    await Notifications.scheduleNotificationAsync({
        content: { ...msg, sound: true, data: { type: 'goal_completion', surahName } },
        trigger: null,
    });
}

// ─── Cancel all notifications ─────────────────────────────────────────────────
export async function cancelAllNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── Get notification settings ────────────────────────────────────────────────
export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('notification_settings')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        return data?.notification_settings || _defaultSettings();
    } catch {
        return _defaultSettings();
    }
}

function _defaultSettings(): NotificationSettings {
    return { dailyReminder: true, dailyReminderTime: '20:00', reviewReminders: true, achievementNotifications: true };
}

// ─── Save notification settings ───────────────────────────────────────────────
export async function saveNotificationSettings(
    userId: string,
    settings: NotificationSettings,
    userCtx: UserContext = {},
) {
    try {
        await supabase.from('user_settings').upsert({
            user_id: userId,
            notification_settings: settings,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        if (settings.dailyReminder) {
            await scheduleDailyReminder(settings.dailyReminderTime, userCtx);
        } else {
            await cancelAllNotifications();
        }
    } catch (e) {
        console.error('خطأ في حفظ إعدادات الإشعارات:', e);
    }
}
