# 🔒 MutqinApp — Comprehensive Architectural Audit & Code Review

> **Auditor**: Principal Mobile App Architect & Security Auditor  
> **Date**: 2026-04-18  
> **Scope**: Full codebase — `app/`, `lib/`, `hooks/`, `components/`, `constants/`  
> **Stack**: React Native 0.81.5 / Expo 54 / Supabase 2.95 / RNTP 4.1.2 / Reanimated 4.1

---

## 🔴 Critical Bugs & Memory Leaks

### 1. `useVADRecorder` — Busy-Wait Loop Blocks JS Thread (App Freeze)

**File**: `hooks/useVADRecorder.ts:401-407`

```typescript
// CURRENT — blocks JS thread for up to 30 seconds
while (
  chunkResultsRef.current.some(c => c.processing) &&
  Date.now() < deadline
) {
  await new Promise(resolve => setTimeout(resolve, 300));
}
```

This synchronous `while` loop with 300ms `setTimeout` polls every 300ms, keeping the microtask queue saturated. On low-end devices, this causes visible UI jank and can trigger ANR (Application Not Responding) warnings on Android. The JS thread is blocked from processing user input during each 300ms wait cycle.

**Fix**:
```typescript
// FIXED — proper async polling without blocking
const POLL_INTERVAL = 500;
const MAX_WAIT = 30_000;
const startTime = Date.now();

await new Promise<void>((resolve) => {
  const check = setInterval(() => {
    const allDone = !chunkResultsRef.current.some(c => c.processing);
    const timedOut = Date.now() - startTime >= MAX_WAIT;
    if (allDone || timedOut) {
      clearInterval(check);
      resolve();
    }
  }, POLL_INTERVAL);
});
```

---

### 2. `useVADRecorder` — Fire-and-Forget API Calls Mutate Refs After Unmount

**File**: `hooks/useVADRecorder.ts:269-286`

```typescript
// CURRENT — no unmount guard
checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
  .then(assessment => {
    chunkEntry.assessment = assessment;   // mutates ref after unmount
    chunkEntry.processing = false;
    setState(prev => ({                    // setState after unmount
      ...prev,
      chunksCompleted: prev.chunksCompleted + 1,
    }));
  })
```

If the component unmounts while a Muaalem API call is in-flight (5-minute timeout!), the `.then()` callback mutates `chunkResultsRef` and calls `setState` on an unmounted component. This causes the React "setState on unmounted component" warning and can corrupt the ref data for the next mount cycle.

**Fix**:
```typescript
// FIXED — add mounted guard
const mountedRef = useRef(true);
useEffect(() => { return () => { mountedRef.current = false; }; }, []);

// In splitChunk:
checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
  .then(assessment => {
    if (!mountedRef.current) return;  // ← guard
    chunkEntry.assessment = assessment;
    chunkEntry.processing = false;
    setState(prev => ({
      ...prev,
      chunksCompleted: prev.chunksCompleted + 1,
    }));
  })
  .catch(err => {
    if (!mountedRef.current) return;  // ← guard
    chunkEntry.assessment = { score: 0, mistakes: [], error: 'فشل تحليل المقطع' };
    chunkEntry.processing = false;
    setState(prev => ({
      ...prev,
      chunksCompleted: prev.chunksCompleted + 1,
    }));
  });
```

---

### 3. `AudioEngine` — `playerReady` Flag Never Reset in `destroy()`

**File**: `lib/audio-engine.ts:820-826`

```typescript
// CURRENT
destroy() {
  this.stop();
  this.eventSubs.forEach(s => s.remove());
  this.eventSubs = [];
  this.eventsRegistered = false;
  this.listeners.clear();
  // ❌ playerReady is NEVER reset to false
}
```

After `destroy()`, the module-level `playerReady` remains `true`. If `setupPlayer()` is called again (e.g., after app backgrounding or hot reload), it silently skips initialization, but the native player has been torn down. This causes **silent playback failure** — no error, no sound.

**Fix**:
```typescript
// FIXED
destroy() {
  this.stop();
  this.eventSubs.forEach(s => s.remove());
  this.eventSubs = [];
  this.eventsRegistered = false;
  this.listeners.clear();
  playerReady = false;  // ← allow re-initialization
}
```

---

### 4. `recite.tsx` — `saveResults` Race Condition on `daily_logs.pages_completed`

**File**: `app/recite.tsx:587-611`

```typescript
// CURRENT — read-then-write is NOT atomic
const { data: existingLog } = await supabase
  .from('daily_logs')
  .select('id, pages_completed')
  .eq('user_id', userId)
  .eq('date', today)
  .eq('surah_number', surahNumber)
  .maybeSingle();

if (existingLog) {
  // ❌ RACE: another session could update pages_completed between read and write
  await supabase.from('daily_logs').update({
    pages_completed: (existingLog.pages_completed || 0) + uniquePages,
    ...
  }).eq('id', existingLog.id);
}
```

If a user completes two recitation sessions in quick succession (e.g., two ayah ranges), both reads see the same `pages_completed` value, and the second write overwrites the first increment. **Lost updates = lost XP tracking.**

**Fix**:
```typescript
// FIXED — use atomic RPC (like awardXP_atomic pattern)
const { error: logError } = await supabase.rpc('upsert_daily_log', {
  p_user_id: userId,
  p_date: today,
  p_surah_number: surahNumber,
  p_verse_from: selectedRange.from,
  p_verse_to: selectedRange.to,
  p_pages: uniquePages,
  p_score: assessment.score ?? null,
});
// SQL: INSERT ... ON CONFLICT (user_id, date, surah_number)
//      DO UPDATE SET pages_completed = daily_logs.pages_completed + p_pages
```

---

### 5. `recite.tsx` — `saveWithRetry` Retries Non-Idempotent POST Operations

**File**: `app/recite.tsx:74-109`

The `saveWithRetry` helper retries ALL errors including 429/5xx on **POST/INSERT/DELETE** operations. This means:
- `mistake_log.insert` → duplicate mistakes inserted on retry
- `bookmarks.delete` → no-op on retry (safe)
- `bookmarks.upsert` → safe (idempotent)
- `daily_logs.insert` → **duplicate log entries** on retry
- `awardXP` via `checkAchievements` → **duplicate XP awards** on retry

**Fix**: Add an `idempotencyKey` parameter and use it in Supabase inserts, OR restrict retries to GET/SELECT only:

```typescript
// FIXED — only retry read operations and upserts (which are idempotent)
const isIdempotent = (fn: SupabaseMutationFn<T>) => {
  // Mark functions explicitly as idempotent or not
  return (fn as any)._idempotent === true;
};

// For mistake_log, use ON CONFLICT DO NOTHING:
await supabase.from('mistake_log').insert(mistakesToSave)
  .onConflict('user_id,surah,verse,error_description,created_at'); // unique constraint needed
```

---

### 6. `auth.tsx` — Double Navigation Race Condition

**File**: `lib/auth.tsx:69-86` + `lib/auth.tsx:99-110`

```typescript
// onAuthStateChange fires SIGNED_IN → router.replace('/(tabs)')
// useEffect fires simultaneously → sees user && isAuthPage → router.replace('/(tabs)')
```

Both the `onAuthStateChange` callback and the protected-route `useEffect` can fire in the same render cycle, causing **double navigation** which can crash expo-router or cause a blank screen flash.

**Fix** (already partially addressed by the comment on line 96-109, but the guard is incomplete):
```typescript
// FIXED — add a navigation lock
const navigatingRef = useRef(false);

// In onAuthStateChange:
if (event === 'SIGNED_IN' && newSession) {
  if (navigatingRef.current) return;
  navigatingRef.current = true;
  const hasPlan = await checkHasPlan(newSession.user.id);
  router.replace(hasPlan ? '/(tabs)' : '/(tabs)/plan');
  setTimeout(() => { navigatingRef.current = false; }, 1000);
}

// In the protected route effect:
if (!user && !isAuthPage) {
  if (!navigatingRef.current) {
    navigatingRef.current = true;
    router.replace('/login');
    setTimeout(() => { navigatingRef.current = false; }, 1000);
  }
}
```

---

## 🟠 Performance Bottlenecks & UI Thread Blocking

### 1. `recite.tsx` — 20+ `useState` Hooks Cause Re-render Cascades

**File**: `app/recite.tsx:137-208`

The `ReciteScreenInner` component has **20+ useState hooks**. Any single state change (e.g., `setActiveVerseIndex` from audio playback) triggers a re-render that re-evaluates ALL 20 state variables, ALL useMemo dependencies, and ALL useCallback dependencies. With audio playback updating the verse index every 200ms in gapless mode, this creates **5 re-renders/second** minimum.

**Fix**: Split into smaller components with focused state:
```typescript
// FIXED — extract state into domain-specific sub-components
function ReciteScreenInner() {
  return (
    <ReciteAudioProvider surahNumber={surahNumber} verses={verses}>
      <ReciteRecordingProvider referenceText={rangedVersesForRef}>
        <ReciteUIProvider>
          <ReciteHeader />
          <ReciteContent />
          <ReciteFooter />
        </ReciteUIProvider>
      </ReciteRecordingProvider>
    </ReciteAudioProvider>
  );
}
```

---

### 2. `useVADRecorder` — 10 Re-renders/Second from Metering Poller

**File**: `hooks/useVADRecorder.ts:192-231`

```typescript
// CURRENT — setState every 100ms = 10 re-renders/sec
meteringTimerRef.current = setInterval(async () => {
  setState(prev => {
    const newHistory = [...prev.meterHistory.slice(1), normalised]; // ← new array every 100ms
    return { ...prev, meterLevel: normalised, meterHistory: newHistory };
  });
}, METERING_INTERVAL_MS);
```

This creates a new `meterHistory` array every 100ms, triggering a full re-render cascade through the entire `ReciteScreenInner` component tree. The waveform UI only needs ~5 FPS to look smooth.

**Fix**:
```typescript
// FIXED — use Reanimated shared values for metering (UI thread only)
const meterLevel = useSharedValue(0);
const meterHistory = useSharedValue<number[]>(new Array(HISTORY_SIZE).fill(0));

// In the poller (still JS thread, but NO setState):
meterLevel.value = normalised;
meterHistory.value = [...meterHistory.value.slice(1), normalised];

// In the waveform component (UI thread, 0 re-renders):
const animatedStyle = useAnimatedStyle(() => ({
  height: meterLevel.value * MAX_BAR_HEIGHT,
}));
```

---

### 3. `recite.tsx` — `saveResults` Makes 6+ Sequential Supabase Calls

**File**: `app/recite.tsx:550-741`

The `saveResults` function makes these calls **sequentially**:
1. `mistake_log.insert` (with retry)
2. `daily_logs.select` → `daily_logs.update/insert` (with retry)
3. `updateReviewSchedule` (Supabase call)
4. `updateStreak` (Supabase read + write)
5. `awardXP` × 2-3 calls (each with potential RPC + fallback)
6. `checkAchievements` (Supabase read + N writes)
7. `upsert_surah_progress` RPC (with retry)
8. `advanceWardPosition` RPC

Total: **8-12 sequential network round-trips** = 2-4 seconds of blocking on the save path.

**Fix**: Parallelize independent operations:
```typescript
// FIXED — parallelize independent mutations
await Promise.all([
  saveMistakes(userId, assessment.mistakes),
  saveDailyLog(userId, surahNumber, selectedRange, assessment.score, uniquePages),
  updateReviewSchedule(userId, surahNumber, assessment.score ?? 0),
]);

// Then sequential dependent operations
const streakStatus = await updateStreak(userId);
await Promise.all([
  awardXP(userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation'),
  streakStatus === 'incremented' ? awardXP(userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak') : Promise.resolve(),
  !assessment.mistakes?.length ? awardXP(userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation') : Promise.resolve(),
]);
await checkAchievements(userId);
```

---

### 4. `login.tsx` — Uses Legacy `Animated` API (JS Thread Blocking)

**File**: `app/login.tsx:39-74`

```typescript
// CURRENT — runs on JS thread, blocks during keyboard transitions
const logoScale = React.useRef(new Animated.Value(0.5)).current;
Animated.spring(logoScale, { toValue: 1, ...SpringConfig.bouncy, useNativeDriver: true }).start();
```

While `useNativeDriver: true` is used (good!), the legacy `Animated` API still requires JS thread coordination for lifecycle management. The rest of the app uses Reanimated 4 — this inconsistency creates two animation runtimes.

**Fix**: Migrate to Reanimated (consistent with the rest of the app):
```typescript
// FIXED — Reanimated (UI thread, consistent with app)
const logoScale = useSharedValue(0.5);
const logoOpacity = useSharedValue(0);

useEffect(() => {
  logoScale.value = withSpring(1, SpringConfig.bouncy);
  logoOpacity.value = withTiming(1, { duration: AnimationDuration.slow });
}, []);

const logoAnimatedStyle = useAnimatedStyle(() => ({
  opacity: logoOpacity.value,
  transform: [{ scale: logoScale.value }],
}));
```

---

### 5. `gamification.ts` — `checkAchievements` Sequential N+1 Query Pattern

**File**: `lib/gamification.ts:248-253`

```typescript
// CURRENT — N sequential Supabase calls
for (const achievement of achievementsToAward) {
  await awardAchievement(userId, achievement);  // each = SELECT + INSERT + awardXP + notification
}
```

With 7 potential achievements (4 streak + 3 surah), this creates up to **28 sequential Supabase calls** in the worst case.

**Fix**:
```typescript
// FIXED — batch check + parallel award
const existingAchievements = await supabase
  .from('achievements')
  .select('achievement_type')
  .eq('user_id', userId)
  .in('achievement_type', achievementsToAward.map(a => a.type));

const existingTypes = new Set(existingAchievements.data?.map(a => a.achievement_type));
const newAchievements = achievementsToAward.filter(a => !existingTypes.has(a.type));

await Promise.all(newAchievements.map(a => awardAchievement(userId, a)));
```

---

## 🟡 Architectural Flaws & Security Vulnerabilities

### 1. 🔴 CRITICAL: Gemini API Key Exposed Client-Side

**File**: `lib/gemini.ts:3`

```typescript
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!);
```

`EXPO_PUBLIC_` prefixed env vars are **bundled into the JS bundle in plaintext**. Anyone who downloads the APK/IPA can extract the Gemini API key with a single `strings` command. This allows unlimited API usage at your expense and potential abuse.

**Fix**: Route all AI calls through a Supabase Edge Function:
```typescript
// FIXED — proxy through Supabase Edge Function
export async function checkRecitation(
  userAudioBase64: string,
  referenceText: string,
): Promise<RecitationAssessment> {
  const { data, error } = await supabase.functions.invoke('check-recitation', {
    body: { audio: userAudioBase64, referenceText },
  });
  if (error) throw error;
  return data;
}
```

---

### 2. 🔴 CRITICAL: Muaalem API Has No Authentication

**File**: `lib/muaalem-api.ts:21-22`

```typescript
const MUAALEM_API_URL = 'https://dr364873-tajweed-base.hf.space/correct-recitation';
```

The Hugging Face Space URL is hardcoded and has **zero authentication**. Anyone who reads the source code (or intercepts network traffic) can:
- Send arbitrary audio to your HF Space (costing you compute credits)
- Flood the endpoint (DoS)
- Extract the model behavior for competitive cloning

**Fix**: Add API key authentication via Supabase Edge Function proxy:
```typescript
// FIXED — route through authenticated proxy
const { data, error } = await supabase.functions.invoke('muaalem-proxy', {
  body: { audioUri, uthmaniText, ayahRange },
});
```

---

### 3. 🟠 `gamification.ts` — `awardXP` Fallback Race Condition

**File**: `lib/gamification.ts:119-152`

```typescript
// CURRENT — fallback is read-then-write (not atomic)
const { data: progress } = await supabase
  .from('user_progress')
  .select('*')
  .eq('user_id', userId)
  .single();

const currentXP = progress?.total_xp || 0;
const newTotalXP = currentXP + xpAmount;  // ❌ RACE: another call could increment between read and write
```

When the `award_xp_atomic` RPC is not deployed, the fallback reads `total_xp`, adds to it, and writes back. Two concurrent `awardXP` calls (which happen in `saveResults`) will both read the same value and one increment will be lost.

**Fix**: Always use the RPC; remove the fallback or add a client-side mutex:
```typescript
// FIXED — if RPC fails, queue XP locally and retry
let xpQueue: Array<{ userId: string; amount: number; reason: string }> = [];

export async function awardXP(userId: string, xpAmount: number, reason: string) {
  const { data, error } = await supabase.rpc('award_xp_atomic', {
    p_user_id: userId, p_amount: xpAmount, p_reason: reason,
  });
  if (error) {
    // Queue for later atomic processing instead of unsafe read-then-write
    xpQueue.push({ userId, amount: xpAmount, reason });
    console.warn('[awardXP] Queued for retry:', reason);
    return null;
  }
  // ... handle success
}
```

---

### 4. 🟠 `notifications.ts` — Push Token Can Be Reassigned to Different User

**File**: `lib/notifications.ts:162-170`

```typescript
await supabase.from('push_tokens').upsert({
  user_id: userId, token, platform: Platform.OS,
  updated_at: new Date().toISOString(),
}, { onConflict: 'token' });  // ❌ conflict on token, not user_id
```

If User A's device is sold/given to User B, the same push token gets `user_id` overwritten to User B. Now User A's notifications go to User B's device. The conflict target should be `(user_id, token)` or just `user_id`.

**Fix**:
```typescript
// FIXED — conflict on user_id + platform (one token per user per platform)
await supabase.from('push_tokens').upsert({
  user_id: userId, token, platform: Platform.OS,
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id,platform' });
```

---

### 5. 🟡 `recite.tsx` — `AbortController` Never Renewed After Abort

**File**: `app/recite.tsx:245-253`

```typescript
const abortControllerRef = React.useRef(new AbortController());
React.useEffect(() => {
  return () => {
    abortControllerRef.current.abort();  // ← aborts on unmount
    // ❌ But the controller is never recreated for subsequent API calls
  };
}, []);
```

After the first unmount, the `AbortController` is permanently aborted. If the component remounts (React Navigation keeps screens in memory), all subsequent `wakeUpMuaalemSpace(abortControllerRef.current.signal)` calls will immediately abort.

**Fix**:
```typescript
// FIXED — create fresh controller per effect
React.useEffect(() => {
  const controller = new AbortController();
  wakeUpMuaalemSpace(controller.signal);
  return () => { controller.abort(); };
}, [surahNumber]);
```

---

### 6. 🟡 `ward.ts` — Module-Level Mutable Global Cache (Not Thread-Safe)

**File**: `lib/ward.ts:22-23`

```typescript
const pageVersesCache: Record<number, number> = {};
let cacheReady = false;
```

This module-level mutable state:
- Survives hot reloads with stale data
- Is never invalidated if the DB changes
- Creates implicit coupling (any caller must call `populatePageVerseCache` before using `getVersesForPage`)
- Returns silent wrong data (fallback `15`) if cache isn't populated

**Fix**: Make the cache a class instance or use a proper lazy initialization pattern:
```typescript
// FIXED — lazy cache with proper invalidation
class PageVerseCache {
  private cache: Record<number, number> = {};
  private ready = false;

  populate(db: { getAllSync: <T>(sql: string, params?: unknown[]) => T[] }): void {
    if (this.ready) return;
    const rows = db.getAllSync<{ page: number; cnt: number }>(
      'SELECT page, COUNT(*) as cnt FROM Ayat GROUP BY page ORDER BY page'
    );
    for (const row of rows) this.cache[row.page] = row.cnt;
    this.ready = true;
  }

  get(page: number): number {
    if (!this.ready) throw new Error('PageVerseCache not populated. Call populate() first.');
    return this.cache[page] ?? 15;
  }

  invalidate(): void { this.ready = false; this.cache = {}; }
}

export const pageVerseCache = new PageVerseCache();
```

---

### 7. 🟡 `settings.tsx` — No Loading State for Async Settings

**File**: `lib/settings.tsx:17-19`

```typescript
React.useEffect(() => {
  loadSettings();  // ← async, but no loading state exposed
}, []);
```

The `SettingsProvider` loads theme/fontSize from AsyncStorage asynchronously, but the context doesn't expose a `loading` state. Consumers render with default values (`theme: 'dark'`, `fontSize: 20`) before AsyncStorage resolves, causing a **flash of incorrect theme/font** on app launch.

**Fix**:
```typescript
// FIXED — add loading state
interface SettingsContextType {
  theme: 'light' | 'dark';
  fontSize: number;
  loading: boolean;  // ← new
  toggleTheme: () => void;
  setFontSize: (size: number) => void;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');
  const [fontSize, setFontSizeState] = React.useState(20);
  const [loading, setLoading] = React.useState(true);  // ← new

  React.useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedFontSize] = await Promise.all([
          AsyncStorage.getItem('theme'),
          AsyncStorage.getItem('fontSize'),
        ]);
        if (savedTheme) setTheme(savedTheme as 'light' | 'dark');
        if (savedFontSize) setFontSizeState(parseInt(savedFontSize));
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SettingsContext.Provider value={{ theme, fontSize, loading, toggleTheme, setFontSize }}>
      {children}
    </SettingsContext.Provider>
  );
}
```

---

### 8. 🟡 `recite.tsx` — `loadBookmarkState` Captures Stale Closures

**File**: `app/recite.tsx:256-285`

```typescript
React.useEffect(() => {
  loadBookmarkState();  // ← called as a regular function, not a stable callback
}, [surahNumber, user]);

async function loadBookmarkState() {
  // This function is recreated every render, but the effect only re-runs
  // when surahNumber/user change. The function captures the CURRENT render's
  // surahNumber, which is correct, but ESLint will warn about missing deps.
}
```

**Fix**: Move the function inside the effect or use `useCallback`:
```typescript
// FIXED — function inside effect to avoid stale closure risk
React.useEffect(() => {
  async function loadBookmarkState() {
    try {
      if (user) {
        const { data } = await supabase
          .from('bookmarks')
          .select('id')
          .eq('user_id', user.id)
          .eq('surah_number', surahNumber)
          .maybeSingle();
        setIsBookmarked(!!data);
      } else {
        const stored = await AsyncStorage.getItem('bookmarks');
        if (stored) {
          try { setIsBookmarked(JSON.parse(stored).includes(surahNumber)); }
          catch { /* Corrupt data — ignore */ }
        }
      }
    } catch (e) {
      console.error('Error loading bookmark state:', e);
    }
  }
  loadBookmarkState();
}, [surahNumber, user?.id]);
```

---

## 🟢 Actionable Solutions Summary

| # | Issue | File | Severity | Fix Type |
|---|-------|------|----------|----------|
| 1 | Busy-wait loop in finishSession | `hooks/useVADRecorder.ts:401` | 🔴 Critical | Replace with setInterval-based polling |
| 2 | setState after unmount in VAD | `hooks/useV                                                                                               # 🔒 MutqinApp — Comprehensive Architectural Audit & Code Review

> **Auditor**: Principal Mobile App Architect & Security Auditor
> **Date**: 2026-04-18
> **Scope**: Full codebase — `app/`, `lib/`, `hooks/`, `components/`, `constants/`
> **Stack**: React Native 0.81.5 / Expo 54 / Supabase 2.95 / RNTP 4.1.2 / Reanimated 4.1

---

## 🔴 Critical Bugs & Memory Leaks

### 1. `useVADRecorder` — Busy-Wait Loop Blocks JS Thread (App Freeze)
**File**: `hooks/useVADRecorder.ts:401-407`

```typescript
// CURRENT — blocks JS thread for up to 30 seconds
while (
  chunkResultsRef.current.some(c => c.processing) &&
  Date.now() < deadline
) {
  await new Promise(resolve => setTimeout(resolve, 300));
}
```

This `while` loop with 300ms `setTimeout` polls every 300ms, keeping the microtask queue saturated. On low-end devices, this causes visible UI jank and can trigger ANR (Application Not Responding) on Android.

**Fix**:
```typescript
// FIXED — proper async polling without blocking
const POLL_INTERVAL = 500;
const MAX_WAIT = 30_000;
const startTime = Date.now();

await new Promise<void>((resolve) => {
  const check = setInterval(() => {
    const allDone = !chunkResultsRef.current.some(c => c.processing);
    const timedOut = Date.now() - startTime >= MAX_WAIT;
    if (allDone || timedOut) {
      clearInterval(check);
      resolve();
    }
  }, POLL_INTERVAL);
});
```

---

### 2. `useVADRecorder` — Fire-and-Forget API Calls Mutate Refs After Unmount
**File**: `hooks/useVADRecorder.ts:269-286`

```typescript
// CURRENT — no unmount guard
checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
  .then(assessment => {
    chunkEntry.assessment = assessment;  // mutates ref after unmount
    chunkEntry.processing = false;
    setState(prev => ({                   // setState after unmount
      ...prev,
      chunksCompleted: prev.chunksCompleted + 1,
    }));
  })
```

If the component unmounts while a Muaalem API call is in-flight (5-minute timeout!), the `.then()` callback mutates `chunkResultsRef` and calls `setState` on an unmounted component.

**Fix**:
```typescript
// Add mounted guard
const mountedRef = useRef(true);
useEffect(() => { return () => { mountedRef.current = false; }; }, []);

// In splitChunk:
checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
  .then(assessment => {
    if (!mountedRef.current) return;  // ← guard
    chunkEntry.assessment = assessment;
    chunkEntry.processing = false;
    setState(prev => ({ ...prev, chunksCompleted: prev.chunksCompleted + 1 }));
  })
  .catch(err => {
    if (!mountedRef.current) return;  // ← guard
    chunkEntry.assessment = { score: 0, mistakes: [], error: 'فشل تحليل المقطع' };
    chunkEntry.processing = false;
    setState(prev => ({ ...prev, chunksCompleted: prev.chunksCompleted + 1 }));
  });
```

---

### 3. `AudioEngine` — `playerReady` Flag Never Reset in `destroy()`
**File**: `lib/audio-engine.ts:820-826`

```typescript
destroy() {
  this.stop();
  this.eventSubs.forEach(s => s.remove());
  this.eventSubs = [];
  this.eventsRegistered = false;
  this.listeners.clear();
  // ❌ playerReady is NEVER reset to false
}
```

After `destroy()`, the module-level `playerReady` remains `true`. If `setupPlayer()` is called again (e.g., after hot reload), it silently skips initialization, but the native player has been torn down — causing **silent playback failure**.

**Fix**:
```typescript
destroy() {
  this.stop();
  this.eventSubs.forEach(s => s.remove());
  this.eventSubs = [];
  this.eventsRegistered = false;
  this.listeners.clear();
  playerReady = false;  // ← allow re-initialization
}
```

---

### 4. `recite.tsx` — `saveResults` Race Condition on `daily_logs.pages_completed`
**File**: `app/recite.tsx:587-611`

```typescript
// CURRENT — read-then-write is NOT atomic
const { data: existingLog } = await supabase
  .from('daily_logs')
  .select('id, pages_completed')
  .eq('user_id', userId)
  .eq('date', today)
  .eq('surah_number', surahNumber)
  .maybeSingle();

if (existingLog) {
  // ❌ RACE: another session could update pages_completed between read and write
  await supabase.from('daily_logs').update({
    pages_completed: (existingLog.pages_completed || 0) + uniquePages,
    ...
  }).eq('id', existingLog.id);
}
```

Two concurrent sessions read the same `pages_completed`, and the second write overwrites the first increment — **lost XP tracking**.

**Fix**:
```typescript
// FIXED — use atomic RPC (like awardXP_atomic pattern)
const { error: logError } = await supabase.rpc('upsert_daily_log', {
  p_user_id: userId,
  p_date: today,
  p_surah_number: surahNumber,
  p_verse_from: selectedRange.from,
  p_verse_to: selectedRange.to,
  p_pages: uniquePages,
  p_score: assessment.score ?? null,
});
// SQL: INSERT ... ON CONFLICT (user_id, date, surah_number)
//   DO UPDATE SET pages_completed = daily_logs.pages_completed + p_pages
```

---

### 5. `recite.tsx` — `saveWithRetry` Retries Non-Idempotent INSERT Operations
**File**: `app/recite.tsx:74-109`

The `saveWithRetry` helper retries ALL errors including 429/5xx on **POST/INSERT/DELETE** operations. This means:
- `mistake_log.insert` → **duplicate mistakes** inserted on retry
- `daily_logs.insert` → **duplicate log entries** on retry
- `awardXP` via `checkAchievements` → **duplicate XP awards** on retry

**Fix**: Add idempotency keys or restrict retries to idempotent operations only:
```typescript
// For mistake_log, add ON CONFLICT DO NOTHING:
await supabase.from('mistake_log').insert(mistakesToSave);

// For daily_logs, always use upsert with conflict target:
await supabase.from('daily_logs').upsert({ ... }, { onConflict: 'user_id,date,surah_number' });
```

---

### 6. `auth.tsx` — Double Navigation Race Condition
**File**: `lib/auth.tsx:69-86` + `lib/auth.tsx:99-110`

Both `onAuthStateChange('SIGNED_IN')` and the protected-route `useEffect` can fire in the same render cycle, causing **double navigation** which crashes expo-router or causes blank screen flash.

**Fix**:
```typescript
const navigatingRef = useRef(false);

// In onAuthStateChange:
if (event === 'SIGNED_IN' && newSession) {
  if (navigatingRef.current) return;
  navigatingRef.current = true;
  const hasPlan = await checkHasPlan(newSession.user.id);
  router.replace(hasPlan ? '/(tabs)' : '/(tabs)/plan');
  setTimeout(() => { navigatingRef.current = false; }, 1000);
}

// In the protected route effect:
if (!user && !isAuthPage) {
  if (!navigatingRef.current) {
    navigatingRef.current = true;
    router.replace('/login');
    setTimeout(() => { navigatingRef.current = false; }, 1000);
  }
}
```

---

## 🟠 Performance Bottlenecks & UI Thread Blocking

### 1. `recite.tsx` — 20+ `useState` Hooks Cause Re-render Cascades
**File**: `app/recite.tsx:137-208`

`ReciteScreenInner` has **20+ useState hooks**. Any single state change (e.g., `setActiveVerseIndex` from audio playback every 200ms in gapless mode) triggers a re-render that re-evaluates ALL state variables and memo dependencies — **5 re-renders/second** minimum.

**Fix**: Split into smaller components with focused state domains:
```typescript
function ReciteScreenInner() {
  return (
    <ReciteAudioProvider surahNumber={surahNumber} verses={verses}>
      <ReciteRecordingProvider referenceText={rangedVersesForRef}>
        <ReciteUIProvider>
          <ReciteHeader />
          <ReciteContent />
          <ReciteFooter />
        </ReciteUIProvider>
      </ReciteRecordingProvider>
    </ReciteAudioProvider>
  );
}
```

---

### 2. `useVADRecorder` — 10 Re-renders/Second from Metering Poller
**File**: `hooks/useVADRecorder.ts:192-231`

```typescript
// CURRENT — setState every 100ms = 10 re-renders/sec
setState(prev => {
  const newHistory = [...prev.meterHistory.slice(1), normalised];
  return { ...prev, meterLevel: normalised, meterHistory: newHistory };
});
```

Creates a new array every 100ms, triggering full re-render cascade. Waveform UI only needs ~5 FPS.

**Fix**: Use Reanimated shared values for metering (UI thread only, 0 re-renders):
```typescript
const meterLevel = useSharedValue(0);
const meterHistory = useSharedValue<number[]>(new Array(HISTORY_SIZE).fill(0));

// In poller (NO setState):
meterLevel.value = normalised;
meterHistory.value = [...meterHistory.value.slice(1), normalised];

// In waveform component (UI thread):
const animatedStyle = useAnimatedStyle(() => ({
  height: meterLevel.value * MAX_BAR_HEIGHT,
}));
```

---

### 3. `recite.tsx` — `saveResults` Makes 8-12 Sequential Supabase Calls
**File**: `app/recite.tsx:550-741`

The `saveResults` function makes 8-12 sequential network round-trips = 2-4 seconds of blocking on the save path.

**Fix**: Parallelize independent operations:
```typescript
// Parallelize independent mutations
await Promise.all([
  saveMistakes(userId, assessment.mistakes),
  saveDailyLog(userId, surahNumber, selectedRange, assessment.score, uniquePages),
  updateReviewSchedule(userId, surahNumber, assessment.score ?? 0),
]);

// Then sequential dependent operations
const streakStatus = await updateStreak(userId);
await Promise.all([
  awardXP(userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation'),
  streakStatus === 'incremented'
    ? awardXP(userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak')
    : Promise.resolve(),
  !assessment.mistakes?.length
    ? awardXP(userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation')
    : Promise.resolve(),
]);
await checkAchievements(userId);
```

---

### 4. `login.tsx` — Uses Legacy `Animated` API (Inconsistent with App)
**File**: `app/login.tsx:39-74`

The rest of the app uses Reanimated 4, but login uses legacy `Animated`. This creates two animation runtimes and inconsistent patterns.

**Fix**: Migrate to Reanimated (consistent with the rest of the app):
```typescript
const logoScale = useSharedValue(0.5);
const logoOpacity = useSharedValue(0);

useEffect(() => {
  logoScale.value = withSpring(1, SpringConfig.bouncy);
  logoOpacity.value = withTiming(1, { duration: AnimationDuration.slow });
}, []);

const logoAnimatedStyle = useAnimatedStyle(() => ({
  opacity: logoOpacity.value,
  transform: [{ scale: logoScale.value }],
}));
```

---

### 5. `gamification.ts` — `checkAchievements` Sequential N+1 Query Pattern
**File**: `lib/gamification.ts:248-253`

```typescript
for (const achievement of achievementsToAward) {
  await awardAchievement(userId, achievement);  // each = SELECT + INSERT + awardXP + notification
}
```

With 7 potential achievements, this creates up to **28 sequential Supabase calls**.

**Fix**:
```typescript
// Batch check + parallel award
const { data: existing } = await supabase
  .from('achievements')
  .select('achievement_type')
  .eq('user_id', userId)
  .in('achievement_type', achievementsToAward.map(a => a.type));

const existingTypes = new Set(existing?.map(a => a.achievement_type));
const newAchievements = achievementsToAward.filter(a => !existingTypes.has(a.type));
await Promise.all(newAchievements.map(a => awardAchievement(userId, a)));
```

---

## 🟡 Architectural Flaws & Security Vulnerabilities

### 1. 🔴 CRITICAL: Gemini API Key Exposed Client-Side
**File**: `lib/gemini.ts:3`

```typescript
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY!);
```

`EXPO_PUBLIC_` prefixed env vars are **bundled into the JS bundle in plaintext**. Anyone who downloads the APK/IPA can extract the key with a single `strings` command.

**Fix**: Route all AI calls through a Supabase Edge Function:
```typescript
export async function checkRecitation(
  userAudioBase64: string, referenceText: string,
): Promise<RecitationAssessment> {
  const { data, error } = await supabase.functions.invoke('check-recitation', {
    body: { audio: userAudioBase64, referenceText },
  });
  if (error) throw error;
  return data;
}
```

---

### 2. 🔴 CRITICAL: Muaalem API Has No Authentication
**File**: `lib/muaalem-api.ts:21-22`

```typescript
const MUAALEM_API_URL = 'https://dr364873-tajweed-base.hf.space/correct-recitation';
```

The HF Space URL is hardcoded with **zero authentication**. Anyone can: send arbitrary audio (costing compute credits), flood the endpoint (DoS), or extract the model.

**Fix**: Route through authenticated Supabase Edge Function proxy:
```typescript
const { data, error } = await supabase.functions.invoke('muaalem-proxy', {
  body: { audioUri, uthmaniText, ayahRange },
});
```

---

### 3. 🟠 `gamification.ts` — `awardXP` Fallback Race Condition
**File**: `lib/gamification.ts:119-152`

When the `award_xp_atomic` RPC is not deployed, the fallback reads `total_xp`, adds to it, and writes back. Two concurrent `awardXP` calls will both read the same value and one increment is lost.

**Fix**: Queue XP locally instead of unsafe read-then-write:
```typescript
let xpQueue: Array<{ userId: string; amount: number; reason: string }> = [];

export async function awardXP(userId: string, xpAmount: number, reason: string) {
  const { data, error } = await supabase.rpc('award_xp_atomic', {
    p_user_id: userId, p_amount: xpAmount, p_reason: reason,
  });
  if (error) {
    xpQueue.push({ userId, amount: xpAmount, reason });
    console.warn('[awardXP] Queued for retry:', reason);
    return null;
  }
  // ... handle success
}
```

---

### 4. 🟠 `notifications.ts` — Push Token Can Be Reassigned to Different User
**File**: `lib/notifications.ts:162-170`

```typescript
await supabase.from('push_tokens').upsert({
  user_id: userId, token, platform: Platform.OS,
}, { onConflict: 'token' });  // ❌ conflict on token, not user_id
```

If User A's device is given to User B, the same push token gets `user_id` overwritten. User A's notifications now go to User B.

**Fix**:
```typescript
await supabase.from('push_tokens').upsert({
  user_id: userId, token, platform: Platform.OS,
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id,platform' });
```

---

### 5. 🟡 `recite.tsx` — `AbortController` Never Renewed After Abort
**File**: `app/recite.tsx:245-253`

After the first unmount, the `AbortController` is permanently aborted. If the component remounts, all subsequent `wakeUpMuaalemSpace` calls immediately abort.

**Fix**:
```typescript
React.useEffect(() => {
  const controller = new AbortController();
  wakeUpMuaalemSpace(controller.signal);
  return () => { controller.abort(); };
}, [surahNumber]);
```

---

### 6. 🟡 `ward.ts` — Module-Level Mutable Global Cache (Not Thread-Safe)
**File**: `lib/ward.ts:22-23`

```typescript
const pageVersesCache: Record<number, number> = {};
let cacheReady = false;
```

This module-level mutable state survives hot reloads with stale data, is never invalidated, and returns silent wrong data (fallback `15`) if cache isn't populated.

**Fix**: Encapsulate in a class with proper invalidation:
```typescript
class PageVerseCache {
  private cache: Record<number, number> = {};
  private ready = false;

  populate(db: { getAllSync: <T>(sql: string, params?: unknown[]) => T[] }): void {
    if (this.ready) return;
    const rows = db.getAllSync<{ page: number; cnt: number }>(
      'SELECT page, COUNT(*) as cnt FROM Ayat GROUP BY page ORDER BY page'
    );
    for (const row of rows) this.cache[row.page] = row.cnt;
    this.ready = true;
  }

  get(page: number): number {
    if (!this.ready) throw new Error('PageVerseCache not populated');
    return this.cache[page] ?? 15;
  }

  invalidate(): void { this.ready = false; this.cache = {}; }
}
export const pageVerseCache = new PageVerseCache();
```

---

### 7. 🟡 `settings.tsx` — No Loading State for Async Settings (Flash of Wrong Theme)
**File**: `lib/settings.tsx:17-19`

The `SettingsProvider` loads theme/fontSize from AsyncStorage asynchronously but doesn't expose a `loading` state. Consumers render with defaults before AsyncStorage resolves, causing a **flash of incorrect theme/font** on every launch.

**Fix**:
```typescript
interface SettingsContextType {
  theme: 'light' | 'dark';
  fontSize: number;
  loading: boolean;  // ← new
  toggleTheme: () => void;
  setFontSize: (size: number) => void;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  // ... in loadSettings finally block:
  setLoading(false);
  // ... expose loading in context value
}
```

---

### 8. 🟡 `recite.tsx` — `loadBookmarkState` Captures Stale Closures
**File**: `app/recite.tsx:256-285`

The `loadBookmarkState` function is defined outside the effect but called from it, creating potential stale closure issues.

**Fix**: Move the function inside the effect:
```typescript
React.useEffect(() => {
  async function loadBookmarkState() {
    // ... function body with access to current surahNumber/user
  }
  loadBookmarkState();
}, [surahNumber, user?.id]);
```

---

## 🟢 Summary Table

| # | Issue | File | Severity | Fix Type |
|---|-------|------|----------|----------|
| 1 | Busy-wait loop blocks JS thread | `hooks/useVADRecorder.ts:401` | 🔴 Critical | Replace with setInterval polling |
| 2 | setState after unmount in VAD | `hooks/useVADRecorder.ts:269` | 🔴 Critical | Add mounted guard ref |
| 3 | `playerReady` never reset in destroy | `lib/audio-engine.ts:820` | 🔴 Critical | Reset `playerReady = false` |
| 4 | Race condition on daily_logs | `app/recite.tsx:587` | 🔴 Critical | Use atomic RPC upsert |
| 5 | Non-idempotent retries | `app/recite.tsx:74` | 🔴 Critical | Use upsert/onConflict |
| 6 | Double navigation race | `lib/auth.tsx:69` | 🔴 Critical | Add navigation lock ref |
| 7 | 20+ useState re-render cascade | `app/recite.tsx:137` | 🟠 Performance | Split into sub-components |
| 8 | 10 re-renders/sec from metering | `hooks/useVADRecorder.ts:192` | 🟠 Performance | Use Reanimated shared values |
| 9 | 8-12 sequential Supabase calls | `app/recite.tsx:550` | 🟠 Performance | Parallelize with Promise.all |
| 10 | Legacy Animated API | `app/login.tsx:39` | 🟠 Performance | Migrate to Reanimated |
| 11 | N+1 achievement queries | `lib/gamification.ts:248` | 🟠 Performance | Batch check + parallel award |
| 12 | Gemini API key in client bundle | `lib/gemini.ts:3` | 🟡 Security | Route through Edge Function |
| 13 | Muaalem API no auth | `lib/muaalem-api.ts:21` | 🟡 Security | Authenticated proxy |
| 14 | awardXP fallback race | `lib/gamification.ts:119` | 🟡 Security | Queue + retry pattern |
| 15 | Push token reassignment | `lib/notifications.ts:162` | 🟡 Security | Change onConflict target |
| 16 | AbortController never renewed | `app/recite.tsx:245` | 🟡 Architectural | Create fresh per effect |
| 17 | Module-level mutable cache | `lib/ward.ts:22` | 🟡 Architectural | Encapsulate in class |
| 18 | No settings loading state | `lib/settings.tsx:17` | 🟡 Architectural | Add loading boolean |
| 19 | Stale closure in loadBookmark | `app/recite.tsx:256` | 🟡 Architectural | Move function inside effect 