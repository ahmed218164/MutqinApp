# MutqinApp E2E Test Suite Infrastructure & Architecture (`TEST_INFRA.md`)

## Executive Summary
This document defines the comprehensive **End-to-End (E2E) Test Suite Infrastructure** for MutqinApp across Tiers 1 through 4. It establishes the test philosophy, feature inventory, target directory architecture, and full scenario catalog covering all system requirements (**R1: Recitation AI Engine**, **R2: Quran & Reciters Audio System**, **R3: Islamic Emerald UI**, and **R4: Supabase RLS & Database Security**).

---

## 1. Test Philosophy

MutqinApp adopts an **Opaque-Box, Requirement-Driven Testing Strategy**:

1. **Opaque-Box Verification**: Tests evaluate system behavior purely through public interfaces, user actions, network contracts, and database states. Test specifications do not depend on internal private functions or transient component states.
2. **Requirement-Driven**: Every test case directly traces to specific feature requirements (R1–R4), ensuring complete functional verification from single feature operations to complex multi-system workflows.
3. **Genuine & Non-Facade Execution**: Verification logic performs real computations, contract checks, state transitions, and schema assertions. Hardcoded mock results or facade stubs that bypass evaluation logic are strictly prohibited.
4. **4-Tier Escalation Model**:
   - **Tier 1 (Feature Coverage)**: Validates happy path and core functionality across all 4 features (>=5 cases/feature, 20 total).
   - **Tier 2 (Boundary & Corner Cases)**: Validates error conditions, network failures, size limits, concurrency, and security boundaries (>=5 cases/feature, 20 total).
   - **Tier 3 (Pairwise Cross-Feature Matrix)**: Validates interaction behavior across feature boundaries (9 cross-feature scenarios).
   - **Tier 4 (Real-World Workflows)**: Validates complete end-to-end user journeys from app launch to persistence and UI updates (4 full scenarios).

---

## 2. Feature Inventory

| Feature ID | Name | Core Components & Source Files | Requirements & Specs |
|------------|------|--------------------------------|-----------------------|
| **R1** | **Recitation AI Engine** | `lib/gemini.ts`<br>`lib/ai-models.ts`<br>`lib/muaalem-api.ts` | Direct `@google/generative-ai` SDK, sub-3s response target, Base64 payload, 6-phase Tajweed prompt, 5 KB local silent recording guard, multi-model fallback (`gemini-3-flash-preview` -> `gemini-2.5-flash` -> `gemini-3.1-flash-lite-preview`) with 60s rate-limit cache. |
| **R2** | **Quran & Reciters Audio System** | `lib/audio-engine.ts`<br>`lib/audio-reciters.ts` | Singleton `AudioEngineCore` with `react-native-track-player` (RNTP v4). Dual modes: Ayah-by-Ayah (native track queue) & Gapless (single surah MP3 + 200ms timing database position polling). 80+ reciters across 6 Qiraat, repeat/delay controls, speed (0.5x–2.0x), learning mode. |
| **R3** | **Islamic Emerald UI** | `constants/theme.ts`<br>`constants/dynamicTheme.ts`<br>`app/(tabs)/`<br>`components/` | Emerald brand palette (`#10b981`, `#064e3b`, `#022c22`), gold accents, spatial glassmorphic bento cards, neon glows, Mushaf verse highlighting sync, recording modal animations, 60 FPS transitions, WCAG AAA text contrast standard. |
| **R4** | **Supabase RLS & Security** | `lib/supabase.ts`<br>`supabase/migrations/*.sql` | Supabase client with retry `customFetch`. RLS policies (`auth.uid() = user_id`) on `profiles`, `daily_logs`, `mistake_log`, `memorization_plan`, `xp_events`, `surah_progress`. Atomic RPC functions (`upsert_daily_log_atomic`, `award_xp_for_event`) with transaction locks (`pg_advisory_xact_lock`). |

---

## 3. Test Architecture & Directory Layout

The automated test infrastructure is organized under `__tests__/` with specialized subdirectories matching test tiers and components:

```
MutqinApp/
├── __tests__/
│   ├── unit/
│   │   ├── ai-models.test.ts          # Multi-model fallback & rate limit cache tests
│   │   ├── audio-engine.test.ts       # RNTP core engine & timing database tests
│   │   └── muaalem-api.test.ts        # Base64 conversion & 5 KB size guard tests
│   ├── component/
│   │   ├── Dashboard.test.tsx         # Emerald UI dashboard & bento stats rendering
│   │   ├── MushafView.test.tsx        # Quran text rendering & verse highlight sync
│   │   └── ReciteModal.test.tsx       # Recording trigger & AI result modal UI
│   ├── integration/
│   │   ├── recitation-flow.test.ts    # End-to-end AI -> UI -> RLS persistence flow
│   │   └── audio-mushaf-sync.test.ts  # Audio Engine position -> UI highlight sync
│   ├── rls/
│   │   ├── profiles_rls.test.sql      # Supabase RLS pgTAP profile isolation tests
│   │   ├── daily_logs_rls.test.sql    # RLS tests for daily_logs authorization
│   │   └── mistake_log_rls.test.sql   # RLS tests for mistake_log access control
│   └── e2e/
       ├── daily-ward-flow.test.ts     # Tier 4 Scenario 1: Complete Daily Ward Cycle
       ├── sm2-challenge.test.ts      # Tier 4 Scenario 2: Random Recitation & SM-2
       ├── qiraat-switch.test.ts      # Tier 4 Scenario 3: Qiraat & Reciter Switch
       └── rls-defense.test.ts        # Tier 4 Scenario 4: Security Breach Defense
├── verify-production-readiness.js     # Production readiness & E2E runner verification
├── TEST_INFRA.md                      # Test infrastructure architecture specification
├── TEST_READY.md                      # Test readiness publication & tier summary
└── package.json                       # Scripts: typecheck, verify, test
```

---

## 4. Scenario Catalog (Tiers 1–4)

### Tier 1: Feature Coverage (20 Test Cases — 5 per feature)

#### Feature R1: Recitation AI Engine
- **TC-R1-01 (Clean Assessment)**: Invoke `checkRecitationWithMuaalem` with valid Base64 audio and reference Uthmani text. Verify return payload contains score (0–100) and mistake array within 3000ms latency.
- **TC-R1-02 (Multi-Model Fallback)**: Mock `gemini-3-flash-preview` returning 429 Quota Error. Verify fallback to `gemini-2.5-flash` and 60-second rate-limit cache update.
- **TC-R1-03 (Minimum Audio Guard)**: Pass audio payload < 5 KB (e.g., 2 KB silent recording). Verify immediate rejection with `score: 0`, error `"التسجيل قصير جداً أو صامت"`, and zero network requests.
- **TC-R1-04 (Mistake Categorization)**: Supply audio containing deliberate Tajweed error. Verify mistake output maps to category (`'تجويد' | 'نطق' | 'مد' | 'وقف' | 'حذف'`) and severity (`'minor' | 'moderate' | 'major' | 'critical'`).
- **TC-R1-05 (Completeness Ratio Enforcement)**: Supply audio where reciter reads only 2 of 10 words in verse. Verify Phase 2 completeness check caps final score < 50.

#### Feature R2: Quran & Reciters Audio System
- **TC-R2-01 (Ayah-by-Ayah Queue Setup)**: Configure `AudioEngineCore` with Alafasy Ayah-by-Ayah mode (`efassy_ayat`). Verify track player queue is populated with verse tracks and initiates native playback.
- **TC-R2-02 (Gapless Position Sync)**: Configure `AudioEngineCore` with Shatri Gapless mode (`shatry_sura`). Verify timing database query, single track load, and 200ms position polling.
- **TC-R2-03 (Reciter Switching)**: Switch reciter from Hafs (`efassy_ayat`) to Warsh (`yaseen_warsh_sura`) during playback. Verify queue reset and format reconfiguration without error.
- **TC-R2-04 (Playback Controls)**: Verify `play()`, `togglePlayback()`, `skipNext()`, `skipPrev()`, and `setSpeed(1.5)` accurately update state snapshot.
- **TC-R2-05 (Repeat & Delay Cycle)**: Enable repeat mode `2x` and 3s verse delay. Verify verse plays twice before advancing with 3-second pause between tracks.

#### Feature R3: Islamic Emerald UI
- **TC-R3-01 (Dashboard Theme Rendering)**: Render Dashboard screen (`app/(tabs)/index.tsx`). Verify brand colors (`#10b981`, `#064e3b`, `#022c22`) apply to bento container cards.
- **TC-R3-02 (Mushaf Verse Highlighting)**: Render Mushaf view (`app/(tabs)/mushaf.tsx`) during playback. Verify active verse element receives active emerald border/glow visual state.
- **TC-R3-03 (Recitation Audio Waveform)**: Open Recitation modal (`app/recite.tsx`). Verify recording button shows animated emerald waveform and transitions cleanly to evaluation loading state.
- **TC-R3-04 (Plan Setup Wizard Navigation)**: Navigate Plan Setup (`app/plan-setup.tsx`). Verify emerald progress indicator advances per step and qiraat selection cards render correctly.
- **TC-R3-05 (Dynamic Theme Contrast)**: Toggle system theme in `useThemeColors()`. Verify WCAG AAA contrast standard (>= 4.5:1) is maintained in both dark and light emerald variants.

#### Feature R4: Supabase RLS & Database Security
- **TC-R4-01 (Profiles RLS Isolation)**: Query `profiles` table as Authenticated User A (`auth.uid() = User_A`). Verify User A can read/write own row, but query for User B returns zero rows.
- **TC-R4-02 (Daily Logs RLS Enforcement)**: Attempt INSERT into `daily_logs` with `user_id = User_B` while authenticated as User A. Verify Supabase rejects request with RLS policy violation.
- **TC-R4-03 (Mistake Log Isolation)**: Query `mistake_log` table as Authenticated User A. Verify returned rows strictly match `user_id = User_A`.
- **TC-R4-04 (Qiraat Metadata Public Read-Only)**: Query `qiraat_metadata` as Anonymous User. Verify SELECT succeeds, while INSERT/UPDATE/DELETE returns permission error.
- **TC-R4-05 (Atomic XP & Daily Log RPC)**: Call `upsert_daily_log_atomic` and `award_xp_for_event` with duplicate `event_id`. Verify transaction lock prevents duplicate XP allocation and guarantees idempotency.

---

### Tier 2: Boundary & Corner Cases (20 Test Cases — 5 per feature)

#### Feature R1: Recitation AI Engine (Boundary Cases)
- **TC-R1-B01 (Payload Too Large 413)**: Input 10-minute Base64 recording exceeding limit. Verify error handler returns `"التسجيل طويل جداً. يرجى تسجيل آيات أقل والمحاولة مرة أخرى."`
- **TC-R1-B02 (Complete Offline Disconnect)**: Simulate network loss during API invocation. Verify network handler returns `"مشكلة في الاتصال بالإنترنت. يرجى التحقق من الشبكة."`
- **TC-R1-B03 (Malformed JSON Response)**: Mock Gemini API output returning truncated JSON. Verify `safeParseJSON` handles error cleanly without application crash.
- **TC-R1-B04 (Sub-Threshold Audio Duration)**: Input audio file with size 4,999 bytes. Verify immediate rejection by 5 KB guard in `lib/muaalem-api.ts`.
- **TC-R1-B05 (Mismatched Sheikh Reference Clip)**: Provide sheikh audio clip from wrong surah. Verify prompt Phase 4 isolates reference clip to verse 1 and handles variance safely.

#### Feature R2: Quran & Reciters Audio System (Boundary Cases)
- **TC-R2-B01 (Rapid Skip Stress)**: Issue `skipNext()` 15 times within 500ms. Verify queue state remains consistent without race conditions, index out of bounds, or player freeze.
- **TC-R2-B02 (Audio Interruption / Focus Loss)**: Simulate incoming phone call event. Verify audio engine pauses playback, saves active position, and updates UI state.
- **TC-R2-B03 (CDN 404 Error Recovery)**: Mock CDN endpoint returning 404 for specific audio file. Verify engine handles error, sets `isLoading: false`, and alerts user.
- **TC-R2-B04 (Out-of-Bounds Gapless Seek)**: Issue `seekToVerse(999)` in gapless surah mode. Verify seek is safely bounded to last valid verse index without runtime panic.
- **TC-R2-B05 (App Background Termination)**: Trigger OS background app kill signal. Verify `appKilledPlaybackBehavior` stops playback cleanly and clears persistent notification.

#### Feature R3: Islamic Emerald UI (Boundary Cases)
- **TC-R3-B01 (Orientation & Viewport Change)**: Rotate device viewport while AI evaluation modal is open. Verify modal backdrop and emerald cards re-layout cleanly.
- **TC-R3-B02 (Rapid Tab Switching)**: Switch between Dashboard, Mushaf, Recite, and Profile tabs 20 times during playback. Verify no memory leaks, unhandled promises, or duplicate audio streams.
- **TC-R3-B03 (Accessibility Large Text Scaling)**: Enable 200% system font scaling. Verify Arabic text scales legibly without clipping emerald card borders or bento layouts.
- **TC-R3-B04 (Low Memory 604 Page Scroll)**: Rapidly scroll through 604 pages in Mushaf view under memory pressure. Verify FlashList virtualizes list items efficiently without dropping below 60 FPS.
- **TC-R3-B05 (Offline Banner Display)**: Sever network connection on Dashboard. Verify emerald offline banner appears instantly while cached data remains interactive.

#### Feature R4: Supabase RLS (Boundary Cases)
- **TC-R4-B01 (Expired JWT Token)**: Call Supabase RPC `upsert_daily_log_atomic` using expired session token. Verify Supabase gateway returns 401 Unauthorized.
- **TC-R4-B02 (SQL Injection Attack Vector)**: Pass payload string (`'; DROP TABLE daily_logs; --`) into `p_reason` in `award_xp_for_event`. Verify PL/pgSQL parameter binding safely escapes input.
- **TC-R4-B03 (Concurrent Duplicate Event Execution)**: Dispatch 10 parallel HTTP requests to `award_xp_for_event` with identical `(user_id, event_id)`. Verify unique constraint awards XP exactly once.
- **TC-R4-B04 (Cross-User Column Mutation Attempt)**: Authenticated User A submits UPDATE attempting to change `user_id` to User B. Verify RLS `WITH CHECK (auth.uid() = user_id)` blocks modification.
- **TC-R4-B05 (Connection Pool Saturation)**: Simulate 100 simultaneous database queries. Verify custom fetch wrapper in `lib/supabase.ts` retries GET queries safely.

---

### Tier 3: Pairwise Cross-Feature Combinations (9 Test Cases)

| Pair Case ID | Feature Pair | Interaction Scenario | Expected Behavior |
|--------------|--------------|----------------------|-------------------|
| **TC-R3-01** | **R1 x R2** | Sheikh Audio Playback to User Audio Recording | Audio Engine pauses TrackPlayer, releases focus, records user audio, sends Base64 to Gemini, and allows resuming Sheikh audio. |
| **TC-R3-02** | **R1 x R2** | Reference Sheikh Clip Extraction | Audio Engine fetches Sheikh audio clip URL and provides Base64 audio payload to Gemini `checkRecitation` Phase 4 Makhraj check. |
| **TC-R3-03** | **R1 x R3** | Audio Waveform & AI Result Modal | Recording button shows animated emerald glow; AI response opens glassmorphism modal with score badge (`#10b981` / `#f59e0b`) and Tajweed error list. |
| **TC-R3-04** | **R1 x R3** | Tajweed Mistake Highlight Sync | Tapping Tajweed mistake card in evaluation modal automatically highlights corresponding verse in Mushaf view. |
| **TC-R3-05** | **R1 x R4** | AI Result Security Persistence | Upon receiving AI evaluation result, app invokes `upsert_daily_log_atomic` to persist score and mistake count into RLS-protected `daily_logs`. |
| **TC-R3-06** | **R2 x R3** | Audio Verse Highlighting Sync | Active verse in Mushaf updates emerald highlight (`#ecfdf5` / `#064e3b`) in real-time as RNTP advances tracks or gapless 200ms polling fires. |
| **TC-R3-07** | **R2 x R3** | Reciter Selector & Floating Controls | Reciter selection in modal updates reciter name/icon on `FloatingTabBar` audio controls with smooth emerald transition animation. |
| **TC-R3-08** | **R2 x R4** | Audio Position Cloud Sync | Saving current listening position and reciter preference updates `memorization_plan` row in Supabase under `auth.uid() = user_id` RLS policy. |
| **TC-R3-09** | **R3 x R4** | Dashboard Bento Real-Time Sync | Dashboard stats bento (XP, Streak, Ward Progress) subscribes to Supabase changes, updating UI components with shimmering skeleton loader. |

---

### Tier 4: Real-World Application Scenarios (4 E2E Workflows)

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

## 5. Verification & Execution Instructions

1. **TypeScript Type Check**:
   ```bash
   npm run typecheck
   ```
2. **Production Readiness & E2E Verification**:
   ```bash
   npm run verify
   ```
3. **Combined Test Execution**:
   ```bash
   npm run test
   ```
