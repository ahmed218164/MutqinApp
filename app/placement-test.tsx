import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import ModernBackground from '../components/ui/ModernBackground';
import Card from '../components/ui/Card';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
    generatePlacementTest,
    calculatePlacementResult,
    PlacementTestQuestion
} from '../lib/mutashabihat-engine';
import { ChevronLeft, CheckCircle2, XCircle } from 'lucide-react-native';

export default function PlacementTestScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [testStarted, setTestStarted] = React.useState(false);
    const [currentQuestion, setCurrentQuestion] = React.useState(0);
    const [questions] = React.useState<PlacementTestQuestion[]>(generatePlacementTest());
    const [answers, setAnswers] = React.useState<boolean[]>([]);
    const [failedAyahs, setFailedAyahs] = React.useState<{ surah: number; ayah: number }[]>([]);
    const [testComplete, setTestComplete] = React.useState(false);
    const [result, setResult] = React.useState<any>(null);

    function startTest() {
        setTestStarted(true);
    }

    function handleAnswer(passed: boolean) {
        const newAnswers = [...answers, passed];
        setAnswers(newAnswers);

        if (!passed) {
            const question = questions[currentQuestion];
            const ayahsFailed = [];
            for (let i = question.ayahStart; i <= question.ayahEnd; i++) {
                ayahsFailed.push({ surah: question.surah, ayah: i });
            }
            setFailedAyahs([...failedAyahs, ...ayahsFailed]);
        }

        if (currentQuestion < questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
        } else {
            finishTest(newAnswers);
        }
    }

    async function finishTest(finalAnswers: boolean[]) {
        const correctAnswers = finalAnswers.filter(a => a).length;
        const testResult = calculatePlacementResult(
            questions.length,
            correctAnswers,
            failedAyahs
        );

        setResult(testResult);
        setTestComplete(true);

        if (failedAyahs.length > 0 && user) {
            await injectFailedAyahsToReview();
        }
    }

    async function injectFailedAyahsToReview() {
        try {
            if (!user) return;

            const reviewEntries = failedAyahs.map(ayah => ({
                user_id: user.id,
                surah: ayah.surah,
                last_reviewed: new Date().toISOString().split('T')[0],
                next_review: new Date().toISOString().split('T')[0],
                mistake_count: 1,
            }));

            const { error } = await supabase
                .from('review_schedule')
                .upsert(reviewEntries, { onConflict: 'user_id,surah' });

            if (error) throw error;

            Alert.alert(
                'تمت الإضافة لقائمة المراجعة',
                `تمت إضافة ${failedAyahs.length} آية إلى جدول المراجعة المتباعدة.`
            );
        } catch (error) {
            console.error('Error injecting failed ayahs:', error);
        }
    }

    if (!testStarted) {
        return (
            <View style={styles.container}>
                <ModernBackground />
                <SafeAreaView style={styles.safeArea}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <ChevronLeft size={24} color={Colors.text.inverse} />
                    </TouchableOpacity>

                    <ScrollView contentContainerStyle={styles.introContent}>
                        <Text style={styles.title}>اختبار تحديد المستوى</Text>
                        <Text style={styles.subtitle}>
                            اختبر حفظك واعرف مستواكالحقيقي
                        </Text>

                        <Card style={styles.infoCard} variant="glass">
                            <Text style={styles.infoTitle}>ما هذا الاختبار؟</Text>
                            <Text style={styles.infoText}>
                                سيتم اختبار مستواك في حفظ القرآن الكريم من خلال 5 مقاطع من أجزاء مختلفة.
                            </Text>
                            <Text style={styles.infoText}>
                                الآيات التي تصعب عليك ستُضاف تلقائياً إلى جدول مراجعتك المتباعدة.
                            </Text>
                        </Card>

                        <Card style={styles.infoCard} variant="glass">
                            <Text style={styles.infoTitle}>هيكل الاختبار</Text>
                            <Text style={styles.infoText}>• 5 أسئلة</Text>
                            <Text style={styles.infoText}>• مزيج من السهل والمتوسط والصعب</Text>
                            <Text style={styles.infoText}>• من 5 إلى 10 دقائق تقريباً</Text>
                        </Card>

                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={startTest}
                        >
                            <Text style={styles.startButtonText}>ابدأ الاختبار</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    if (testComplete && result) {
        const percentage = (result.correctAnswers / result.totalQuestions) * 100;

        return (
            <View style={styles.container}>
                <ModernBackground />
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView contentContainerStyle={styles.resultsContent}>
                        <Text style={styles.title}>اكتمل الاختبار! 🎉</Text>

                        <Card style={styles.resultCard} variant="glass">
                            <Text style={styles.scoreText}>
                                {result.correctAnswers} / {result.totalQuestions}
                            </Text>
                            <Text style={styles.percentageText}>
                                {percentage.toFixed(0)}%
                            </Text>
                            <Text style={styles.levelText}>
                                المستوى: {result.recommendedLevel.toUpperCase()}
                            </Text>
                        </Card>

                        {result.failedAyahs.length > 0 && (
                            <Card style={styles.infoCard} variant="glass">
                                <Text style={styles.infoTitle}>تمت الإضافة للمراجعة</Text>
                                <Text style={styles.infoText}>
                                    تمت إضافة {result.failedAyahs.length} آية إلى قائمة المراجعة المتباعدة.
                                    راجعها بانتظام لتقوية حفظك.
                                </Text>
                            </Card>
                        )}

                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={() => router.replace('/(tabs)')}
                        >
                            <Text style={styles.startButtonText}>انتقل للوحة التحكم</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    const question = questions[currentQuestion];

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.progressBar}>
                    <View
                        style={[
                            styles.progressFill,
                            { width: `${((currentQuestion + 1) / questions.length) * 100}%` }
                        ]}
                    />
                </View>

                <ScrollView contentContainerStyle={styles.questionContent}>
                    <Text style={styles.questionNumber}>
                        السؤال {currentQuestion + 1} من {questions.length}
                    </Text>

                    <Card style={styles.questionCard} variant="glass">
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{question.difficulty}</Text>
                        </View>
                        <Text style={styles.categoryText}>{question.category}</Text>
                        <Text style={styles.passageText}>
                            سورة {question.surah} — الآية {question.ayahStart}
                            {question.ayahEnd > question.ayahStart && ` إلى ${question.ayahEnd}`}
                        </Text>
                        <Text style={styles.instructionText}>
                            هل تستطيع تلاوة هذا المقطع غيباً عن ظهر قلب؟
                        </Text>
                    </Card>

                    <View style={styles.answerButtons}>
                        <TouchableOpacity
                            style={[styles.answerButton, styles.yesButton]}
                            onPress={() => handleAnswer(true)}
                        >
                            <CheckCircle2 size={24} color={Colors.emerald[950]} />
                            <Text style={styles.answerButtonText}>نعم، أحفظها</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.answerButton, styles.noButton]}
                            onPress={() => handleAnswer(false)}
                        >
                            <XCircle size={24} color={Colors.neutral[950]} />
                            <Text style={styles.answerButtonText}>لا، أجد صعوبة</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    backButton: {
        padding: Spacing.lg,
    },
    introContent: {
        padding: Spacing.xl,
        paddingTop: 0,
    },
    questionContent: {
        padding: Spacing.xl,
    },
    resultsContent: {
        padding: Spacing.xl,
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    infoCard: {
        marginBottom: Spacing.lg,
    },
    infoTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.sm,
    },
    infoText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        marginBottom: Spacing.sm,
        lineHeight: Typography.fontSize.base * 1.5,
    },
    startButton: {
        backgroundColor: Colors.gold[500],
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        alignItems: 'center',
        marginTop: Spacing.xl,
    },
    startButtonText: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[950],
    },
    progressBar: {
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginHorizontal: Spacing.lg,
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.gold[500],
    },
    questionNumber: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        textAlign: 'center',
        marginTop: Spacing.lg,
        marginBottom: Spacing.md,
    },
    questionCard: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    badge: {
        backgroundColor: Colors.gold[500],
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        marginBottom: Spacing.md,
    },
    badgeText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[950],
        textTransform: 'uppercase',
    },
    categoryText: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    passageText: {
        fontSize: Typography.fontSize.lg,
        color: Colors.emerald[400],
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    instructionText: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.secondary,
        textAlign: 'center',
    },
    answerButtons: {
        gap: Spacing.md,
    },
    answerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        gap: Spacing.sm,
    },
    yesButton: {
        backgroundColor: Colors.emerald[400],
    },
    noButton: {
        backgroundColor: Colors.neutral[700],
    },
    answerButtonText: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.neutral[950],
    },
    resultCard: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
        padding: Spacing.xl,
    },
    scoreText: {
        fontSize: Typography.fontSize['4xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.gold[400],
        marginBottom: Spacing.sm,
    },
    percentageText: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.md,
    },
    levelText: {
        fontSize: Typography.fontSize.lg,
        color: Colors.emerald[400],
        fontWeight: Typography.fontWeight.bold,
    },
});
