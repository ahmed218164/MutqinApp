/**
 * lib/cloze-test-engine.ts
 * ───────────────
 * Smart Mutashabihat Cloze / Missing Words Recitation Test Engine
 * 
 * Features:
 *  - Mutashabihat Spot-Testing: Detects and masks high-risk Mutashabihat words
 *  - Masks words based on difficulty level ('easy' | 'medium' | 'master')
 *  - Evaluates user recitation using Google AI Studio Gemini API
 *  - Validates missing words accuracy and reveals them dynamically
 *  - Awards XP and Mutashabihat Mastery Badges via Gamification engine
 */

import { getSurahByNumber, Surah } from '../constants/surahs';
import { checkRecitation, RecitationAssessment } from './gemini';
import { awardMutashabihatBadge } from './gamification';

export type ClozeDifficulty = 'easy' | 'medium' | 'master';

export interface MaskedWord {
    index: number;
    word: string;
    cleanWord: string;
    isMasked: boolean;
    isRevealed: boolean;
    isMutashabihat?: boolean;
    isCorrect?: boolean;
}

export interface ClozeAyahQuestion {
    surahNumber: number;
    surahName: string;
    ayahNumber: number;
    fullUthmaniText: string;
    words: MaskedWord[];
    maskedIndices: number[];
    hasMutashabihatTarget: boolean;
    difficulty: ClozeDifficulty;
}

export interface ClozeTestResult {
    score: number;
    passed: boolean;
    revealedWords: number;
    totalMaskedWords: number;
    mistakes: string[];
    xpAwarded?: number;
    badgeName?: string;
}

// Common Mutashabihat keywords that cause confusion across Surahs
const MUTASHABIHAT_KEYWORDS = [
    'خالدين', 'ابدا', 'سارعوا', 'وسارعوا', 'تنزیل', 'تنزیلا',
    'ايات', 'لايه', 'لايات', 'يقولون', 'ويقولون', 'جنات',
    'تحتها', 'الانهار', 'ذلك', 'الكتاب', 'السموات', 'والارض',
    'ربكم', 'ربهم', 'واذ', 'قلنا', 'قالت', 'عليما', 'حكيما',
    'غفورا', 'رحيما', 'عزيزا', 'حكيما'
];

/**
 * Clean Arabic diacritics for accurate word comparison.
 */
export function stripTashkeel(text: string): string {
    return text
        .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, '') // remove harakat & Quranic marks
        .replace(/[أإآء]/g, 'ا')
        .replace(/ة/g, 'ه')
        .trim();
}

/**
 * Generate a Missing Words Question for a given Surah and Ayah with Mutashabihat targeting.
 */
export function generateClozeQuestion(
    surahNumber: number,
    ayahNumber: number,
    uthmaniText: string,
    difficulty: ClozeDifficulty = 'medium'
): ClozeAyahQuestion {
    const surah = getSurahByNumber(surahNumber);
    const rawWords = uthmaniText.split(/\s+/).filter(Boolean);

    let hasMutashabihatTarget = false;

    const words: MaskedWord[] = rawWords.map((w, idx) => {
        const clean = stripTashkeel(w);
        const isMutashabihat = MUTASHABIHAT_KEYWORDS.some(k => clean.includes(k) || k.includes(clean));
        if (isMutashabihat) hasMutashabihatTarget = true;

        return {
            index: idx,
            word: w,
            cleanWord: clean,
            isMasked: false,
            isRevealed: false,
            isMutashabihat,
        };
    });

    const totalWords = words.length;
    const maskedIndices: number[] = [];

    // Priority 1: Target Mutashabihat words first if present
    const mutashabihatIndices = words
        .filter(w => w.isMutashabihat && w.cleanWord.length > 2)
        .map(w => w.index);

    if (mutashabihatIndices.length > 0) {
        maskedIndices.push(...mutashabihatIndices.slice(0, difficulty === 'master' ? 4 : 2));
    }

    // Fill remaining masked slots based on difficulty
    if (totalWords > 0 && maskedIndices.length === 0) {
        if (difficulty === 'easy') {
            maskedIndices.push(totalWords - 1);
        } else if (difficulty === 'medium') {
            const count = Math.min(2, Math.max(1, Math.floor(totalWords / 3)));
            const step = Math.floor(totalWords / (count + 1));
            for (let i = 1; i <= count; i++) {
                const targetIdx = Math.min(totalWords - 1, i * step);
                if (!maskedIndices.includes(targetIdx)) {
                    maskedIndices.push(targetIdx);
                }
            }
        } else if (difficulty === 'master') {
            for (let i = 0; i < totalWords; i++) {
                if (words[i].cleanWord.length > 2 && (i % 2 === 1 || i === totalWords - 1)) {
                    if (!maskedIndices.includes(i)) maskedIndices.push(i);
                }
            }
        }
    }

    maskedIndices.forEach(idx => {
        if (words[idx]) {
            words[idx].isMasked = true;
        }
    });

    return {
        surahNumber,
        surahName: surah?.name || `سورة ${surahNumber}`,
        ayahNumber,
        fullUthmaniText: uthmaniText,
        words,
        maskedIndices,
        hasMutashabihatTarget,
        difficulty,
    };
}

/**
 * Evaluate user's audio recitation against the Cloze Question using Google AI Studio
 * and award Gamification badges + XP when passed.
 */
export async function evaluateClozeRecitation(
    audioBase64: string,
    question: ClozeAyahQuestion,
    userId?: string
): Promise<ClozeTestResult> {
    console.log(`[Mutashabihat Cloze Engine] Evaluating recitation for ${question.surahName} Ayah ${question.ayahNumber}...`);

    // Call Google AI Studio Gemini API
    const assessment: RecitationAssessment = await checkRecitation(
        audioBase64,
        question.fullUthmaniText
    );

    if (assessment.error) {
        return {
            score: 0,
            passed: false,
            revealedWords: 0,
            totalMaskedWords: question.maskedIndices.length,
            mistakes: [assessment.error],
        };
    }

    const mistakes = assessment.mistakes.map(m => m.text || m.description || '');
    const score = Math.max(0, Math.min(100, Math.round(assessment.score || 0)));
    const passed = score >= 75;

    // Check if any of the masked words were specifically flagged as mistakes
    let correctMaskedCount = 0;
    question.maskedIndices.forEach(idx => {
        const masked = question.words[idx];
        const hasMistakeOnWord = mistakes.some(m =>
            stripTashkeel(m).includes(masked.cleanWord) || masked.cleanWord.includes(stripTashkeel(m))
        );

        if (!hasMistakeOnWord && passed) {
            masked.isRevealed = true;
            masked.isCorrect = true;
            correctMaskedCount++;
        } else {
            masked.isCorrect = false;
        }
    });

    // Gamification & Badges
    let xpAwarded: number | undefined;
    let badgeName: string | undefined;

    if (passed && userId) {
        const reward = await awardMutashabihatBadge(userId, score);
        if (reward) {
            xpAwarded = reward.xpAwarded;
            badgeName = reward.badgeName;
        }
    }

    return {
        score,
        passed,
        revealedWords: correctMaskedCount,
        totalMaskedWords: question.maskedIndices.length,
        mistakes,
        xpAwarded,
        badgeName,
    };
}
