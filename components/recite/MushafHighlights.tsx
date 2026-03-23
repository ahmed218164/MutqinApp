/**
 * components/recite/MushafHighlights.tsx
 *
 * Pure rendering component for Mushaf ayah highlight overlays.
 * Handles audio highlights, manual long-press highlights, and heatmap overlays.
 *
 * Extracted from MushafPage.tsx for separation of concerns.
 *
 * Scaling formula (exact mirror of l4/a.java line 8-10):
 *   left   = (min_x * imgWidth)  / 1000
 *   top    = (min_y * imgHeight) / 1000
 *   width  = ((max_x - min_x) * imgWidth)  / 1000
 *   height = ((max_y - min_y) * imgHeight) / 1000
 */

import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { AyahBoundingBox, scaleCoord } from '../../lib/sqlite-db';
import {
    HIGHLIGHT_AUDIO_COLOR,
    HIGHLIGHT_MANUAL_COLOR,
    HIGHLIGHT_RADIUS,
    HEATMAP_COLOR_MAP,
} from './mushaf-page-constants';

interface MushafHighlightsProps {
    pageCoords: AyahBoundingBox[];
    imgWidth: number;
    imgHeight: number;
    highlightedVerseKey?: string;
    longPressedVerseKey?: string;
    heatmapData?: Record<string, string>;
}

/**
 * Renders one absolutely-positioned View per bounding box for a given verse key.
 * A single ayah can span multiple rows (multi-line), so we map over ALL matching boxes.
 */
function renderHighlightBoxes(
    pageCoords: AyahBoundingBox[],
    imgWidth: number,
    imgHeight: number,
    verseKey: string,
    color: string,
    layerKey: string,
): React.ReactNode[] {
    if (imgWidth === 0 || imgHeight === 0 || pageCoords.length === 0) return [];

    const [suraStr, ayaStr] = verseKey.split(':');
    const sura = parseInt(suraStr, 10);
    const aya = parseInt(ayaStr, 10);

    // Filter to only boxes belonging to this ayah on this page
    const boxes = pageCoords.filter(
        (b) => b.sura_number === sura && b.aya_number === aya
    );

    return boxes.map((box, i) => {
        // Apply RTL flip: left edge becomes `imgWidth - max_x`, right edge becomes `imgWidth - min_x`
        const left = imgWidth - scaleCoord(box.max_x, imgWidth);
        const top = scaleCoord(box.min_y, imgHeight);

        // Replicating Java's exact hit-edge mapping
        const rightEdge = imgWidth - scaleCoord(box.min_x, imgWidth);
        const width = rightEdge - left;
        const height = scaleCoord(box.max_y, imgHeight) - top;

        return (
            <Animated.View
                key={`${layerKey}-${verseKey}-${i}`}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(150)}
                style={{
                    position: 'absolute',
                    left,
                    top,
                    width,
                    height,
                    backgroundColor: color,
                    borderRadius: HIGHLIGHT_RADIUS,
                }}
            />
        );
    });
}

export default function MushafHighlights({
    pageCoords,
    imgWidth,
    imgHeight,
    highlightedVerseKey,
    longPressedVerseKey,
    heatmapData,
}: MushafHighlightsProps): React.ReactElement | null {
    const nodes: React.ReactNode[] = [];

    // Heatmap overlays (revision quality) — rendered first (lowest layer)
    if (heatmapData) {
        Object.entries(heatmapData).forEach(([key, colorName]) => {
            const c = HEATMAP_COLOR_MAP[colorName];
            if (c) {
                nodes.push(...renderHighlightBoxes(
                    pageCoords, imgWidth, imgHeight,
                    key, c, 'heatmap'
                ));
            }
        });
    }

    // Manual long-press highlight (emerald) — rendered below audio highlight
    // NOTE: shown even when it equals highlightedVerseKey so the user sees
    // confirmation that their long-press registered.
    if (longPressedVerseKey) {
        nodes.push(...renderHighlightBoxes(
            pageCoords, imgWidth, imgHeight,
            longPressedVerseKey,
            HIGHLIGHT_MANUAL_COLOR,
            'manual'
        ));
    }

    // Audio highlight (yellow) — rendered on top so it takes visual priority
    if (highlightedVerseKey) {
        nodes.push(...renderHighlightBoxes(
            pageCoords, imgWidth, imgHeight,
            highlightedVerseKey,
            HIGHLIGHT_AUDIO_COLOR,
            'audio'
        ));
    }

    // Return a View with absoluteFillObject so child absolute boxes anchor
    // correctly within the image coordinate space (Bug 3 fix).
    return <View style={StyleSheet.absoluteFillObject} pointerEvents="none">{nodes}</View>;
}
