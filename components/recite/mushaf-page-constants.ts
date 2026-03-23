/**
 * components/recite/mushaf-page-constants.ts
 *
 * Shared constants for the Mushaf page rendering system.
 * Values mirror the original Java reference implementation.
 */

/** Mushaf paper background (from #fdf6e3 — reference Android crop logic). */
export const MUSHAF_BG = '#fdf6e3';

/** Highlight color for audio-driven active ayah (yellow, 35% opacity). */
export const HIGHLIGHT_AUDIO_COLOR = 'rgba(255, 235, 59, 0.35)';

/** Highlight for long-press / manually selected ayah (emerald 30% opacity). */
export const HIGHLIGHT_MANUAL_COLOR = 'rgba(52, 211, 153, 0.30)';

/** Corner radius for highlight boxes (matches Java: 10.0f). */
export const HIGHLIGHT_RADIUS = 10;

/** Color map for heatmap overlays (revision quality indicators). */
export const HEATMAP_COLOR_MAP: Record<string, string> = {
    red: 'rgba(239, 68, 68, 0.22)',
    orange: 'rgba(249, 115, 22, 0.22)',
    gold: 'rgba(234, 179, 8,  0.22)',
    green: 'rgba(34, 197, 94,  0.22)',
};
