---
title: Mushaf View Migration Plan
description: Detailed plan and architectural decisions for migrating to a Traditional Mushaf Page View.
---

# Mushaf Page View Migration Plan

This document outlines the strategy for transitioning the Mutqin App from a Verse List View to a Traditional Mushaf Page View (Madani Script), as requested.

## 1. Data Source for Pages
**Decision:** Use the **Quran.com API (v4)** or **King Fahd Glorious Qur'an Printing Complex** assets.
- **Reason:** High-quality images for the Hafs narration (Madani script) are standardized and widely available.
- **Implementation:**
    - Create a `PageImage` component that fetches images dynamically or from a local asset pack.
    - URL Pattern Example (Quran.com): `https://verses.quran.com/{recitation_id}/{surah_id}/{ayah_id}.png` (Note: This is for Verse Images).
    - **Better Source for Full Pages:** `https://static.quran.com/images/quran/width_{width}/page{page_number}.png`.
    - **Optimization:** Use `expo-file-system` to download and cache pages to `FileSystem.documentDirectory` to fetch them only once.

## 2. Coordinate Mapping (Highlighting & Audio Sync)
**Decision:** Use visual coordinate JSONs from open-source Quran projects.
- **Requirement:** To highlight verses on a static image, we need an $[x, y, width, height]$ map for every verse on every page.
- **Resource:** [GlobalQuran/quran-data](https://github.com/GlobalQuran/quran-data) or similar repositories providing `page_x.json`.
- **Logic:**
    - App loads `page_{n}.json`.
    - Values are typically in percentages or relative to a specific resolution (e.g., 1024 width).
    - **Scaling:** App calculates `scaleFactor = deviceScreenWidth / originalJsonWidth`.
    - **Highlight Overlay:** Render a `<View>` with `position: 'absolute'`, `backgroundColor: 'gold'`, `opacity: 0.3` using the scaled coordinates.

## 3. Navigation Logic (Right-to-Left Pager)
**Decision:** Use `react-native-pager-view` or `FlashList` with paging.
- **Library:** `react-native-pager-view` is the standard for book-like swiping.
- **Configuration:**
    - `initialPage`: 0 (RAM page) or calculated from Surah/Ayah.
    - **RTL Support:**
        - Ensure `layoutDirection` is handled. If the component doesn't natively support RTL flipping logic (start at right), we might need to invert the index: `index = 604 - pageNumber`.
- **State Management:**
    - `currentPage` state tracks the visible page.
    - On page change, play the audio for the *first verse* of that page (if auto-play is on) or update the "Current Surah/Ayah" header.

## 4. Shu'bah Specifics
**Decision:** Visual overlay of difference markers on standard Hafs pages.
- **Constraint:** High-quality digital page images specifically for *Shu'bah 'an 'Asim* are not readily available via public APIs with coordinate mapping.
- **Strategy:**
    - Display the **Standard Hafs Madani Page**.
    - Use the **Shu'bah Audio** (which we already have via `activeQiraat` in `SurahAudioPlayer`).
    - **Visual Indicators:** If a verse has a significant difference in Shu'bah (pronunciation or meaning), overlay a small marker (e.g., a colored dot) using a "Shu'bah Differences" dataset (which would need to be created or sourced).
    - **Future Proofing:** If a specific Shu'bah PDF/Image set becomes available, we can swap the image source URL.

## 5. Performance Strategy
**Decision:** Aggressive caching and windowing.
- **Image Loading:**
    - Use `expo-image` (more performant than React Native `<Image>`) with `cachePolicy: 'memory-disk'`.
    - Preload the *next* and *previous* page images only. Do not try to render a list of 604 heavy images.
- **Zooming:**
    - Use `react-native-gesture-handler`'s `PinchGestureHandler` wrapping the `PageImageView`.
    - **Android Texture Limits:** Be careful with image size (keep under 2048x2048 or use `resizeMethod='scale'`).
    - **Optimized Assets:** Request images with width ~1024px (sufficient for mobile), avoiding 4k images unless user zooms deep.

## Action Plan
1.  **Prototype Page View:** Create a new route `app/mushaf-reading.tsx`.
2.  **Integrate Pager:** install `react-native-pager-view`.
3.  **Fetch Assets:** Write a utility to fetch page images from `static.quran.com`.
4.  **Coordinate Overlay:** detailed task to parse and render verse highlights.
