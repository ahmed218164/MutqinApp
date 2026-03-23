export interface MutashabihatPair {
    ayah1: {
        surah: number;
        ayah: number;
        text: string;
    };
    ayah2: {
        surah: number;
        ayah: number;
        text: string;
    };
    similarity: string;
    differences: {
        word1: string;
        word2: string;
        position: number;
    }[];
}

const MUTASHABIHAT_DATABASE: MutashabihatPair[] = [
    {
        ayah1: { surah: 2, ayah: 2, text: 'ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ' },
        ayah2: { surah: 32, ayah: 2, text: 'تَنزِيلُ الْكِتَابِ لَا رَيْبَ فِيهِ مِن رَّبِّ الْعَالَمِينَ' },
        similarity: 'Both contain لَا رَيْبَ فِيهِ',
        differences: [
            { word1: 'ذَٰلِكَ الْكِتَابُ', word2: 'تَنزِيلُ الْكِتَابِ', position: 0 },
            { word1: 'هُدًى لِّلْمُتَّقِينَ', word2: 'مِن رَّبِّ الْعَالَمِينَ', position: 3 }
        ]
    },
    {
        ayah1: { surah: 15, ayah: 9, text: 'إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ' },
        ayah2: { surah: 36, ayah: 5, text: 'تَنزِيلَ الْعَزِيزِ الرَّحِيمِ' },
        similarity: 'Both discuss revelation/tanzeel',
        differences: [
            { word1: 'نَزَّلْنَا', word2: 'تَنزِيلَ', position: 0 }
        ]
    },
    {
        ayah1: { surah: 55, ayah: 13, text: 'فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ' },
        ayah2: { surah: 55, ayah: 16, text: 'فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ' },
        similarity: 'Exact same verse repeated multiple times in Surah Ar-Rahman',
        differences: []
    },
    {
        ayah1: { surah: 81, ayah: 27, text: 'إِنْ هُوَ إِلَّا ذِكْرٌ لِّلْعَالَمِينَ' },
        ayah2: { surah: 68, ayah: 52, text: 'وَمَا هُوَ إِلَّا ذِكْرٌ لِّلْعَالَمِينَ' },
        similarity: 'Very similar ending structure',
        differences: [
            { word1: 'إِنْ هُوَ', word2: 'وَمَا هُوَ', position: 0 }
        ]
    },
    {
        ayah1: { surah: 3, ayah: 18, text: 'شَهِدَ اللَّهُ أَنَّهُ لَا إِلَٰهَ إِلَّا هُوَ' },
        ayah2: { surah: 3, ayah: 2, text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ' },
        similarity: 'Both contain لَا إِلَٰهَ إِلَّا هُوَ',
        differences: [
            { word1: 'شَهِدَ اللَّهُ', word2: 'اللَّهُ', position: 0 }
        ]
    }
];

export function detectMutashabihat(
    surah: number,
    ayah: number,
    mistakeType: string
): MutashabihatPair | null {
    if (mistakeType !== 'confusion' && mistakeType !== 'word_swap') {
        return null;
    }

    for (const pair of MUTASHABIHAT_DATABASE) {
        if (
            (pair.ayah1.surah === surah && pair.ayah1.ayah === ayah) ||
            (pair.ayah2.surah === surah && pair.ayah2.ayah === ayah)
        ) {
            return pair;
        }
    }

    return null;
}

export function highlightDifferences(text: string, differences: { word1: string; word2: string; position: number }[]): string {
    return text;
}

export interface PlacementTestQuestion {
    surah: number;
    ayahStart: number;
    ayahEnd: number;
    difficulty: 'easy' | 'medium' | 'hard';
    category: string;
}

export const PLACEMENT_TEST_QUESTIONS: PlacementTestQuestion[] = [
    { surah: 1, ayahStart: 1, ayahEnd: 7, difficulty: 'easy', category: 'Al-Fatiha' },
    { surah: 112, ayahStart: 1, ayahEnd: 4, difficulty: 'easy', category: 'Short Surahs' },
    { surah: 113, ayahStart: 1, ayahEnd: 5, difficulty: 'easy', category: 'Short Surahs' },
    { surah: 114, ayahStart: 1, ayahEnd: 6, difficulty: 'easy', category: 'Short Surahs' },
    { surah: 2, ayahStart: 1, ayahEnd: 5, difficulty: 'medium', category: 'Al-Baqarah Opening' },
    { surah: 18, ayahStart: 1, ayahEnd: 10, difficulty: 'medium', category: 'Al-Kahf Opening' },
    { surah: 36, ayahStart: 1, ayahEnd: 12, difficulty: 'medium', category: 'Yasin Opening' },
    { surah: 67, ayahStart: 1, ayahEnd: 5, difficulty: 'easy', category: 'Al-Mulk Opening' },
    { surah: 55, ayahStart: 1, ayahEnd: 13, difficulty: 'hard', category: 'Ar-Rahman' },
    { surah: 56, ayahStart: 1, ayahEnd: 10, difficulty: 'hard', category: 'Al-Waqiah' }
];

export function generatePlacementTest(): PlacementTestQuestion[] {
    return PLACEMENT_TEST_QUESTIONS.slice(0, 5);
}

export interface PlacementTestResult {
    totalQuestions: number;
    correctAnswers: number;
    failedAyahs: {
        surah: number;
        ayah: number;
    }[];
    recommendedLevel: 'beginner' | 'intermediate' | 'advanced';
}

export function calculatePlacementResult(
    totalQuestions: number,
    correctAnswers: number,
    failedAyahs: { surah: number; ayah: number }[]
): PlacementTestResult {
    const percentage = (correctAnswers / totalQuestions) * 100;
    let recommendedLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';

    if (percentage >= 80) {
        recommendedLevel = 'advanced';
    } else if (percentage >= 50) {
        recommendedLevel = 'intermediate';
    }

    return {
        totalQuestions,
        correctAnswers,
        failedAyahs,
        recommendedLevel
    };
}
