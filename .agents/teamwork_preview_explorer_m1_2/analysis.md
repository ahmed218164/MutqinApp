# Technical Analysis: Audio Engine Architecture & Recitation AI Coupling (Milestone 1)

**Target Milestone**: Milestone 1 (Recitation AI Engine & Audio Engine Preservation)  
**Investigator**: Teamwork Explorer (`teamwork_preview_explorer_m1_2`)  
**Date**: 2026-08-02  
**Scope**: `lib/audio-engine.ts`, `lib/audio-reciters.ts`, `lib/playback-service.ts`, `app/(tabs)/mushaf.tsx`, `app/recite.tsx`, `components/recite/*`, `hooks/useVADRecorder.ts`, `lib/muaalem-api.ts`, `lib/gemini.ts`.

---

## 1. Executive Summary

MutqinApp uses a **RNTP-powered dual-mode audio engine** (`react-native-track-player` v4) that natively handles Quran audio recitation streaming across ExoPlayer (Android) and AVQueuePlayer (iOS). Audio playback is completely decoupled at the data level from the AI evaluation engine, but shares critical **hardware audio session controls**, **user workflow states** (Listen vs Recite), and **verse range context** (reference text and Sheikh audio clips).

To ensure **zero regression** in Quran audio playback, reciter switching, and verse repetition when upgrading the recitation AI engine (replacing Hugging Face with Google AI Studio Gemini Flash API), all audio engine modules (`lib/audio-engine.ts`, `lib/audio-reciters.ts`, `lib/gapless-timing.ts`, `lib/playback-service.ts`) must remain untouched, and specific audio session recovery protocols must be maintained.

---

## 2. Audio Engine Architecture (`lib/audio-engine.ts`, `lib/audio-reciters.ts`)

### 2.1 Overview & Singleton Pattern
- **Core Singleton**: `AudioEngineCore` class exported as `audioEngine` singleton in `lib/audio-engine.ts:832`.
- **React External Store**: Uses React `useSyncExternalStore` in `useAudioEngine()` hook (`lib/audio-engine.ts:836-842`) to deliver atomic, memoized state updates to UI components without unnecessary re-renders.
- **Background Player Service**: Registered in `app/_layout.tsx` via `lib/playback-service.ts`, handling OS lock screen controls (`RemotePlay`, `RemotePause`, `RemoteNext`, `RemotePrevious`, `RemoteSeek`).

### 2.2 Dual Playback Modes

| Feature | Ayah-by-Ayah Mode (`audioType === 'ayah'`) | Gapless Mode (`audioType === 'gapless'`) |
| :--- | :--- | :--- |
| **Audio Format** | Individual per-verse MP3 files (`{SSSAAA}.mp3`) | Single full surah MP3 file (`{SSS}.mp3`) |
| **Queue Handling** | Pre-loads entire verse range into RNTP `Track[]` queue | Loads 1 single surah track into RNTP queue |
| **Verse Transition** | Native zero-gap transition handled on native OS thread | Timing DB ms lookup (`getVerseOffset`) + position polling |
| **Highlight Tracking** | Event listener `Event.PlaybackActiveTrackChanged` | 200ms `setInterval` polling `TrackPlayer.getProgress()` |
| **Seeking** | `TrackPlayer.skip(index)` | `TrackPlayer.seekTo(offsetMs / 1000)` |
| **CDN Source** | `storage.elmushaf.com/mushaf/audio/*_ayat/` | `storage.elmushaf.com/mushaf/audio/*_sura/` |

---

## 3. Function, State, Event, & Control Reference

### 3.1 Exposed State Shape (`AudioEngineState`)
Defined in `lib/audio-engine.ts:94-105`:
```typescript
export interface AudioEngineState {
    isPlaying: boolean;         // Active playback indicator
    isLoading: boolean;         // Buffering / queue loading indicator
    currentIndex: number;      // Current 0-based verse index relative to active range
    repeatMode: RepeatMode;     // 1 | 2 | 3 | 'inf'
    playbackSpeed: number;      // 0.75x, 1.0x, 1.25x, 1.5x
    ayahDelay: number;          // Per-verse pause delay in seconds (0..10s)
    didCompleteVerse: boolean;  // True when verse completes naturally (not user pause)
    isGaplessMode: boolean;     // True when active reciter uses surah-level gapless MP3
}
```

### 3.2 Key Core Functions

| Function Name | Location | Description |
| :--- | :--- | :--- |
| `setupPlayer()` | `lib/audio-engine.ts:45` | Initializes RNTP instance, capabilities (`Play`, `Pause`, `SkipToNext`, `SkipToPrevious`, `SeekTo`, `Stop`), and Android app killed playback behavior. Idempotent. |
| `configureAudioSession(force)` | `lib/audio-engine.ts:88` | Ensures TrackPlayer is setup after recording audio session release. |
| `configure(surahNumber, verses, reciter)` | `lib/audio-engine.ts:227` | Sets active surah, verse array, reciter; invalidates loaded queue state. |
| `play(index)` | `lib/audio-engine.ts:470` | Main playback entry point. Builds Track queue or gapless surah URI and starts playback. |
| `playNext()` | `lib/audio-engine.ts:559` | Advances to `currentIndex + 1` for learning mode progression. |
| `togglePlayback()` | `lib/audio-engine.ts:724` | Toggles play/pause state or triggers initial play if queue not loaded. |
| `skipNext()` / `skipPrev()` | `lib/audio-engine.ts:743` | Advances or rewinds verse; resets repeat counter. |
| `cycleRepeat()` | `lib/audio-engine.ts:771` | Cycles repeat mode through `[1, 2, 3, 'inf']`. |
| `cycleAyahDelay()` | `lib/audio-engine.ts:220` | Cycles per-ayah delay through `[0, 1, 2, 3, 5, 10]` seconds. |
| `setSpeed(speed)` | `lib/audio-engine.ts:778` | Updates playback rate via `TrackPlayer.setRate(speed)`. |
| `seekToVerse(index)` | `lib/audio-engine.ts:660` | Seeks to verse offset in gapless surah file. |
| `stop()` | `lib/audio-engine.ts:795` | Resets RNTP queue while preserving React `useSyncExternalStore` subscribers. |
| `destroy()` | `lib/audio-engine.ts:820` | Full teardown including listener removal (app shutdown only). |

### 3.3 Event Handling & Skip Reasoning
`onTrackChanged(data)` (`lib/audio-engine.ts:289`) disambiguates track change events using `lastSkipReason`:
1. `SkipReason = 'user'`: Triggered by explicit user tap/skip. Updates `_currentIndex` only.
2. `SkipReason = 'repeat'`: Triggered by repeat loop. Ignored to avoid duplicate counter increments.
3. `SkipReason = 'natural'`: Natural RNTP auto-advance. Triggers:
   - **Repeat Check**: If `_repeatCount < repeatLimit`, executes `TrackPlayer.skip(lastIndex)`.
   - **Learning Mode Check**: If `_learningMode` enabled, pauses player (`TrackPlayer.pause()`), sets `_didCompleteVerse = true`, and emits state to notify parent UI to trigger student recitation.
   - **Ayah Delay Check**: If `_ayahDelay > 0`, pauses player and schedules timer (`setTimeout`) for `_ayahDelay * 1000` ms before resuming (`TrackPlayer.play()`).

### 3.4 Expanded Reciter Library (`lib/audio-reciters.ts`)
- **Total Reciters**: 80+ reciters split into 57 `GAPLESS_RECITERS` (`audioType = 'gapless'`) and 35 `AYAH_RECITERS` (`audioType = 'ayah'`).
- **Qiraat Coverage**: Hafs (majority), Warsh (e.g. Yassin Al-Jazairi), Qaloon (e.g. Al-Tarabolsi), Shoba, Dory, Soosi.
- **Default Reciter**: Mishary Rashid Alafasy (`efassy_ayat`, Hafs, Ayah-by-Ayah).
- **CDN Sources**:
  1. `storage.elmushaf.com` (Primary CDN for 80+ reciters via `getStorageCdnUrl`).
  2. `cdn.islamic.network` (Secondary fallback).
  3. `quranapi.pages.dev` (API fallback).

---

## 4. Track Player UI Integration & Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ app/(tabs)/mushaf.tsx (Surah List)                                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ router.push({ pathname: '/recite' })
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ app/recite.tsx (Main Recite & Evaluation Screen)                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ MushafPager (Page Swipe & Ayah Highlighting)                            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ UnifiedAudioControl (Floating Sanctuary Dock)                           │ │
│ │   - Audio Mode: 'listen' | 'record' | 'closed'                          │ │
│ │   - Transports: Play/Pause, Skip, Speed, Repeat, Ayah Delay             │ │
│ │   - Ring Progress: RNTP useProgress(250)                                │ │
│ └────────────────────────────────────┬────────────────────────────────────┘ │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ Subscribes via useAudioEngine()
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ lib/audio-engine.ts (AudioEngineCore Singleton)                            │
│   - Controls react-native-track-player (ExoPlayer / AVQueuePlayer)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **`app/(tabs)/mushaf.tsx`**: Renders list of surahs. On press, passes `surahNumber`, `surahName`, `verses`, `targetPage`, `targetAyah` to `/recite`.
- **`app/recite.tsx`**: Orchestrates `MushafPager`, `UnifiedAudioControl`, `useVADRecorder`, and bottom sheets (`ReciterBottomSheet`, `PlaybackScopeSheet`, `UnifiedOptionsSheet`).
- **`components/recite/UnifiedAudioControl.tsx`**: Floating Sanctuary Dock. Subscribes to `useAudioEngine()` snapshot for live status and uses RNTP `useProgress(250)` for circular progress ring.
- **`components/recite/ReciterBottomSheet.tsx`**: Uses `@gorhom/bottom-sheet` with tabs for "آيات" (Ayah) and "متصل" (Gapless). Selecting a reciter reconfigures `audioEngine`.

---

## 5. Recitation AI Evaluation System Coupling Points

Our investigation identified **5 critical coupling points** between Audio Playback (`react-native-track-player`) and AI Recitation Evaluation (`expo-audio` + `lib/muaalem-api.ts` + `lib/gemini.ts`):

```
                       ┌───────────────────────────────────────┐
                       │           Audio Hardware &            │
                       │             OS Audio Session          │
                       └───────────────────┬───────────────────┘
                                           │
             ┌─────────────────────────────┴─────────────────────────────┐
             ▼                                                           ▼
┌───────────────────────────┐                               ┌───────────────────────────┐
│ react-native-track-player │                               │        expo-audio         │
│  (Quran Playback Engine)  │                               │    (VAD Audio Recorder)   │
└────────────┬──────────────┘                               └────────────┬──────────────┘
             │                                                           │
             │     1. Audio Session Handover (configureAudioSession)    │
             ├───────────────────────────────────────────────────────────┤
             │     2. Recording Interruption (Pause on Record)           │
             ├───────────────────────────────────────────────────────────┤
             │     3. Learning Mode Loop (Listen → Recite → Advance)     │
             ├───────────────────────────────────────────────────────────┤
             │     4. Sheikh Clip Extraction (Makhraj Reference Audio)   │
             ├───────────────────────────────────────────────────────────┤
             │     5. Range & Reference Text Alignment (AyahRange)       │
             └───────────────────────────────────────────────────────────┘
```

### 5.1 Coupling Point 1: Hardware Audio Session Handover (`expo-audio` ↔ `RNTP`)
- **Mechanism**:
  - `useVADRecorder` (`hooks/useVADRecorder.ts:319`) configures `expo-audio` recording mode: `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`.
  - When recording completes in `app/recite.tsx:415` and `UnifiedAudioControl.tsx:245`, `configureAudioSession(true)` is explicitly invoked to restore TrackPlayer audio session settings for native playback.
- **Regression Risk**: If an upgraded AI recording engine alters `expo-audio` settings or fails to release microphone focus, TrackPlayer audio will be muted or blocked on Android ExoPlayer / iOS AVQueuePlayer.

### 5.2 Coupling Point 2: Playback Interruption on Recording Start
- **Mechanism**:
  - `app/recite.tsx:321` checks `audioEngine.getSnapshot().isPlaying`. If true, it calls `audioEngine.togglePlayback()` before calling `vadRecorder.startSession()`.
- **Regression Risk**: If recording starts while playback is active, microphone audio will capture the reciter's audio streaming from the speaker, corrupting student audio sent to Gemini Flash.

### 5.3 Coupling Point 3: Learning Mode Loop ("Listen → Recite → Evaluate → Advance")
- **Mechanism**:
  - In `lib/audio-engine.ts:340`, when `_learningMode` is enabled, `onTrackChanged` pauses player after completing an ayah.
  - In `UnifiedAudioControl.tsx:320`, natural completion triggers `onLearningStepComplete()`, switching `audioMode` from `'listen'` to `'record'`.
  - In `app/recite.tsx:396-406`, if AI evaluation returns no major mistakes, `selectedRange` advances to the next verse, continuing the learning loop.
- **Regression Risk**: Any schema drift in Gemini API response (`score`, `mistakes`, `severity`) will break automatic learning mode range progression.

### 5.4 Coupling Point 4: Sheikh Reference Clip Extraction for Makhraj Evaluation
- **Mechanism**:
  - `UnifiedAudioControl.tsx:209-228` constructs the Sheikh reference audio URL (`getStorageCdnUrl` or `baseUrl`) for the target verse and passes it via `onSheikhClipReady`.
  - Passed into `checkRecitation(userAudioBase64, referenceText, sheikhAudioBase64, sheikhMimeType)` (`lib/gemini.ts:30-35`) for dual-audio comparison (AUDIO 1: Student, AUDIO 2: Sheikh Makhraj clip).
- **Regression Risk**: Upgrading AI engine prompts or input parameters must retain `AUDIO 2` Sheikh clip handling for letter articulation (Makhraj) evaluation.

### 5.5 Coupling Point 5: Verse Range & Reference Text Alignment
- **Mechanism**:
  - `app/recite.tsx:128-139` derives `rangedVersesForRef` (`v.text.join(' * ')`) and `ayahRangeForRef` (`{ surah, ayahFrom, ayahTo }`) from `selectedRange`.
  - Audio playback queue (`audioEngine.configure(...)`) and AI evaluation payload (`checkRecitationWithMuaalem`) share the exact same `selectedRange` boundary.
- **Regression Risk**: Inconsistencies between audio playback bounds and AI evaluation reference text will result in false "omission" or "pronunciation" errors in Gemini evaluation.

---

## 6. Recommendations for Zero-Regression AI Engine Upgrade (Milestone 1)

1. **Strict Core Code Preservation**:
   - Do **NOT** modify `lib/audio-engine.ts`, `lib/audio-reciters.ts`, `lib/gapless-timing.ts`, `lib/audio-timing-db.ts`, or `lib/playback-service.ts` during Milestone 1 AI engine work.
2. **Audio Session Handover Guarantee**:
   - Retain `configureAudioSession(true)` after recording session tear-down in `app/recite.tsx` and `UnifiedAudioControl.tsx` to preserve native track player state.
3. **Data Contract Compliance**:
   - The upgraded Google AI Studio REST / SDK client in `lib/gemini.ts` MUST return the exact `RecitationAssessment` and `MuaalemAssessment` structure:
     ```typescript
     {
       score: number; // 0-100
       mistakes: Array<{
         word: string;
         expected: string;
         description: string;
         category: 'تجويد' | 'نطق' | 'مد' | 'وقف' | 'حذف';
         severity: 'minor' | 'moderate' | 'major' | 'critical';
       }>;
       error?: string;
     }
     ```
4. **Reciter Switch Protection**:
   - Ensure reciter switching in `ReciterBottomSheet` continues calling `audioEngine.configure(...)` and `audioEngine.play(...)`, preserving both gapless surah-level and per-verse queue handling.
5. **Verse Repetition & Delay Integrity**:
   - Preserve `lastSkipReason` logic ('user', 'repeat', 'natural') inside `audioEngine.onTrackChanged` so repeat cycles (1x, 2x, 3x, ∞) and per-ayah delays (0-10s) remain functional.
