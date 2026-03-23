/**
 * components/recite/mushaf-page-types.ts
 *
 * Shared types for the MushafPage component family.
 */

export interface MushafPageProps {
    pageNumber: number;
    /** Currently audio-highlighted verse key e.g. "2:5". */
    highlightedVerseKey?: string;
    /** Long-press selected verse key. */
    longPressedVerseKey?: string;
    onVersePress?: (verseKey: string) => void;
    onVerseLongPress?: (verseKey: string) => void;
    immersive?: boolean;
    onImmersiveChange?: (v: boolean) => void;
    isActive?: boolean;
    nightMode?: boolean;
    heatmapData?: Record<string, string>;
}
