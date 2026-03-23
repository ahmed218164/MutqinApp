/**
 * lib/audio-engine.ts
 *
 * Phase D — Reference-Grade Gapless Audio Engine (expo-audio)
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  REFERENCE APP ANALYSIS (to_take_in_review/AudioService.java)         │
 * │                                                                       │
 * │  The reference uses SURAH-LEVEL MP3 files + a timing DB:              │
 * │    - Single file per surah (001.mp3 = all of Al-Fatiha)               │
 * │    - SQLite DB maps (surah, ayah) → ms offset within the file         │
 * │    - Verse navigation = seekTo(offset), NO file switching             │
 * │    - Result: TRUE zero-gap (same audio stream, just seeking)           │
 * │                                                                       │
 * │  Our audio sources (cdn.islamic.network) serve PER-VERSE files.       │
 * │  We CAN'T use surah-level files. Instead, we replicate the result:    │
 * │                                                                       │
 * │  DEEP PIPELINE — 3-level pre-loading:                                 │
 * │                                                                       │
 * │  Level 1: nextPlayer (AudioPlayer for N+1 — decoded, ready to play)   │
 * │  Level 2: warmPlayer (AudioPlayer for N+2 — decoded, ready to queue)  │
 * │  Level 3: disk cache  (MP3 for N+3 downloaded to filesystem)          │
 * │  Level 4: API prefetch (JSON metadata for N+4 cached in memory)       │
 * │                                                                       │
 * │  When verse N finishes:                                               │
 * │    → nextPlayer.play()     [0ms — native buffer already decoded]      │
 * │    → warmPlayer → next     [promote pipeline]                         │
 * │    → Start pre-loading N+3 [refill pipeline]                          │
 * │                                                                       │
 * │  EXTRA: per-ayah delay (from reference `delayBetweenAyatButton`)      │
 * │    audioEngine.setAyahDelay(seconds)                                  │
 * │    Pauses between verses for the configured duration.                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import {
    createAudioPlayer,
    setAudioModeAsync,
    AudioPlayer,
} from 'expo-audio';
import { PLAYBACK_STATUS_UPDATE } from 'expo-audio/build/AudioEventKeys';
import * as React from 'react';
import { getAyahAudioUrl, prefetchAyahAudio } from './quran-audio-api';
import { ensureAudioLocal, warmCacheAsync } from './audio-cache';
import type { Reciter } from './audio-reciters';

// ── Audio session setup ───────────────────────────────────────────────────────

let audioModeConfigured = false;

export async function configureAudioSession() {
    if (audioModeConfigured) return;
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
}

export type RepeatMode = 1 | 2 | 3 | 'inf';
export const REPEAT_CYCLE: RepeatMode[] = [1, 2, 3, 'inf'];
export function repeatLabel(m: RepeatMode): string {
    return m === 'inf' ? '∞' : `${m}×`;
}

// ── Singleton engine class ────────────────────────────────────────────────────

class AudioEngineCore {
    // ── Deep pipeline architecture ────────────────────────────────────────────
    // player     = currently playing verse (Level 0 — active)
    // nextPlayer = pre-loaded verse N+1    (Level 1 — decoded, ready)
    // warmPlayer = pre-loaded verse N+2    (Level 2 — decoded, queued)
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
            s.didCompleteVerse === this._didCompleteVerse
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
        this.surahNumber  = surahNumber;
        this.verses       = verses;
        this.reciter      = reciter;
        // Invalidate entire pipeline (verses/reciter changed)
        this.disposePipeline();
    }

    // ── URI resolution ────────────────────────────────────────────────────────

    private async resolveUri(index: number): Promise<string | null> {
        const verse = this.verses[index];
        if (!verse || !this.reciter) return null;
        const remoteUrl = await getAyahAudioUrl(
            this.surahNumber, verse.numberInSurah, this.reciter
        );
        if (!remoteUrl) return null;
        // Priority: local file:// (offline) → remote URL (with background download)
        // Mirrors y3.n: check file exists → return local path OR trigger download
        return ensureAudioLocal(
            this.reciter.id, this.surahNumber, verse.numberInSurah, remoteUrl
        );
    }

    // ── Deep pipeline pre-loading ─────────────────────────────────────────────
    //
    // Fills the pipeline up to 3 levels deep:
    //   Level 1 (nextPlayer):  Resolve URI + create native AudioPlayer
    //   Level 2 (warmPlayer):  Resolve URI + create native AudioPlayer
    //   Level 3 (disk cache):  Download MP3 to filesystem
    //   Level 4 (API cache):   Prefetch API JSON response

    private fillPipeline(fromIndex: number) {
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
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
    }

    // ── Core play ─────────────────────────────────────────────────────────────

    async play(index: number, fromRepeat = false) {
        if (index >= this.verses.length) {
            this._isPlaying = false;
            this.emit();
            return;
        }
        if (!fromRepeat) this._repeatCount = 0;
        this._didCompleteVerse = false;

        // Cancel any pending delay timer
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }

        // ── Fast path: use pre-loaded nextPlayer ──────────────────────────
        if (this.nextPlayer && this.nextPlayerIndex === index) {
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
        this._isLoading   = true;
        this._currentIndex = index;
        this.emit();

        // Invalidate stale pipeline
        this.disposePipeline();

        try {
            const uri = await this.resolveUri(index);
            if (!uri) throw new Error('No URI resolved');

            if (!this.player) {
                this.player = createAudioPlayer({ uri }, { updateInterval: 1000 });
            } else {
                this.player.pause();
                this.player.replace({ uri });
            }

            this.completionSub?.remove();
            this.completionSub = null;

            this.player.setPlaybackRate(this._playbackSpeed);
            this.player.loop = false;

            this._isLoading  = false;
            this._isPlaying  = true;
            this.emit();

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

    /** Attach didJustFinish listener to the current player */
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
        } else {
            this.player.play();
            this._isPlaying = true;
        }
        this.emit();
    }

    skipNext() {
        if (this._currentIndex < this.verses.length - 1) {
            this.play(this._currentIndex + 1);
        }
    }

    skipPrev() {
        if (this._currentIndex > 0) {
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

    destroy() {
        this.completionSub?.remove();
        this.player?.remove();
        this.disposePipeline();
        this.completionSub = null;
        this.player        = null;
        this._isPlaying    = false;
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
