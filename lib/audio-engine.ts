/**
 * lib/audio-engine.ts
 *
 * RNTP-Powered Dual-Mode Audio Engine
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Architecture: react-native-track-player (RNTP v4)                     │
 * │  Uses ExoPlayer (Android) + AVQueuePlayer (iOS) natively.              │
 * │  All track transitions happen on the native thread — zero JS-bridge    │
 * │  gaps between verses.                                                  │
 * │                                                                        │
 * │  MODE 1: AYAH-BY-AYAH (audioType='ayah')                              │
 * │    - Maps all verses → Track[] queue loaded into RNTP at once          │
 * │    - Native queue handles zero-gap transitions automatically           │
 * │    - Event.PlaybackActiveTrackChanged updates UI verse index           │
 * │                                                                        │
 * │  MODE 2: GAPLESS (audioType='gapless')                                │
 * │    - Single surah MP3 loaded as one Track                              │
 * │    - Timing DB provides per-verse ms offsets                           │
 * │    - TrackPlayer.getProgress() polled at 200ms for verse sync          │
 * │    - TrackPlayer.seekTo() for verse navigation                         │
 * │                                                                        │
 * │  Both modes emit the same AudioEngineState shape to consumers,         │
 * │  so MushafHighlights and UnifiedAudioControl work identically.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import TrackPlayer, {
    Event,
    State,
    Capability,
    AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import type { Track } from 'react-native-track-player';
import * as React from 'react';
import { getGaplessSurahUrl, getStorageCdnUrl } from './quran-audio-api';
import { ensureGaplessSurahLocal } from './audio-cache';
import { getVerseTimings, getVerseAtPosition, getVerseOffset, SurahTimings } from './gapless-timing';
import type { Reciter } from './audio-reciters';

// ── TrackPlayer Setup (idempotent) ────────────────────────────────────────────

let playerReady = false;

async function setupPlayer(): Promise<void> {
    if (playerReady) return;
    try {
        await TrackPlayer.setupPlayer({
            autoHandleInterruptions: true,
        });
        await TrackPlayer.updateOptions({
            capabilities: [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
                Capability.SeekTo,
                Capability.Stop,
            ],
            compactCapabilities: [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
            ],
            android: {
                appKilledPlaybackBehavior:
                    AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
            },
        });
        playerReady = true;
        console.log('[AudioEngine] TrackPlayer setup complete ✅');
    } catch (e: any) {
        // RNTP throws if already initialized — that's fine
        if (e?.message?.includes('already been initialized')) {
            playerReady = true;
        } else {
            console.warn('[AudioEngine] TrackPlayer setup warning:', e);
            playerReady = true; // Assume ready to avoid blocking forever
        }
    }
}

/**
 * Backward-compatible audio session configurator.
 * In the RNTP architecture, this just ensures TrackPlayer is set up.
 * Called from UnifiedAudioControl after recording → listen transition.
 */
export async function configureAudioSession(force = false): Promise<void> {
    await setupPlayer();
}

// ── State shape exposed to consumers ──────────────────────────────────────────

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

// ── SkipReason — disambiguates user-initiated vs natural track changes ────────

type SkipReason = 'user' | 'repeat' | 'natural';

// ══════════════════════════════════════════════════════════════════════════════
// ██  AudioEngineCore — Singleton                                           ██
// ══════════════════════════════════════════════════════════════════════════════

class AudioEngineCore {
    // ── Configuration ─────────────────────────────────────────────────────────
    private verses: any[] = [];
    private surahNumber = 0;
    private reciter: Reciter | null = null;

    // ── Playback state ────────────────────────────────────────────────────────
    private _currentIndex = 0;
    private _isPlaying    = false;
    private _isLoading    = false;
    private _repeatMode: RepeatMode = 1;
    private _repeatCount  = 0;
    private _playbackSpeed = 1.0;
    private _ayahDelay    = 0;
    private _learningMode = false;
    private _didCompleteVerse = false;

    // ── Queue state ───────────────────────────────────────────────────────────
    private _isGaplessMode = false;
    private queueLoaded    = false;
    private lastSkipReason: SkipReason = 'natural';

    // ── Gapless state ─────────────────────────────────────────────────────────
    private gaplessTimings: SurahTimings | null = null;
    private gaplessPositionInterval: ReturnType<typeof setInterval> | null = null;
    private gaplessLastAyah = -1;

    // ── Timers ────────────────────────────────────────────────────────────────
    private delayTimer: ReturnType<typeof setTimeout> | null = null;

    // ── RNTP event subscriptions ──────────────────────────────────────────────
    private eventsRegistered = false;
    private eventSubs: { remove: () => void }[] = [];

    // ── React external-store listeners ────────────────────────────────────────
    private listeners = new Set<() => void>();

    private emit() { this.listeners.forEach(fn => fn()); }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    // ── Snapshot (memoized for useSyncExternalStore) ──────────────────────────

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

    // ══════════════════════════════════════════════════════════════════════════
    // ██  CONFIGURATION                                                     ██
    // ══════════════════════════════════════════════════════════════════════════

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

    configure(surahNumber: number, verses: any[], reciter: Reciter) {
        console.log(
            `[AudioEngine] configure: surah=${surahNumber}, ` +
            `verses=${verses.length}, reciter=${reciter.id}, type=${reciter.audioType}`
        );
        this.surahNumber    = surahNumber;
        this.verses         = verses;
        this.reciter        = reciter;
        this._isGaplessMode = reciter.audioType === 'gapless';

        // Invalidate loaded queue (new surah/reciter/range)
        this.queueLoaded   = false;
        this.gaplessTimings = null;
        this.gaplessLastAyah = -1;
        this.stopGaplessPolling();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
    }

    setVerses(surahNumber: number, verses: any[], reciter: Reciter) {
        this.configure(surahNumber, verses, reciter);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  RNTP EVENT REGISTRATION                                           ██
    // ══════════════════════════════════════════════════════════════════════════

    private ensureEventsRegistered() {
        if (this.eventsRegistered) return;
        this.eventsRegistered = true;

        this.eventSubs.push(
            TrackPlayer.addEventListener(
                Event.PlaybackActiveTrackChanged,
                (data) => this.onTrackChanged(data),
            ),
        );

        this.eventSubs.push(
            TrackPlayer.addEventListener(
                Event.PlaybackState,
                (data) => this.onPlaybackStateChanged(data),
            ),
        );

        this.eventSubs.push(
            TrackPlayer.addEventListener(
                Event.PlaybackQueueEnded,
                () => this.onQueueEnded(),
            ),
        );

        console.log('[AudioEngine] RNTP events registered ✅');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  EVENT HANDLERS                                                    ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Fired when RNTP transitions from one track to another.
     *
     * Three scenarios:
     *   1. reason='user'   → user tapped a verse / called play(i) / skipNext/Prev
     *   2. reason='repeat' → engine skipped back for verse repeat
     *   3. reason='natural'→ RNTP auto-advanced (native zero-gap transition)
     *
     * For (1) and (2) we just update the index.
     * For (3) we also handle repeat, delay, and learning-mode logic.
     */
    private onTrackChanged(data: any) {
        // Gapless mode uses position polling, not track changes
        if (this._isGaplessMode) return;

        const newIndex: number | undefined = data.index;
        if (newIndex === undefined || newIndex === null) return;

        const reason = this.lastSkipReason;
        this.lastSkipReason = 'natural'; // Reset for next event

        // ── Repeat-initiated skip: just ignore it ─────────────────────────
        if (reason === 'repeat') return;

        // ── User-initiated skip: update index, no repeat/delay ────────────
        if (reason === 'user') {
            this._currentIndex = newIndex;
            this.emit();
            return;
        }

        // ═══════════════════════════════════════════════════════════════════
        // ██  NATURAL AUTO-ADVANCE — check repeat / delay / learning mode  ██
        // ═══════════════════════════════════════════════════════════════════

        // 1. Check repeat mode
        if (this._repeatMode !== 1 && data.lastIndex !== undefined) {
            const limit = this._repeatMode === 'inf' ? Infinity : this._repeatMode;
            const newCount = this._repeatCount + 1;

            if (newCount < limit) {
                // Need more repeats of the previous track
                this._repeatCount = newCount;
                this.lastSkipReason = 'repeat';
                TrackPlayer.skip(data.lastIndex).catch(() => {});
                return;
            }
            // All repeats done → reset counter, allow advance
            this._repeatCount = 0;
        }

        // 2. Handle learning mode (stop after each verse)
        if (this._learningMode) {
            TrackPlayer.pause().catch(() => {});
            this._didCompleteVerse = true;
            this._isPlaying = false;
            this._currentIndex = newIndex;
            this.emit();
            return;
        }

        // 3. Handle ayah delay
        if (this._ayahDelay > 0 && data.lastIndex !== undefined) {
            TrackPlayer.pause().catch(() => {});
            this._isPlaying = false;
            this._currentIndex = newIndex;
            this.emit();

            this.delayTimer = setTimeout(() => {
                this.delayTimer = null;
                TrackPlayer.play().catch(() => {});
                this._isPlaying = true;
                this.emit();
            }, this._ayahDelay * 1000);
            return;
        }

        // 4. Normal advance — update UI
        this._currentIndex = newIndex;
        this.emit();
    }

    /**
     * Handles RNTP playback state changes (buffering, playing, error).
     * We use this for loading-indicator management and error recovery.
     * Deliberate play/pause state is managed optimistically by our methods.
     */
    private onPlaybackStateChanged(data: any) {
        const state: State = data.state;
        let changed = false;

        // Manage loading indicator from buffering events
        if (state === State.Buffering) {
            if (!this._isLoading) { this._isLoading = true; changed = true; }
        } else if (
            this._isLoading &&
            (state === State.Ready || state === State.Playing)
        ) {
            this._isLoading = false;
            changed = true;
        }

        // Handle errors
        if (state === State.Error) {
            console.error('[AudioEngine] RNTP playback error (State.Error)');
            this._isPlaying = false;
            this._isLoading = false;
            changed = true;
        }

        if (changed) this.emit();
    }

    /**
     * Fired when the last track in the queue finishes playing.
     * This is our signal that the surah/range is complete.
     */
    private onQueueEnded() {
        console.log('[AudioEngine] Queue ended — surah/range complete');
        this.stopGaplessPolling();
        this._didCompleteVerse = true;
        this._isPlaying = false;
        this.emit();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  TRACK QUEUE BUILDING                                              ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Build an RNTP Track[] from the configured verses.
     * Uses synchronous CDN URL construction (no async fetch needed).
     * RNTP streams directly from the CDN — no local download required.
     */
    private buildTrackQueue(): Track[] {
        if (!this.reciter) return [];

        return this.verses.map((verse: any) => ({
            url:    this.getDirectUrl(verse.numberInSurah),
            title:  `آية ${verse.numberInSurah}`,
            artist: this.reciter!.nameArabic || this.reciter!.name,
            album:  `سورة ${this.surahNumber}`,
        }));
    }

    /**
     * Construct a direct CDN URL for an ayah.
     * Priority: elmushafPath → baseUrl → quranapi (rare).
     */
    private getDirectUrl(ayahNo: number): string {
        const reciter = this.reciter!;

        // Priority 1: storage.elmushaf.com CDN (covers 80+ reciters)
        if (reciter.elmushafPath) {
            return getStorageCdnUrl(reciter.id, reciter.audioType, this.surahNumber, ayahNo);
        }

        // Priority 2: legacy baseUrl pattern (everyayah.com / cdn.islamic.network)
        if (reciter.baseUrl) {
            const s = this.surahNumber.toString().padStart(3, '0');
            const a = ayahNo.toString().padStart(3, '0');
            return `${reciter.baseUrl}/${s}${a}.mp3`;
        }

        // Priority 3: quranapi (very rare — most reciters have elmushafPath)
        console.warn(`[AudioEngine] No direct URL source for reciter ${reciter.id}`);
        return '';
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  CORE PLAY — Routes to gapless or ayah-by-ayah mode               ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Main entry point for playback. Routes to the correct mode.
     *
     * For ayah-by-ayah: loads full Track[] queue on first call, then uses
     * TrackPlayer.skip() for subsequent calls (instant, no re-loading).
     *
     * For gapless: loads single surah Track + timing DB on first call, then
     * uses seekTo() for subsequent calls.
     */
    async play(index: number) {
        console.log(
            `[AudioEngine] play(${index}): verses=${this.verses.length}, ` +
            `reciter=${this.reciter?.id}, gapless=${this._isGaplessMode}`
        );

        if (index >= this.verses.length) {
            console.log('[AudioEngine] play: index >= verses.length, stopping');
            this._isPlaying = false;
            this.emit();
            return;
        }

        // Reset state for a new user-initiated play
        this._repeatCount = 0;
        this._didCompleteVerse = false;

        // Ensure TrackPlayer is initialized
        await setupPlayer();
        this.ensureEventsRegistered();

        // Cancel any pending delay timer
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }

        // ── Route to gapless mode ─────────────────────────────────────────
        if (this._isGaplessMode) {
            if (this.queueLoaded && this.gaplessTimings) {
                // Queue already loaded — just seek to the verse
                this.seekToVerse(index);
                if (!this._isPlaying) {
                    await TrackPlayer.play();
                    this._isPlaying = true;
                    this.startGaplessPolling();
                    this.emit();
                }
                return;
            }
            await this.playGapless(index);
            return;
        }

        // ══════════════════════════════════════════════════════════════════
        // ██  AYAH-BY-AYAH MODE — Native queue with zero-gap transitions  ██
        // ══════════════════════════════════════════════════════════════════

        this._isLoading    = true;
        this._currentIndex = index;
        this.emit();

        try {
            // Build and load queue on first play (or after reconfigure)
            if (!this.queueLoaded) {
                const tracks = this.buildTrackQueue();
                if (tracks.length === 0) throw new Error('Empty track queue');

                console.log(`[AudioEngine] Loading ${tracks.length} tracks into RNTP queue`);
                await TrackPlayer.reset();
                await TrackPlayer.add(tracks);
                this.queueLoaded = true;
            }

            // Set playback speed
            await TrackPlayer.setRate(this._playbackSpeed);

            // Skip to the requested track (marks as user-initiated)
            this.lastSkipReason = 'user';
            await TrackPlayer.skip(index);

            // Update state optimistically (event handler will confirm)
            this._currentIndex = index;
            this._isLoading    = false;
            this._isPlaying    = true;
            this.emit();

            // Start native playback
            await TrackPlayer.play();

        } catch (err) {
            console.error('[AudioEngine] play error:', err);
            this._isLoading = false;
            this._isPlaying = false;
            this.emit();
        }
    }

    /** Advance to the next verse (used by learning mode after user records). */
    playNext() {
        const next = this._currentIndex + 1;
        if (next < this.verses.length) {
            this.play(next);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  GAPLESS MODE — Single surah MP3 + timing DB seek                 ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Start gapless playback of a full surah.
     * Downloads timing DB + surah MP3, then plays with position tracking.
     */
    private async playGapless(index: number) {
        if (!this.reciter) return;

        this._isLoading    = true;
        this._currentIndex = index;
        this.emit();

        try {
            const reciterId = this.reciter.id;
            const surahNo   = this.surahNumber;

            // Load timing data and surah audio in parallel
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

            // Load single track for the entire surah
            await TrackPlayer.reset();
            await TrackPlayer.add({
                url:    surahUri,
                title:  `سورة ${surahNo}`,
                artist: this.reciter.nameArabic || this.reciter.name,
            });

            // Seek to the requested verse offset
            if (timings && index > 0) {
                const verse = this.verses[index];
                if (verse) {
                    const offsetMs = getVerseOffset(timings, verse.numberInSurah);
                    if (offsetMs > 0) {
                        await TrackPlayer.seekTo(offsetMs / 1000);
                        console.log(
                            `[AudioEngine] Gapless: seekTo(${offsetMs}ms) ` +
                            `for ayah ${verse.numberInSurah}`
                        );
                    }
                }
            }

            await TrackPlayer.setRate(this._playbackSpeed);
            await TrackPlayer.play();

            this.queueLoaded = true;
            this._isLoading  = false;
            this._isPlaying  = true;
            this.emit();

            // Start position polling for live verse highlight tracking
            this.startGaplessPolling();

        } catch (err) {
            console.error('[AudioEngine] Gapless play error:', err);
            this._isLoading = false;
            this._isPlaying = false;
            this.emit();
        }
    }

    /** Resolve the full surah MP3 URI (local cache → remote stream) */
    private async resolveGaplessSurahUri(): Promise<string | null> {
        if (!this.reciter) return null;
        const remoteUrl = getGaplessSurahUrl(this.reciter.id, this.surahNumber);
        if (!remoteUrl) return null;

        console.log(`[AudioEngine] Gapless: resolving surah URI: ${remoteUrl}`);
        return await ensureGaplessSurahLocal(
            this.reciter.id, this.surahNumber, remoteUrl,
        );
    }

    /**
     * Seek to a specific verse within the gapless surah file.
     * Called when user taps an ayah on the Mushaf during gapless playback.
     */
    seekToVerse(index: number) {
        if (!this._isGaplessMode || !this.gaplessTimings) return;

        const verse = this.verses[index];
        if (!verse) return;

        const offsetMs = getVerseOffset(this.gaplessTimings, verse.numberInSurah);
        if (offsetMs >= 0) {
            TrackPlayer.seekTo(offsetMs / 1000).catch(() => {});
            this._currentIndex = index;
            this.gaplessLastAyah = verse.numberInSurah;
            this.emit();
            console.log(
                `[AudioEngine] seekToVerse: ayah=${verse.numberInSurah}, offset=${offsetMs}ms`
            );
        }
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

        this.gaplessPositionInterval = setInterval(async () => {
            if (!this._isPlaying || !this.gaplessTimings) return;

            try {
                const { position } = await TrackPlayer.getProgress();
                const positionMs = Math.round(position * 1000);
                const currentAyah = getVerseAtPosition(this.gaplessTimings, positionMs);

                if (currentAyah !== this.gaplessLastAyah && currentAyah > 0) {
                    this.gaplessLastAyah = currentAyah;
                    const newIndex = this.verses.findIndex(
                        (v: any) => v.numberInSurah === currentAyah,
                    );
                    if (newIndex >= 0 && newIndex !== this._currentIndex) {
                        this._currentIndex = newIndex;
                        this.emit();
                    }
                }
            } catch {
                // TrackPlayer.getProgress() can fail if player is being reset
            }
        }, 200); // 200ms — smooth enough for highlight sync
    }

    private stopGaplessPolling() {
        if (this.gaplessPositionInterval) {
            clearInterval(this.gaplessPositionInterval);
            this.gaplessPositionInterval = null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  CONTROLS                                                          ██
    // ══════════════════════════════════════════════════════════════════════════

    togglePlayback() {
        // If queue was never loaded, kick off a full play
        if (!this.queueLoaded) {
            this.play(this._currentIndex);
            return;
        }

        if (this._isPlaying) {
            TrackPlayer.pause().catch(() => {});
            this._isPlaying = false;
            this.stopGaplessPolling();
        } else {
            TrackPlayer.play().catch(() => {});
            this._isPlaying = true;
            if (this._isGaplessMode) this.startGaplessPolling();
        }
        this.emit();
    }

    skipNext() {
        this._repeatCount = 0;

        if (this._isGaplessMode && this.gaplessTimings) {
            const nextIndex = this._currentIndex + 1;
            if (nextIndex < this.verses.length) {
                this.seekToVerse(nextIndex);
            }
        } else if (this._currentIndex < this.verses.length - 1) {
            this.lastSkipReason = 'user';
            TrackPlayer.skip(this._currentIndex + 1).catch(() => {});
        }
    }

    skipPrev() {
        this._repeatCount = 0;

        if (this._isGaplessMode && this.gaplessTimings) {
            const prevIndex = this._currentIndex - 1;
            if (prevIndex >= 0) {
                this.seekToVerse(prevIndex);
            }
        } else if (this._currentIndex > 0) {
            this.lastSkipReason = 'user';
            TrackPlayer.skip(this._currentIndex - 1).catch(() => {});
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
        TrackPlayer.setRate(speed).catch(() => {});
        this.emit();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ██  CLEANUP                                                           ██
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * stop() — Resets the RNTP queue and all playback state,
     * but PRESERVES React useSyncExternalStore listeners so
     * subscriptions survive component unmount/remount cycles.
     *
     * Use this in component/screen cleanup effects.
     */
    stop() {
        console.log(
            `[AudioEngine] stop() — isPlaying=${this._isPlaying}, ` +
            `gapless=${this._isGaplessMode}`
        );
        this.stopGaplessPolling();
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        // Fire-and-forget: TrackPlayer.reset() clears queue + stops playback
        TrackPlayer.reset().catch(() => {});
        this.queueLoaded      = false;
        this._isPlaying       = false;
        this._isLoading       = false;
        this._didCompleteVerse = false;
        this.gaplessTimings   = null;
        this.gaplessLastAyah  = -1;
        this.emit();
    }

    /**
     * destroy() — Full teardown including RNTP event listeners.
     * Only call this on app-level shutdown, NEVER from component cleanup.
     */
    destroy() {
        this.stop();
        this.eventSubs.forEach(s => s.remove());
        this.eventSubs = [];
        this.eventsRegistered = false;
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
