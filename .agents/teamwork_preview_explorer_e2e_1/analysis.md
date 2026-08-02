# Comprehensive E2E Test Suite Design & Architectural Investigation (Tiers 1-4)

## Executive Summary
This document delivers the complete architectural design and test specification for the **MutqinApp E2E Test Suite**, covering **Milestones 1-4** and user requirements **R1-R4** as defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`. The design synthesizes codebase analysis from `lib/gemini.ts`, `lib/ai-models.ts`, `lib/muaalem-api.ts`, `lib/audio-engine.ts`, `lib/audio-reciters.ts`, `constants/theme.ts`, `lib/supabase.ts`, and Supabase migration scripts (`20260307` through `20260531`).

---

## 1. System Architecture & Requirements Mapping

### R1: Google AI Studio Direct API Recitation Engine
- **Primary Source Files**: `lib/gemini.ts`, `lib/ai-models.ts`, `lib/muaalem-api.ts`
- **Key Mechanism**: Replaces legacy Hugging Face Space (`dr364873-tajweed-base.hf.space`) with direct `@google/generative-ai` SDK calls. Uses Base64 audio payload processing with Gemini 2.5 Flash and Gemini 3 Flash models (`gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-3.1-flash-lite-preview`).
- **Performance Requirement**: Assessment completion in **1–2 seconds** (sub-3-second latency limit).
- **Core Logic**:
  - 6-Phase System Prompt Evaluation (Transcription, Completeness Check, Madd & Ghunnah, Makhraj Check, Tajweed Rules, Score Calculation).
  - Minimum file guard: Audio files `< 5,000 bytes` (5 KB) are rejected locally without calling API.
  - Multi-model fallback strategy with exponential backoff (1s, 2s, 4s) and 60-second rate limit caching.

### R2: Quran & Reciters Audio System
- **Primary Source Files**: `lib/audio-engine.ts`, `lib/audio-reciters.ts`
- **Key Mechanism**: Dual-mode audio engine powered by `react-native-track-player` (RNTP v4) singleton (`AudioEngineCore`).
- **Playback Modes**:
  1. **Ayah-by-Ayah** (`audioType='ayah'`): Full verse queue loaded into RNTP; native thread handles zero-gap transitions.
  2. **Gapless** (`audioType='gapless'`): Single surah MP3 loaded; timing database provides per-verse ms offsets; 200ms position polling synchronizes verse highlights.
- **Controls & Options**: 80+ reciters across 6 Qiraat (Hafs, Warsh, Qaloon, Shoba, Dory, Soosi), repeat modes (1x, 2x, 3x, infinity), per-verse delay (0-10s), and learning mode.

### R3: Islamic Emerald UI / UX Modernization
- **Primary Source Files**: `constants/theme.ts`, `constants/dynamicTheme.ts`, UI screens in `app/(tabs)/` and `components/`
- **Design Tokens**: Emerald brand palette (`#10b981`, `#064e3b`, `#022c22`), Gold accents (`#f59e0b`, `#d97706`), spatial Islamic glassmorphism, neon glows, and Noto Naskh Arabic typography (`NotoNaskhArabic_700Bold`).
- **Quality Criteria**: Smooth 60 FPS transitions, zero UI thread freeze during audio/AI background tasks, no memory leaks on unmount.

### R4: Supabase MCP Database & RLS Security Audit
- **Primary Source Files**: `lib/supabase.ts`, `supabase/migrations/`
- **Core Tables**: `profiles`, `daily_logs`, `mistake_log`, `qiraat_metadata` (plus `xp_events`, `memorization_plan`, `review_schedule`, `surah_progress`, `bookmarks`).
- **Security Requirement**: Strict Row-Level Security (RLS) policies enforcing `auth.uid() = user_id` / `auth.uid() = id`. Public/anon users must be strictly blocked from private user data. Atomic RPC functions (`upsert_daily_log_atomic`, `award_xp_for_event`) execute with transaction advisory locks (`pg_advisory_xact_lock`).

---

## 2. Four-Tier E2E Test Suite Specification

### Tier 1: Feature Coverage (>=5 test cases per feature)

#### Feature R1: Recitation AI Engine
- **TC-R1-01 (Clean Assessment)**: Invoke `checkRecitationWithMuaalem` with valid Base64 audio and reference Uthmani text. Assert response returns valid score (0-100) and mistake array within 3000ms.
- **TC-R1-02 (Multi-Model Fallback)**: Mock `gemini-3-flash-preview` to throw HTTP 429 Quota Error. Assert system automatically falls back to `gemini-2.5-flash` and marks primary model as rate-limited in cache.
- **TC-R1-03 (Minimum Audio Guard)**: Pass audio file URI with size < 5 KB (e.g. 2 KB silent file). Assert call returns `score: 0`, error message `"التسجيل قصير جداً أو صامت"`, and zero network requests dispatched.
- **TC-R1-04 (Mistake Categorization)**: Supply audio with intentional Tajweed error. Assert mistake output maps category to one of `'تجويد' | 'نطق' | 'مد' | 'وقف' | 'حذف'` and severity to `'minor' | 'moderate' | 'major' | 'critical'`.
- **TC-R1-05 (Completeness Ratio Enforcement)**: Supply audio where student recites only 2 words out of a 10-word verse. Assert system applies Phase 2 completeness check and caps final score `< 50`.

#### Feature R2: Quran & Reciters Audio Engine
- **TC-R2-01 (Ayah-by-Ayah Queue Setup)**: Configure `AudioEngineCore` with `efassy_ayat` (Alafasy ayah-by-ayah). Assert TrackPlayer queue contains exact number of tracks matching verse count and triggers native queue playback.
- **TC-R2-02 (Gapless Position Sync)**: Configure `AudioEngineCore` with `shatry_sura` (Shatri gapless). Assert timing database is queried, single track loaded, and 200ms position polling accurately updates `currentIndex`.
- **TC-R2-03 (Reciter Switching)**: Switch active reciter from `efassy_ayat` (Hafs) to `yaseen_warsh_sura` (Warsh gapless) during active session. Assert old queue is reset, new audio format configured without application error.
- **TC-R2-04 (Playback Controls)**: Verify `play()`, `togglePlayback()`, `skipNext()`, `skipPrev()`, and `setSpeed(1.5)` accurately update `AudioEngineState` snapshot.
- **TC-R2-05 (Repeat & Delay Cycle)**: Enable repeat mode `2x` and per-verse delay `3s`. Assert verse plays twice before advancing, and 3-second delay timer fires between tracks.

#### Feature R3: Islamic Emerald UI
- **TC-R3-01 (Dashboard Theme Rendering)**: Render Dashboard screen (`app/(tabs)/index.tsx`). Assert brand colors apply `emerald[500]` (`#10b981`), `emerald[900]` (`#064e3b`), and `emerald[950]` (`#022c22`).
- **TC-R3-02 (Mushaf Verse Highlighting)**: Render Mushaf screen (`app/(tabs)/mushaf.tsx`) during audio playback. Assert currently playing verse element receives active emerald border/glow visual state.
- **TC-R3-03 (Recitation Audio Waveform)**: Open Recitation modal (`app/recite.tsx`). Assert audio recording trigger displays animated emerald waveform and transitions smoothly to evaluation loading state.
- **TC-R3-04 (Plan Setup Multi-Step Wizard)**: Navigate Plan Setup (`app/plan-setup.tsx`). Assert emerald progress bar advances per step and qiraat selection cards render correctly.
- **TC-R3-05 (Dynamic Dark/Light Mode)**: Toggle system theme in `useThemeColors()`. Assert text contrast ratio remains above WCAG AAA standard (>= 4.5:1) in both light and dark emerald variants.

#### Feature R4: Supabase RLS & Database Security
- **TC-R4-01 (Profiles RLS Isolation)**: Query `profiles` table as Authenticated User A (`auth.uid() = User_A`). Assert User A can SELECT/UPDATE their row, but SELECT for User B returns zero rows.
- **TC-R4-02 (Daily Logs RLS Enforcement)**: Attempt INSERT into `daily_logs` with `user_id = User_B` while authenticated as User A. Assert Supabase rejects request with RLS policy violation.
- **TC-R4-03 (Mistake Log Isolation)**: Query `mistake_log` table as Authenticated User A. Assert only records matching `user_id = User_A` are returned.
- **TC-R4-04 (Qiraat Metadata Read-Only)**: Query `qiraat_metadata` as Anonymous User. Assert SELECT succeeds; INSERT/UPDATE/DELETE by Anonymous User returns permission error.
- **TC-R4-05 (Atomic XP & Daily Log RPC)**: Call `upsert_daily_log_atomic` and `award_xp_for_event` with duplicate `event_id`. Assert transaction lock prevents double XP allocation and guarantees idempotency.

---

### Tier 2: Boundary & Corner Cases (>=5 test cases per feature)

#### Feature R1: Recitation AI Engine (Boundary Cases)
- **TC-R1-B01 (Payload Too Large 413)**: Input 10-minute Base64 audio recording exceeding API limits. Assert caught by error handler returning `"التسجيل طويل جداً. يرجى تسجيل آيات أقل والمحاولة مرة أخرى."`
- **TC-R1-B02 (Complete Offline Disconnect)**: Simulate network interface drop during API call. Assert caught by network handler returning `"مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة."`
- **TC-R1-B03 (Malformed JSON Response)**: Mock Gemini API output returning malformed text (e.g. ````json {score: 90, mistakes: [unclosed````). Assert `safeParseJSON` catches parse error cleanly without app crash.
- **TC-R1-B04 (Sub-Threshold Audio Duration)**: Input audio file with size 4,999 bytes. Assert rejected immediately by 5 KB guard in `lib/muaalem-api.ts`.
- **TC-R1-B05 (Mismatched Sheikh Reference Clip)**: Provide sheikh audio clip from a different surah than Uthmani reference text. Assert prompt Phase 4 isolates reference clip to verse 1 and handles text variance gracefully.

#### Feature R2: Quran & Reciters Audio Engine (Boundary Cases)
- **TC-R2-B01 (Rapid Skip Stress)**: Fire `skipNext()` 15 times in 500ms. Assert RNTP queue state remains consistent without race conditions, index out of bounds, or player freeze.
- **TC-R2-B02 (Audio Interruption / Focus Loss)**: Simulate incoming phone call via native event. Assert audio engine pauses playback, saves active position, and emits state update to UI.
- **TC-R2-B03 (CDN 404 Error Recovery)**: Mock audio CDN endpoint returning 404 Not Found for specific verse. Assert engine catches playback error, sets `isLoading: false`, and alerts user gracefully.
- **TC-R2-B04 (Out-of-Bounds Gapless Seek)**: Issue `seekToVerse(999)` in gapless surah mode. Assert seek is safely ignored or bounded to last valid verse index without runtime panic.
- **TC-R2-B05 (App Background Termination)**: Trigger OS background app kill signal. Assert `appKilledPlaybackBehavior` stops playback cleanly and clears persistent notification.

#### Feature R3: Islamic Emerald UI (Boundary Cases)
- **TC-R3-B01 (Orientation & Viewport Change)**: Rotate device viewport while AI evaluation modal is visible. Assert modal backdrop and emerald action cards re-layout without visual distortion.
- **TC-R3-B02 (Rapid Screen Tab Switching)**: Switch between Dashboard, Mushaf, Recite, and Profile tabs 20 times in rapid succession while audio is playing. Assert no memory leaks, unhandled promises, or duplicate audio streams.
- **TC-R3-B03 (Accessibility Large Text Scaling)**: Enable 200% system font scaling. Assert Arabic Quran text scales legibly without clipping emerald card borders or bento containers.
- **TC-R3-B04 (Low Memory 604 Page Scroll)**: Rapidly scroll through 604 pages in Mushaf view under memory pressure. Assert FlashList virtualizes list items efficiently without dropping frames below 60 FPS.
- **TC-R3-B05 (Offline Banner Display)**: Sever network connection while on Dashboard. Assert emerald offline warning bar appears instantly while cached local data remains interactive.

#### Feature R4: Supabase RLS (Boundary Cases)
- **TC-R4-B01 (Expired JWT Token)**: Invoke Supabase RPC `upsert_daily_log_atomic` using an expired session JWT. Assert Supabase gateway returns 401 Unauthorized.
- **TC-R4-B02 (SQL Injection Attack Vector)**: Pass malicious payload string (`'; DROP TABLE daily_logs; --`) into `p_reason` or `p_event_id` in `award_xp_for_event`. Assert PL/pgSQL parameter binding safely escapes input.
- **TC-R4-B03 (Concurrent Duplicate Event Execution)**: Fire 10 simultaneous parallel HTTP requests calling `award_xp_for_event` with identical `(user_id, event_id)`. Assert database unique constraint awards XP exactly once.
- **TC-R4-B04 (Cross-User Column Mutation Attempt)**: Authenticated User A submits UPDATE query attempting to alter `user_id` to User B. Assert RLS `WITH CHECK (auth.uid() = user_id)` blocks update.
- **TC-R4-B05 (Connection Pool Saturation)**: Simulate 100 simultaneous database queries. Assert custom Supabase fetch wrapper in `lib/supabase.ts` retries GET queries safely and surfaces network warning once.

---

### Tier 3: Cross-Feature Combinations (Pairwise Interaction Matrix)

| Feature Pair | Interaction Scenario | Test Case ID & Description | Expected Behavior |
|--------------|----------------------|----------------------------|-------------------|
| **R1 x R2** | Recitation AI + Audio Engine | **TC-R3-01**: Switch from Sheikh Audio playback to User Audio recording | Audio Engine pauses TrackPlayer, releases audio focus, records user audio, sends Base64 to Gemini, and allows resuming Sheikh audio afterwards. |
| **R1 x R2** | Recitation AI + Audio Engine | **TC-R3-02**: Reference Sheikh Clip Extraction | Audio Engine fetches Sheikh audio clip URL and provides Base64 audio payload to Gemini `checkRecitation` Phase 4 Makhraj check. |
| **R1 x R3** | Recitation AI + Emerald UI | **TC-R3-03**: Audio Waveform & AI Result Modal | Recording button displays animated emerald glow; upon AI response, glassmorphism modal opens with score badge (`#10b981` / `#f59e0b`) and Tajweed error list. |
| **R1 x R3** | Recitation AI + Emerald UI | **TC-R3-04**: Tajweed Mistake Highlight | Tapping a Tajweed mistake card in evaluation modal automatically highlights corresponding verse in Mushaf view. |
| **R1 x R4** | Recitation AI + Supabase RLS | **TC-R3-05**: AI Result Security Persistence | Upon receiving AI evaluation result, app invokes `upsert_daily_log_atomic` to persist score and mistake count into RLS-protected `daily_logs` table. |
| **R2 x R3** | Audio Engine + Emerald UI | **TC-R3-06**: Audio Verse Highlighting Sync | Active verse in Mushaf updates emerald background highlight (`#ecfdf5` / `#064e3b`) in real-time as RNTP advances tracks or gapless 200ms polling fires. |
| **R2 x R3** | Audio Engine + Emerald UI | **TC-R3-07**: Reciter Selector & Floating Controls | Reciter selection in modal updates reciter name/icon on `FloatingTabBar` audio player controls with smooth emerald transition animation. |
| **R2 x R4** | Audio Engine + Supabase RLS | **TC-R3-08**: Audio Position Cloud Sync | Saving current listening position and reciter preference updates `memorization_plan` row in Supabase under `auth.uid() = user_id` RLS policy. |
| **R3 x R4** | Emerald UI + Supabase RLS | **TC-R3-09**: Dashboard Bento Real-Time Sync | Dashboard stats bento (XP, Streak, Ward Progress) subscribes to Supabase changes, updating UI components with shimmering skeleton loader. |

---

### Tier 4: Real-World Application Scenarios (E2E Workflows)

#### Scenario 1: Complete Daily Ward Memorization Cycle
1. **User Launch**: User opens MutqinApp on Dashboard (`app/(tabs)/index.tsx`). Dashboard fetches user profile and daily ward goal from Supabase under RLS.
2. **Listening Phase**: User opens Mushaf view, selects Sheikh Al-Husary, and plays Surah Al-Mulk in Ayah-by-Ayah mode. Verse highlights synchronize in real-time with emerald glow (R2 & R3).
3. **Recitation Phase**: User opens Recitation mode (`app/recite.tsx`), records recitation of 5 verses. Recording animation plays in emerald palette.
4. **AI Evaluation**: App converts audio to Base64 and invokes `checkRecitationWithMuaalem`. Gemini 2.5 Flash evaluates recitation in 1.5 seconds, returning score of 94% with 1 minor elongation error (R1).
5. **Data Persistence**: Result is written to Supabase `daily_logs` and `mistake_log` using `upsert_daily_log_atomic`. User receives +50 XP via `award_xp_for_event` (R4).
6. **UI Reward**: Emerald success modal displays level progress, updates streak badge, and advances daily ward position.

#### Scenario 2: Random Recitation Challenge & SM-2 Spaced Repetition
1. **Trigger**: User completes 5 daily wards. System triggers Random Test modal.
2. **Random Ward Selection**: System selects a random ward completed earlier today from Supabase `daily_logs`.
3. **Audio Capture & AI Audit**: User records recitation. Gemini 3 Flash performs strict audit (`performRandomTest`). Score returns 88%.
4. **SM-2 Schedule Calculation**: App calls `update_sm2_schedule` RPC in Supabase. SM-2 ease factor and next review interval (e.g. +6 days) are calculated server-side.
5. **Dashboard Refresh**: Emerald UI unlocks next ward level and updates SM-2 review badge.

#### Scenario 3: Qiraat & Reciter Switching Workflow
1. **Selection**: User switches Qiraat preference from Hafs to Warsh in settings.
2. **Reciter Load**: System filters library via `getRecitersByQiraat('Warsh')` and loads Yassin Al-Jazairi (Gapless mode).
3. **Audio & Timing Init**: Audio Engine downloads timing database and surah MP3 to local cache.
4. **Synchronized Playback**: Playback begins with 200ms position polling synchronizing Warsh verse text.
5. **AI Evaluation in Warsh**: User records recitation; Gemini API evaluates audio against Warsh phonetic ground truth.

#### Scenario 4: Security Breach & RLS Defense Simulation
1. **Attack Simulation**: Malicious client script attempts to bypass UI and execute `SELECT * FROM profiles WHERE id != auth.uid()` and `INSERT INTO daily_logs (user_id, score) VALUES ('target-user-id', 100)`.
2. **RLS Engine Defense**: Supabase Postgres RLS engine evaluates `auth.uid() = user_id`.
3. **Access Denial**: SELECT query returns 0 rows; INSERT query fails with `42501 (insufficient_privilege)`.
4. **Application Stability**: Client handles security denial without application crash or data leak.

---

## 3. Test Infrastructure Specification (`TEST_INFRA.md`)

### Framework Stack
- **Unit & Component Testing**: Jest + `@testing-library/react-native` (RNTL)
- **API Mocking**: Mock Service Worker (MSW) for HTTP REST & `@google/generative-ai` mock stubs
- **Audio Engine Mocking**: `react-native-track-player` Jest mock harness
- **Database & RLS Testing**: Local Supabase CLI harness with `pgTAP` SQL test runner (`supabase test db`)

### Directory Layout
```
__tests__/
├── unit/
│   ├── ai-models.test.ts          # Multi-model fallback & rate limit tests
│   ├── audio-engine.test.ts       # RNTP core engine & timing tests
│   └── muaalem-api.test.ts        # Base64 conversion & audio size guard tests
├── component/
│   ├── Dashboard.test.tsx         # Emerald UI dashboard & bento stats tests
│   ├── MushafView.test.tsx        # Verse text & highlight sync tests
│   └── ReciteModal.test.tsx       # Recording trigger & evaluation modal tests
├── integration/
│   ├── recitation-flow.test.ts    # End-to-end AI -> UI -> RLS pipeline
│   └── audio-mushaf-sync.test.ts  # Audio Engine -> UI highlight integration
└── rls/
    ├── profiles_rls.test.sql      # Supabase RLS pgTAP security tests
    ├── daily_logs_rls.test.sql    # RLS security tests for daily_logs
    └── mistake_log_rls.test.sql   # RLS security tests for mistake_log
```

---

## 4. Conclusion & Readiness
The E2E Test Suite design comprehensively covers requirements **R1, R2, R3, R4** across all **4 Tiers**, providing complete verification pathways for upcoming implementation milestones.
