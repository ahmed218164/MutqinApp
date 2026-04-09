/**
 * lib/audio-engine.ts
 *
 * Phase E — Dual-Mode Audio Engine (Ayah-by-Ayah + Gapless)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  TWO PLAYBACK MODES:                                                   │
 * │                                                                        │
 * │  MODE 1: AYAH-BY-AYAH (audioType='ayah')                              │
 * │    - Per-verse MP3 files from storage.elmushaf.com/sound_ayat/         │
 * │    - 3-level pre-loading pipeline (unchanged from Phase D)             │
 * │    - Auto-advance with optional ayah delay                             │
 * │                                                                        │
 * │  MODE 2: GAPLESS (audioType='gapless')                                │
 * │    - Single surah MP3 from storage.elmushaf.com/sound_sura/            │
 * │    - Timing DB provides per-verse ms offsets                           │
 * │    - seekTo() for verse navigation (zero-gap playback)                 │
 * │    - Position polling for live verse highlight tracking                 │
 * │    - One download per session per surah                                │
 * │                                                                        │
 * │  Both modes emit the same state shape to consumers,                    │
 * │  so MushafHighlights works identically regardless of mode.             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import {
    createAudioPlayer,
    setAudioModeAsync,
    AudioPlayer,
} from 'expo-audio';
// Event key for playback status updates (string literal avoids brittle internal import)
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';
import * as React from 'react';
import { getAyahAudioUrl, prefetchAyahAudio, getGaplessSurahUrl } from './quran-audio-api';
import { ensureAudioLocal, ensureGaplessSurahLocal, warmCacheAsync } from './audio-cache';
import { getVerseTimings, getVerseAtPosition, getVerseOffset, SurahTimings } from './gapless-timing';
import type { Reciter } from './audio-reciters';

// ── Audio session setup ───────────────────────────────────────────────────────

let audioModeConfigured = false;

/**
 * Configure the global audio session for playback.
 * @param force  If true, reconfigure even if already configured.
 *               Used to restore playback mode after recording mode.
 */
export async function configureAudioSession(force = false) {
    if (audioModeConfigured && !force) return;
    audioModeConfigured = true;
    await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
    });
}

// ── State shape exposed to consumers ─────────────────────────────────────────

export interface AudioEngineState {
    isPlaying: boolean;
    isLoading: boolean;
    currentIndex: number;
    repeatMode: RepeatMode;
    playbackSpeed: number;
    ayahDelay: number;
    /** True when the verse just ended naturally (not a user pause). Reset on next play(). */
    didCompleteVerse: boolean;
    /** True when engine is using gapless surah-level playback */
    isGaplessMode: boolean;
}

export type RepeatMode = 1 | 2 | 3 | 'inf';
export const REPEAT_CYCLE: RepeatMode[] = [1, 2, 3, 'inf'];
export function repeatLabel(m: RepeatMode): string {
    return m === 'inf' ? '∞' : `${m}×`;
}

// ── Singleton engine class ────────────────────────────────────────────────────

class AudioEngineCore {
    // ── Deep pipeline architecture (ayah-by-ayah mode) ────────────────────────
    private player: AudioPlayer | null = null;

    // Level 1: immediately playable
    private nextPlayer: AudioPlayer | null = null;
    private nextPlayerIndex: number = -1;

    // Level 2: queued behind nextPlayer
    private warmPlayer: AudioPlayer | null = null;
    private warmPlayerIndex: number = -1;

    // Pipeline state
    private preloadInFlight = new Set<number>(); // Indices currently being pre-resolved

    private verses: any[] = [];
    private surahNumber = 0;
    private reciter: Reciter | null = null;

    private _currentIndex = 0;
    private _isPlaying   = false;
    private _isLoading   = false;
    private _repeatMode: RepeatMode = 1;
    private _repeatCount = 0;
    private _playbackSpeed = 1.0;
    private _ayahDelay = 0;          // Per-ayah delay in seconds (from reference: 0-10)
    private _learningMode = false;
    private _didCompleteVerse = false;

    // ── Gapless mode state ────────────────────────────────────────────────────
    private _isGaplessMode = false;
    private gaplessTimings: SurahTimings | null = null;
    private gaplessPositionInterval: ReturnType<typeof setInterval> | null = null;
    private gaplessLastAyah = -1;

    // Timers
    private completionSub: { remove: () => void } | null = null;
    private delayTimer: ReturnType<typeof setTimeout> | null = null;

    // React external-store listeners
    private listeners = new Set<() => void>();

    private emit() { this.listeners.forEach(fn => fn()); }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    // Cached snapshot
    private _snapshot: AudioEngineState = {
        isPlaying:        false,
        isLoading:        false,
        currentIndex:     0,
        repeatMode:       1,
        playbackSpeed:    1.0,
        ayahDelay:        0,
        didCompleteVerse: false,
        isGaplessMode:    false,
    };

    getSnapshot(): AudioEngineState {
        const s = this._snapshot;
        if (
            s.isPlaying        === this._isPlaying        &&
            s.isLoading        === this._isLoading        &&
            s.currentIndex     === this._currentIndex     &&
            s.repeatMode       === this._repeatMode       &&
            s.playbackSpeed    === this._playbackSpeed    &&
            s.ayahDelay        === this._ayahDelay        &&
            s.didCompleteVerse === this._didCompleteVerse  &&
            s.isGaplessMode    === this._isGaplessMode
        ) {
            return s;
        }
        this._snapshot = {
            isPlaying:        this._isPlaying,
            isLoading:        this._isLoading,
            currentIndex:     this._currentIndex,
            repeatMode:       this._repeatMode,
            playbackSpeed:    this._playbackSpeed,
            ayahDelay:        this._ayahDelay,
            didCompleteVerse: this._didCompleteVerse,
            isGaplessMode:    this._isGaplessMode,
        };
        return this._snapshot;
    }

    setLearningMode(enabled: boolean) {
        this._learningMode = enabled;
    }

    /** Per-ayah delay in seconds (0 = no delay). From reference: delayBetweenAyatButton */
    setAyahDelay(seconds: number) {
        this._ayahDelay = Math.max(0, Math.min(10, seconds));
        this.emit();
    }

    /** Cycle ayah delay: 0 → 1 → 2 → 3 → 5 → 10 → 0 */
    cycleAyahDelay() {
        const steps = [0, 1, 2, 3, 5, 10];
        const idx = steps.indexOf(this._ayahDelay);
        this._ayahDelay = steps[(idx + 1) % steps.length];
        this.emit();
    }

    /** Advance to the next verse (used by learning mode after user records). */
    playNext() {
        const next = this._currentIndex + 1;
        if (next < this.verses.length) {
            this.play(next);
        }
    }

    // ── Configuration ─────────────────────────────────────────────────────────

    configure(surahNumber: number, verses: any[], reciter: Reciter) {
        console.log(`[AudioEngine] configure: surah=${surahNumber}, verses=${verses.length}, reciter=${reciter.id}, type=${reciter.audioType}`);
        this.surahNumber  = surahNumber;
        this.verses       = verses;
        this.reciter      = reciter;
        this._isGaplessMode = reciter.audioType === 'gapless';
        // Invalidate entire pipeline (verses/reciter changed)
        this.disposePipeline();
        this.gaplessTimings = null;
        this.gaplessLastAyah = -1;
    }

    // ── URI resolution (ayah-by-ayah mode) ────────────────────────────────────

    private async resolveUri(index: number): Promise<string | null> {
        const verse = this.verses[index];
        if (!verse || !this.reciter) {
            console.warn(`[AudioEngine] resolveUri: no verse at index=${index} or no reciter`);
            return null;
        }
        console.log(`[AudioEngine] resolveUri: surah=${this.surahNumber}, ayah=${verse.numberInSurah}, reciter=${this.reciter.id}`);
        const remoteUrl = await getAyahAudioUrl(
            this.surahNumber, verse.numberInSurah, this.reciter
        );
        if (!remoteUrl) {
            console.warn(`[AudioEngine] resolveUri: getAyahAudioUrl returned null`);
            return null;
        }
        console.log(`[AudioEngine] resolveUri: remoteUrl=${remoteUrl.substring(0, 80)}...`);
        // Priority: local file:// (offline) → remote URL (with background download)
        const localUri = await ensureAudioLocal(
            this.reciter.id, this.surahNumber, verse.numberInSurah, remoteUrl
        );
        console.log(`[AudioEngine] resolveUri: finalUri=${localUri?.substring(0, 80)}...`);
        return localUri;
    }

    // ── Deep pipeline pre-loading (ayah-by-ayah mode only) ────────────────────

    private fillPipeline(fromIndex: number) {
        // Skip pipeline in gapless mode — single file handles everything
        if (this._isGaplessMode) return;

        const n1 = fromIndex;      // Level 1
        const n2 = fromIndex + 1;  // Level 2
        const n3 = fromIndex + 2;  // Level 3 — disk cache
        const n4 = fromIndex + 3;  // Level 4 — API prefetch

        // Level 1: pre-create AudioPlayer for the next verse
        if (n1 < this.verses.length && this.nextPlayerIndex !== n1 && !this.preloadInFlight.has(n1)) {
            this.preloadPlayer(n1, 'next');
        }

        // Level 2: pre-create AudioPlayer for verse after that
        if (n2 < this.verses.length && this.warmPlayerIndex !== n2 && !this.preloadInFlight.has(n2)) {
            this.preloadPlayer(n2, 'warm');
        }

        // Level 3: download MP3 to disk
        if (n3 < this.verses.length && this.reciter) {
            const verse = this.verses[n3];
            if (verse) {
                const reciter = this.reciter;
                getAyahAudioUrl(this.surahNumber, verse.numberInSurah, reciter)
                    .then(url => {
                        if (url) warmCacheAsync(reciter.id, this.surahNumber, verse.numberInSurah, url);
                    })
                    .catch(() => {});
            }
        }

        // Level 4: prefetch API JSON
        if (n4 < this.verses.length) {
            const verse = this.verses[n4];
            if (verse) {
                prefetchAyahAudio(this.surahNumber, verse.numberInSurah).catch(() => {});
            }
        }
    }

    /** Pre-resolve URI + create a native AudioPlayer for the given index */
    private async preloadPlayer(index: number, slot: 'next' | 'warm') {
        if (index >= this.verses.length) return;
        this.preloadInFlight.add(index);

        try {
            const uri = await this.resolveUri(index);
            // Guard: if context changed while resolving, abort
            if (!this.preloadInFlight.has(index)) return;
            this.preloadInFlight.delete(index);

            if (!uri) return;

            // Create a native player with the pre-resolved URI
            const player = createAudioPlayer({ uri }, { updateInterval: 1000 });
            player.setPlaybackRate(this._playbackSpeed);

            if (slot === 'next') {
                // Don't overwrite if another preload already filled this slot
                if (this.nextPlayer && this.nextPlayerIndex === index) {
                    try { player.remove(); } catch {}
                    return;
                }
                this.disposeNextPlayer();
                this.nextPlayer = player;
                this.nextPlayerIndex = index;
            } else {
                if (this.warmPlayer && this.warmPlayerIndex === index) {
                    try { player.remove(); } catch {}
                    return;
                }
                this.disposeWarmPlayer();
                this.warmPlayer = player;
                this.warmPlayerIndex = index;
            }
        } catch (err) {
            this.preloadInFlight.delete(index);
            console.warn('[AudioEngine] preloadPlayer failed for index', index, err);
        }
    }

    /** Promote pipeline: warmPlayer → nextPlayer, then refill */
    private promotePipeline(currentIndex: number) {
        // warmPlayer becomes the new nextPlayer
        if (this.warmPlayer && this.warmPlayerIndex === currentIndex + 1) {
            this.disposeNextPlayer();
            this.nextPlayer = this.warmPlayer;
            this.nextPlayerIndex = this.warmPlayerIndex;
            this.warmPlayer = null;
            this.warmPlayerIndex = -1;
        }

        // Refill the pipeline from current+1 (Level 1) and current+2 (Level 2)
        this.fillPipeline(currentIndex + 1);
    }

    // ── Safe disposal helpers ─────────────────────────────────────────────────

    private disposeNextPlayer() {
        if (this.nextPlayer) {
            try { this.nextPlayer.remove(); } catch {}
            this.nextPlayer = null;
        }
        this.nextPlayerIndex = -1;
    }

    private disposeWarmPlayer() {
        if (this.warmPlayer) {
            try { this.warmPlayer.remove(); } catch {}
            this.warmPlayer = null;
        }
        this.warmPlayerIndex = -1;
    }

    private disposePipeline() {
        this.disposeNextPlayer();
        this.disposeWarmPlayer();
        this.preloadInFlight.clear();
        this.stopGaplessPolling();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  GAPLESS MODE — Single surah MP3 + timing DB seek                  ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Start gapless playback of a full surah.
     * Downloads timing DB + surah MP3, then plays with position tracking.
     */
    private async playGapless(index: number) {
        if (!this.reciter) return;

        this._isLoading = true;
        this._currentIndex = index;
        this.emit();

        try {
            // Step 1: Load timing data in parallel with surah audio
            const reciterId = this.reciter.id;
            const surahNo = this.surahNumber;

            const [timings, surahUri] = await Promise.all([
                getVerseTimings(reciterId, surahNo),
                this.resolveGaplessSurahUri(),
            ]);

            this.gaplessTimings = timings;

            if (!surahUri) {
                throw new Error(`No surah URI resolved for ${reciterId}:${surahNo}`);
            }

            console.log(
                `[AudioEngine] Gapless: surahUri=${surahUri.substring(0, 80)}, ` +
                `timings=${timings ? timings.verses.length + ' verses' : 'NONE'}`
            );

            // Step 2: Create or replace the player with the full surah MP3
            if (!this.player) {
                this.player = createAudioPlayer({ uri: surahUri }, { updateInterval: 250 });
                console.log(`[AudioEngine] Gapless: created NEW player`);
            } else {
                this.player.pause();
                this.player.replace({ uri: surahUri });
                console.log(`[AudioEngine] Gapless: replaced source on EXISTING player`);
            }

            this.completionSub?.remove();
            this.completionSub = null;

            this.player.setPlaybackRate(this._playbackSpeed);
            this.player.loop = false;

            // Step 3: If a specific verse was requested, seek to its offset
            if (timings && index > 0) {
                const verse = this.verses[index];
                if (verse) {
                    const offsetMs = getVerseOffset(timings, verse.numberInSurah);
                    if (offsetMs > 0) {
                        this.player.seekTo(offsetMs / 1000); // expo-audio uses seconds
                        console.log(`[AudioEngine] Gapless: seekTo(${offsetMs}ms) for ayah ${verse.numberInSurah}`);
                    }
                }
            }

            this._isLoading = false;
            this._isPlaying = true;
            this.emit();

            this.player.play();

            // Step 4: Attach completion listener (end of surah)
            this.attachGaplessCompletionListener();

            // Step 5: Start position polling for live verse tracking
            this.startGaplessPolling();

        } catch (err) {
            console.error('[AudioEngine] Gapless play error:', err);
            this._isLoading = false;
            this._isPlaying = false;
            this.emit();
        }
    }

    /** Resolve the full surah MP3 URI (download or stream) */
    private async resolveGaplessSurahUri(): Promise<string | null> {
        if (!this.reciter) return null;
        const remoteUrl = getGaplessSurahUrl(this.reciter.id, this.surahNumber);
        if (!remoteUrl) return null;

        console.log(`[AudioEngine] Gapless: resolving surah URI: ${remoteUrl}`);
        const localUri = await ensureGaplessSurahLocal(
            this.reciter.id, this.surahNumber, remoteUrl
        );
        return localUri;
    }

    /** Gapless completion — end of surah file */
    private attachGaplessCompletionListener() {
        this.completionSub?.remove();
        this.completionSub = null;
        if (!this.player) return;

        this.completionSub = this.player.addListener(
            PLAYBACK_STATUS_UPDATE,
            (status: any) => {
                if (status.didJustFinish) {
                    this.completionSub?.remove();
                    this.completionSub = null;
                    this.stopGaplessPolling();
                    // Surah complete
                    this._didCompleteVerse = true;
                    this._isPlaying = false;
                    this.emit();
                }
            }
        );
    }

    /**
     * Position polling for gapless mode.
     * Every 200ms, checks the current playback position against the timing DB
     * and updates currentIndex if the verse has changed.
     *
     * Mirrors AudioService.java's `J.sendEmptyMessageDelayed(0, 150)` loop.
     */
    private startGaplessPolling() {
        this.stopGaplessPolling();
        if (!this.gaplessTimings) return;

        this.gaplessPositionInterval = setInterval(() => {
            if (!this.player || !this._isPlaying || !this.gaplessTimings) return;

            const positionSeconds = this.player.currentTime;   // expo-audio: seconds
            const positionMs = Math.round(positionSeconds * 1000);
            const currentAyah = getVerseAtPosition(this.gaplessTimings, positionMs);

            if (currentAyah !== this.gaplessLastAyah && currentAyah > 0) {
                this.gaplessLastAyah = currentAyah;
                // Find the verse index that matches this ayah number
                const newIndex = this.verses.findIndex(
                    (v: any) => v.numberInSurah === currentAyah
                );
                if (newIndex >= 0 && newIndex !== this._currentIndex) {
                    this._currentIndex = newIndex;
                    this.emit();
                }
            }
        }, 200); // 200ms polling — smooth enough for highlight sync
    }

    private stopGaplessPolling() {
        if (this.gaplessPositionInterval) {
            clearInterval(this.gaplessPositionInterval);
            this.gaplessPositionInterval = null;
        }
    }

    /**
     * Seek to a specific verse within the gapless surah file.
     * Called when user taps an ayah on the Mushaf during gapless playback.
     */
    seekToVerse(index: number) {
        if (!this._isGaplessMode || !this.player || !this.gaplessTimings) return;
        
        const verse = this.verses[index];
        if (!verse) return;

        const offsetMs = getVerseOffset(this.gaplessTimings, verse.numberInSurah);
        if (offsetMs >= 0) {
            this.player.seekTo(offsetMs / 1000); // expo-audio: seconds
            this._currentIndex = index;
            this.gaplessLastAyah = verse.numberInSurah;
            this.emit();
            console.log(`[AudioEngine] seekToVerse: ayah=${verse.numberInSurah}, offset=${offsetMs}ms`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  CORE PLAY — Routes to gapless or ayah-by-ayah mode               ██
    // ══════════════════════════════════════════════════════════════════════════

    async play(index: number, fromRepeat = false) {
        console.log(`[AudioEngine] play(${index}): verses=${this.verses.length}, reciter=${this.reciter?.id}, gapless=${this._isGaplessMode}, fromRepeat=${fromRepeat}`);

        if (index >= this.verses.length) {
            console.log(`[AudioEngine] play: index >= verses.length, stopping`);
            this._isPlaying = false;
            this.emit();
            return;
        }
        if (!fromRepeat) this._repeatCount = 0;
        this._didCompleteVerse = false;

        // Ensure audio session is configured before playing
        try {
            await configureAudioSession();
        } catch (e) {
            console.warn('[AudioEngine] configureAudioSession failed:', e);
        }

        // Cancel any pending delay timer
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }

        // ── Route to gapless mode if applicable ───────────────────────────
        if (this._isGaplessMode) {
            // In gapless mode: if player is already loaded with this surah,
            // just seek to the requested verse instead of reloading
            if (this.player && this._isPlaying && this.gaplessTimings) {
                this.seekToVerse(index);
                return;
            }
            await this.playGapless(index);
            return;
        }

        // ══════════════════════════════════════════════════════════════════
        // ██  AYAH-BY-AYAH MODE — Per-verse files with pipeline           ██
        // ══════════════════════════════════════════════════════════════════

        // ── Fast path: use pre-loaded nextPlayer ──────────────────────────
        if (this.nextPlayer && this.nextPlayerIndex === index) {
            console.log(`[AudioEngine] play: FAST PATH — using pre-loaded nextPlayer`);
            this.completionSub?.remove();
            this.completionSub = null;
            const oldPlayer = this.player;

            // Swap: nextPlayer becomes active
            this.player = this.nextPlayer;
            this.nextPlayer = null;
            this.nextPlayerIndex = -1;

            // Update state
            this._currentIndex = index;
            this._isLoading = false;
            this._isPlaying = true;
            this.emit();

            // Play immediately — native buffer already decoded!
            this.player.play();

            // Destroy old player
            if (oldPlayer) {
                try { oldPlayer.remove(); } catch {}
            }

            // Attach completion listener
            this.attachCompletionListener(index);

            // Promote pipeline + refill
            this.promotePipeline(index);
            return;
        }

        // ── Slow path: no pre-loaded player — resolve from scratch ────────
        console.log(`[AudioEngine] play: SLOW PATH — resolving URI from scratch`);
        this._isLoading   = true;
        this._currentIndex = index;
        this.emit();

        // Invalidate stale pipeline
        this.disposePipeline();

        try {
            const uri = await this.resolveUri(index);
            if (!uri) throw new Error('No URI resolved');

            console.log(`[AudioEngine] play: creating/replacing player with uri=${uri.substring(0, 80)}...`);

            if (!this.player) {
                this.player = createAudioPlayer({ uri }, { updateInterval: 1000 });
                console.log(`[AudioEngine] play: created NEW player`);
            } else {
                this.player.pause();
                this.player.replace({ uri });
                console.log(`[AudioEngine] play: replaced source on EXISTING player`);
            }

            this.completionSub?.remove();
            this.completionSub = null;

            this.player.setPlaybackRate(this._playbackSpeed);
            this.player.loop = false;

            this._isLoading  = false;
            this._isPlaying  = true;
            this.emit();

            console.log(`[AudioEngine] play: calling player.play()`);
            this.player.play();

            // Attach completion listener
            this.attachCompletionListener(index);

            // Fill the full pipeline: N+1, N+2 (AudioPlayers) + N+3 (disk) + N+4 (API)
            this.fillPipeline(index + 1);

        } catch (err) {
            console.error('[AudioEngine] play error:', err);
            this._isLoading = false;
            this._isPlaying = false;
            this.emit();
        }
    }

    /** Attach didJustFinish listener to the current player (ayah-by-ayah mode) */
    private attachCompletionListener(index: number) {
        this.completionSub?.remove();
        this.completionSub = null;

        if (!this.player) return;

        this.completionSub = this.player.addListener(
            PLAYBACK_STATUS_UPDATE,
            (status: any) => {
                if (status.didJustFinish) {
                    this.completionSub?.remove();
                    this.completionSub = null;
                    this.onComplete(index);
                }
            }
        );
    }

    private onComplete(index: number) {
        const newCount = this._repeatCount + 1;
        const limit    = this._repeatMode === 'inf' ? Infinity : this._repeatMode;

        if (newCount < limit) {
            // Repeat: seek back to start and play again
            this._repeatCount = newCount;
            if (this.player) {
                this.player.seekTo(0);
                this.player.play();
                this.attachCompletionListener(index);
            }
        } else {
            const next = index + 1;
            if (next < this.verses.length && !this._learningMode) {
                // ── Per-ayah delay (from reference: delayBetweenAyat) ────
                if (this._ayahDelay > 0) {
                    // Pause playback for the delay duration, then advance
                    this._isPlaying = false;
                    this.emit();
                    this.delayTimer = setTimeout(() => {
                        this.delayTimer = null;
                        this.play(next);
                    }, this._ayahDelay * 1000);
                } else {
                    // Normal: auto-advance immediately (uses fast path if pipeline ready)
                    this.play(next);
                }
            } else {
                // Learning mode OR last verse: stop and signal completion
                this._didCompleteVerse = true;
                this._isPlaying = false;
                this.emit();
            }
        }
    }

    // ── Controls ──────────────────────────────────────────────────────────────

    togglePlayback() {
        if (!this.player) { this.play(this._currentIndex); return; }
        if (this._isPlaying) {
            this.player.pause();
            this._isPlaying = false;
            this.stopGaplessPolling();
        } else {
            this.player.play();
            this._isPlaying = true;
            if (this._isGaplessMode) this.startGaplessPolling();
        }
        this.emit();
    }

    skipNext() {
        if (this._isGaplessMode && this.player && this.gaplessTimings) {
            // In gapless mode: seek to next verse
            const nextIndex = this._currentIndex + 1;
            if (nextIndex < this.verses.length) {
                this.seekToVerse(nextIndex);
            }
        } else if (this._currentIndex < this.verses.length - 1) {
            this.play(this._currentIndex + 1);
        }
    }

    skipPrev() {
        if (this._isGaplessMode && this.player && this.gaplessTimings) {
            // In gapless mode: seek to previous verse
            const prevIndex = this._currentIndex - 1;
            if (prevIndex >= 0) {
                this.seekToVerse(prevIndex);
            }
        } else if (this._currentIndex > 0) {
            this.disposePipeline();
            this.play(this._currentIndex - 1);
        }
    }

    cycleRepeat() {
        const idx = REPEAT_CYCLE.indexOf(this._repeatMode);
        this._repeatMode  = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
        this._repeatCount = 0;
        this.emit();
    }

    setSpeed(speed: number) {
        this._playbackSpeed = speed;
        this.player?.setPlaybackRate(speed);
        this.nextPlayer?.setPlaybackRate(speed);
        this.warmPlayer?.setPlaybackRate(speed);
        this.emit();
    }

    setVerses(surahNumber: number, verses: any[], reciter: Reciter) {
        this.configure(surahNumber, verses, reciter);
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    /**
     * stop() — Releases all native audio players and resets playback state,
     * but PRESERVES listeners so React useSyncExternalStore subscriptions
     * survive component unmount/remount cycles.
     *
     * Use this in component/screen cleanup effects.
     */
    stop() {
        console.log(`[AudioEngine] stop() called — player=${!!this.player}, isPlaying=${this._isPlaying}`);
        this.completionSub?.remove();
        this.completionSub = null;
        if (this.player) {
            try { this.player.remove(); } catch {}
            this.player = null;
        }
        this.disposePipeline();
        this._isPlaying = false;
        this._isLoading = false;
        this._didCompleteVerse = false;
        this.gaplessTimings = null;
        this.gaplessLastAyah = -1;
        this.emit(); // Notify React that playback stopped
    }

    /**
     * destroy() — Full teardown including listeners.
     * Only call this on app-level shutdown, NEVER from component cleanup.
     */
    destroy() {
        this.stop();
        this.listeners.clear();
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const audioEngine = new AudioEngineCore();

// ── React hook ────────────────────────────────────────────────────────────────

export function useAudioEngine(): AudioEngineState {
    return React.useSyncExternalStore(
        React.useCallback((cb) => audioEngine.subscribe(cb), []),
        () => audioEngine.getSnapshot(),
        () => audioEngine.getSnapshot(),
    );
}
