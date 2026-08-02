# Milestone 1: Recitation AI Engine Optimization — Read-Only Investigation & Analysis

## Executive Summary
This investigation evaluated the Recitation AI Engine implementation in MutqinApp across client-side logic (`lib/ai-models.ts`, `lib/gemini.ts`, `lib/muaalem-api.ts`, `lib/recitation-storage.ts`), VAD chunking recorder (`hooks/useVADRecorder.ts`), UI integration (`app/recite.tsx`), audio engine (`lib/audio-engine.ts`), and Supabase Edge Functions (`supabase/functions/check-recitation-v2/index.ts`).

The application has successfully migrated from legacy Hugging Face models (`dr364873-tajweed-base.hf.space`) to Google AI Studio Gemini Flash multimodal APIs via `@google/generative-ai` (`v0.24.1`). The engine achieves zero cold-start delay, 1-2 second evaluation response times, multi-model fallback resiliency, VAD continuous chunking, and deterministic Tajweed accuracy via phonetic ground-truth strings.

---

## Codebase Architecture & File Mapping

| File Path | Role & Summary | Key Functions / Constants |
|-----------|----------------|---------------------------|
| `lib/gemini.ts` | Gemini multimodal evaluation client with multi-model fallback and 6-phase Tajweed prompt | `checkRecitation()`, `RecitationAssessment` |
| `lib/ai-models.ts` | Multi-model routing system with rate limit caching and exponential backoff | `generateWithFallback()`, `checkRecitationWithAI()`, `generateMemorizationPlan()`, `AI_MODELS` |
| `lib/muaalem-api.ts` | Muaalem API bridge layer replacing Hugging Face space; converts audio file URI to Base64 and enforces 5KB size check | `checkRecitationWithMuaalem()`, `wakeUpMuaalemSpace()`, `mapGeminiResponseToMuaalem()` |
| `lib/recitation-storage.ts` | Storage & Edge Function invocation pipeline for long audio recordings and direct Base64 evaluation | `checkRecitationViaStorage()`, `checkRecitationDirect()`, `checkRecitationLegacy()` |
| `hooks/useVADRecorder.ts` | Continuous Voice Activity Detection (VAD) chunking recorder with audio metering (-35 dB threshold) | `useVADRecorder()`, `startSession()`, `finishSession()`, `aggregateChunkResults()` |
| `app/recite.tsx` | Main Recitation screen integrating VAD recorder, audio playback player, feedback display, and progress saving | `ReciteScreenInner()`, `startRecording()`, `stopRecording()` |
| `lib/audio-engine.ts` | RNTP-powered dual-mode audio engine for Quran audio recitation playback | `AudioEngineCore`, `audioEngine`, `useAudioEngine()` |
| `lib/offline-queue.ts` | AsyncStorage-backed offline queue for retrying failed audio uploads and recitation event syncs | `OfflineUploadQueue`, `offlineQueue`, `processQueue()` |
| `supabase/functions/check-recitation-v2/index.ts` | Serverless Supabase Edge Function running hybrid evaluation prompt with Gemini fallback chain | `serve()` HTTP handler, `HYBRID_SYSTEM_PROMPT` |

---

## Detailed Technical Findings

### 1. Google AI Studio Migration & Latency
- **Hugging Face Deprecation**: Hugging Face space calls (`dr364873-tajweed-base.hf.space`) have been removed. `wakeUpMuaalemSpace()` in `lib/muaalem-api.ts:43-45` is a no-op function kept for backward compatibility.
- **Multimodal Audio Processing**: Gemini Flash models natively accept Base64-encoded audio (`audio/m4a`, `audio/wav`, `audio/mp4`) as inline data parts, allowing audio evaluation without external transcription service overhead.
- **Response Latency**: Direct API calls to Gemini 2.5 Flash / 3 Flash complete within 1-2 seconds, fulfilling the requirement specified in `PROJECT.md` (Interface Contracts: 1-3 seconds).

### 2. Multi-Model Waterfall & Rate Limit Resiliency
- **Model Fallback Chain**:
  - `lib/gemini.ts` and `supabase/functions/check-recitation-v2/index.ts` iterate across a prioritized model chain:
    1. `gemini-3-flash-preview` (Gemini 3 Flash, highest accuracy, 20 RPD)
    2. `gemini-2.5-flash` (Proven audio multimodal, 20 RPD)
    3. `gemini-3.1-flash-lite-preview` (Emergency fallback, 500 RPD)
  - `lib/ai-models.ts` implements `generateWithFallback()` with exponential backoff (1s, 2s, 4s delays, max 3 retries).
- **Rate Limit Management**:
  - `lib/ai-models.ts:75-101` maintains a `rateLimitCache` (`Map<ModelType, { until: Date, count: number }>`). When HTTP 429/quota error occurs, the primary model is blacklisted for 60 seconds, bypassing retries and immediately using the fallback model.
  - Rate limit events are logged asynchronously to Supabase via `log_api_rate_limit` RPC for monitoring (`lib/ai-models.ts:106-125`).

### 3. VAD Continuous Chunking Pipeline
- **Real-Time Metering**: `useVADRecorder.ts:197-242` polls `expo-audio` status every 100ms (`METERING_INTERVAL_MS`). Metering dB levels are normalized to a 0..1 scale and stored in Reanimated `SharedValue`s (`meterLevelShared`, `meterHistoryShared`) to avoid React re-renders.
- **Auto-Split Logic**:
  - Silence is triggered when `dB < -35 dB` (`SILENCE_THRESHOLD_DB`).
  - If silence persists for 3000ms (`SILENCE_DURATION_MS`) and the chunk duration is at least 3000ms (`MIN_CHUNK_DURATION_MS`), `splitChunk()` is called.
  - Current recording stops, a new recording starts immediately (0-gap for the user), and the chunk is dispatched asynchronously (`fire-and-forget`) to `checkRecitationWithMuaalem()`.
- **Session Finalization & Result Aggregation**:
  - `finishSession()` sends the final audio segment (regardless of length) and polls in-flight chunks every 500ms (max wait 30s).
  - `aggregateChunkResults()` (`hooks/useVADRecorder.ts:505-536`) calculates a weighted average score for all successful chunks and deduplicates mistakes by description.

### 4. 6-Phase Hybrid Prompt Engineering & Phonetic Precision
The system prompt (`HYBRID_SYSTEM_PROMPT` in `lib/gemini.ts` and `check-recitation-v2/index.ts`) enforces 6 distinct evaluation phases:
1. **Phase 1 — Silent Transcription**: Transcribes student audio as ground-truth.
2. **Phase 2 — Completeness Check**: Calculates `completenessRatio = words_recited / total_reference_words`. Penalizes incomplete recitation (score < 50 if ratio < 0.50).
3. **Phase 3 — Madd & Ghunnah**: Utilizes `PHONETIC_REF` character counts (`اا` = 2 counts, `اааа` = 4 counts, `аааааа` = 6 counts) as ground truth to prevent AI timing hallucinations.
4. **Phase 4 — Makhraj Check**: Compares student articulation against Sheikh reference clip (`AUDIO 2`) for critical letter pairs (`ع/ا`, `ح/ه`, `ق/ك`, `ط/ت`, `ص/س`, `ذ/ز`, `ظ/ز`).
5. **Phase 5 — Tajweed Rules**: Evaluates Qalqalah, Idgham, Ikhfaa, Iqlab, and Izhar rules.
6. **Phase 6 — Score Calculation**: `finalScore = round(completenessRatio × tajweedAccuracy × 100)`.

### 5. Audio Player Isolation & Contract Compliance
- `lib/audio-engine.ts` uses `react-native-track-player` (v4) with native ExoPlayer (Android) / AVQueuePlayer (iOS).
- Before starting recording in `app/recite.tsx:320-325`, `audioEngine.getSnapshot()` checks if audio is playing and pauses it. After recording finishes, `configureAudioSession(true)` restores the audio session, ensuring zero audio player regression.

---

## Consistency & Edge Case Analysis

1. **Model ID Naming Divergence**:
   - `lib/ai-models.ts` references `AI_MODELS.PRIMARY_AUDITOR = 'gemini-flash-latest'`.
   - `lib/gemini.ts` and Edge Function reference explicit version strings `['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview']`.
   - *Risk*: `gemini-flash-latest` may resolve differently depending on SDK version or API key tier.
2. **Audio File Validation & Safeguards**:
   - `lib/muaalem-api.ts:67-79` validates file existence and checks `fileSize >= 5,000` bytes. Empty or micro-recordings return an instant friendly Arabic message without spending API tokens.
   - `lib/recitation-storage.ts:65-69` checks for `MAX_FILE_SIZE_MB = 10` before uploading.
3. **Offline Resiliency**:
   - `lib/offline-queue.ts` catches failed network requests or offline status, queues `QueuedUpload` / `QueuedRecitationEvent` items into `AsyncStorage`, and retries up to 3 times when `checkConnectivity()` succeeds.

---

## Recommended Action Plan for Implementers

1. **Unified Model Constants**:
   - Centralize model names into `lib/ai-models.ts` and import them in `lib/gemini.ts` and Edge Function configurations to maintain single-source-of-truth.
2. **Dynamic VAD Tuning**:
   - Add user option or noise calibration for `SILENCE_THRESHOLD_DB` (-35 dB) to handle quieter voices or background noise.
3. **Sheikh Clip Caching**:
   - Cache fetched Sheikh reference audio clips in memory during continuous VAD sessions to avoid re-fetching clips on every split chunk.
