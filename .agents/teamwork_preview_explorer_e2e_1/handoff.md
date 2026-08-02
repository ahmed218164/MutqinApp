# Handoff Report — E2E Test Suite Design (Tiers 1-4)

## 1. Observation
Direct observations from codebase inspection across core files and database scripts:

- **R1 Recitation AI Engine**:
  - `lib/gemini.ts:29-204`: Function `checkRecitation` uses `@google/generative-ai` SDK (`GoogleGenerativeAI`). Iterates models `['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview']` (lines 37-41). Implements 6 evaluation phases (Transcription, Completeness Check, Madd & Ghunnah, Makhraj Check, Tajweed Rules, Score Calculation). Line 174 parses response with `JSON.parse(cleaned)`.
  - `lib/muaalem-api.ts:55-110`: Function `checkRecitationWithMuaalem` reads audio file via `FileSystem.readAsStringAsync` as Base64. Line 68 enforces audio size check `fileSize < 5_000 bytes` (5 KB guard).
  - `lib/ai-models.ts:146-234`: Function `generateWithFallback` implements exponential backoff (1s, 2s, 4s) and rate-limit caching (`markModelRateLimited`, 60s).

- **R2 Quran & Reciters Audio System**:
  - `lib/audio-engine.ts:121-800`: Singleton `AudioEngineCore` powered by `react-native-track-player` (RNTP v4). Supports Ayah-by-Ayah mode (`audioType='ayah'`) via native track queue and Gapless mode (`audioType='gapless'`) via timing DB and 200ms position polling. Controls include `play()`, `togglePlayback()`, `skipNext()`, `skipPrev()`, `cycleRepeat()` (repeat modes: `1`, `2`, `3`, `'inf'`), `setSpeed()`, `setAyahDelay()` (0-10s), `setLearningMode()`.
  - `lib/audio-reciters.ts:45-155`: Defines 80+ reciters split into `GAPLESS_RECITERS` (type=1) and `AYAH_RECITERS` (type=2) across 6 Qiraat (Hafs, Warsh, Qaloon, Shoba, Dory, Soosi) and styles (Murattal, Mujawwad, Muallim).

- **R3 Islamic Emerald UI**:
  - `constants/theme.ts:2-87`: Design tokens define primary brand emerald palette (`#10b981`, `#064e3b`, `#022c22`), gold accents (`#f59e0b`, `#d97706`), neon glows (`neon.emeraldGlow`), and hero gradients (`heroEmerald`, `bentoEmerald`).
  - `constants/dynamicTheme.ts:35-38`: `useThemeColors()` hook handles dynamic light/dark mode theme switching while preserving contrast ratios.

- **R4 Supabase RLS & Database Security Audit**:
  - `lib/supabase.ts:47-60`: Supabase client initialization. `customFetch` wrapper handles GET retries.
  - `supabase/migrations/20260307_memorization_plan.sql:40-46`: Enforces `CREATE POLICY "users_own_plan" ON memorization_plan FOR ALL USING (auth.uid() = user_id)`.
  - `supabase/migrations/20260308_fix_all.sql:90-92`: Enforces `CREATE POLICY "Users can manage own surah progress" ON surah_progress FOR ALL USING (auth.uid() = user_id)`.
  - `supabase/migrations/20260531_trust_and_idempotency.sql:19-23`: Enforces `CREATE POLICY "users_own_xp_events" ON xp_events FOR ALL USING (auth.uid() = user_id)`.
  - `supabase/migrations/20260531_trust_and_idempotency.sql:118-149`: RPC `upsert_daily_log_atomic` locks user rows atomically using `PERFORM pg_advisory_xact_lock(...)`.

---

## 2. Logic Chain
1. **Observation 1 (R1)**: The AI engine in `lib/gemini.ts` and `lib/muaalem-api.ts` processes multimodal audio Base64 directly via Google AI Studio Gemini API with multi-model fallback and a 5 KB silent recording guard.
   - **Inference 1**: E2E test cases for R1 must cover normal assessment, minimum audio guard rejection (<5 KB), multi-model rate-limit fallback (429), malformed JSON handling, and completeness ratio score capping (<50).

2. **Observation 2 (R2)**: The audio engine in `lib/audio-engine.ts` handles dual playback modes (Ayah-by-Ayah queue and Gapless surah file with 200ms timing polling) across 80+ reciters in `lib/audio-reciters.ts`.
   - **Inference 2**: E2E test cases for R2 must cover both playback modes, track queue desynchronization protection under rapid skips, repeat/delay state transitions, reciter switching across Qiraat, and interruption recovery.

3. **Observation 3 (R3)**: The theme tokens in `constants/theme.ts` define emerald color palettes (`#10b981`, `#064e3b`, `#022c22`), neon glow effects, and dynamic theme switching.
   - **Inference 3**: E2E test cases for R3 must verify visual theme color rendering, Mushaf verse highlight sync, recording modal animations, plan setup step navigation, and WCAG contrast compliance.

4. **Observation 4 (R4)**: Database migrations enforce Row-Level Security (`auth.uid() = user_id`) across user tables (`profiles`, `daily_logs`, `mistake_log`, `memorization_plan`, `xp_events`) and employ advisory locks in atomic RPC functions.
   - **Inference 4**: E2E test cases for R4 must verify strict cross-user data isolation, unauthorized access blocking (401/42501), SQL injection safety, duplicate request idempotency, and public read-only access for `qiraat_metadata`.

5. **Observation 5 (Synthesis)**: Combining inferences 1-4 provides a complete 4-tier matrix (Tier 1: Feature Coverage >=5/feature, Tier 2: Boundary Cases >=5/feature, Tier 3: Pairwise Cross-Feature Matrix, Tier 4: Real-World Application Workflows).

---

## 3. Caveats
- **Live Google AI Studio Quota**: Live network tests against Gemini APIs require valid `EXPO_PUBLIC_GEMINI_API_KEY` environment variable. For CI environments, MSW / Jest stubs must be used to prevent quota exhaustion.
- **Supabase Local Testing Setup**: Verification of SQL RLS policies relies on local Supabase CLI (`supabase test db` with `pgTAP`). Production database environment should be audited via Supabase MCP advisors before deployment.

---

## 4. Conclusion
The E2E Test Suite design (Tiers 1–4) for MutqinApp is fully specified, architecturally sound, and directly grounded in the existing TypeScript & SQL codebase. The test infrastructure plan (`TEST_INFRA.md`) provides a clear blueprint for implementation.

---

## 5. Verification Method
To independently verify this design report and inspect the codebase findings:

1. **Inspect Report Files**:
   - `c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_e2e_1\analysis.md`
   - `c:\Users\ELBOSTAN\Desktop\MutqinApp\.agents\teamwork_preview_explorer_e2e_1\handoff.md`

2. **Source Code Verification**:
   - `lib/gemini.ts` (lines 29-204) — Recitation AI engine & system prompt.
   - `lib/muaalem-api.ts` (lines 55-110) — Audio size validation guard (<5 KB).
   - `lib/ai-models.ts` (lines 146-234) — Fallback & rate-limit caching strategy.
   - `lib/audio-engine.ts` (lines 121-800) — RNTP dual-mode audio engine.
   - `lib/audio-reciters.ts` (lines 45-155) — Reciter library definition.
   - `constants/theme.ts` (lines 2-87) — Emerald theme tokens.
   - `supabase/migrations/20260531_trust_and_idempotency.sql` — RLS policies & atomic RPCs.
