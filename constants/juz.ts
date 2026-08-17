/**
 * constants/juz.ts
 *
 * Single source of truth for Juz page boundaries (standard 604-page Mushaf).
 * Previously duplicated in app/recite.tsx, components/recite/MushafPager.tsx
 * and components/recite/PlaybackScopeSheet.tsx.
 */

/** 1-indexed start page of each juz (1..30). */
export const JUZ_PAGES: number[] = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

/** Returns the juz (1..30) that contains the given page number. */
export function getJuzForPage(page: number): number {
    for (let j = JUZ_PAGES.length - 1; j >= 0; j--) {
        if (page >= JUZ_PAGES[j]) return j + 1;
    }
    return 1;
}

/** Returns the last page of the given juz (1..30). */
export function getJuzEndPage(juz: number): number {
    if (juz >= 30) return 604;
    return JUZ_PAGES[juz] - 1; // End page is the page before the next juz starts
}
