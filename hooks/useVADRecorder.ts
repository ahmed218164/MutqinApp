/**
 * hooks/useVADRecorder.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * VAD (Voice Activity Detection) Continuous Chunking Recorder
 *
 * Reads audio metering (dB) from expo-audio every 100ms. When the level drops
 * below SILENCE_THRESHOLD_DB for SILENCE_DURATION_MS, the current recording
 * is stopped, sent to the Muaalem API in the background, and a new recording
 * starts instantly so the user can continue without interruption.
 *
 * On "finish" the hook aggregates all chunk results into a single
 * MuaalemAssessment for display in FeedbackModal.
 *
 * The hook also exposes a `meterLevel` value (0-1 normalised) that
 * RecordingControls can use to render a real waveform instead of Math.random().
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import {
    AudioQuality,
    IOSOutputFormat,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    type AudioRecorder,
    type RecordingOptions,
} from 'expo-audio';
import { } from 'react-native';
import { checkRecitationWithMuaalem, MuaalemAssessment, MuaalemMistake, AyahRange } from '../lib/muaalem-api';
import { mediumImpact } from '../lib/haptics';
import { useSharedValue } from 'react-native-reanimated';

// ─── Constants ───────────────────────────────────────────────────────────────

/** dB threshold below which we consider "silence" (-35 dB is less sensitive to noise) */
const SILENCE_THRESHOLD_DB = -35;

/** How long the silence must last before we split (ms) */
const SILENCE_DURATION_MS = 3000;

/** Metering poll interval (ms) */
const METERING_INTERVAL_MS = 100;

/** Minimum chunk duration in ms before we bother analysing it */
const MIN_CHUNK_DURATION_MS = 3000;

const RECORDING_OPTIONS: RecordingOptions = {
    isMeteringEnabled: true,
    extension: '.m4a',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
    android: {
        extension: '.m4a',
        outputFormat: 'mpeg4',
        audioEncoder: 'aac',
        sampleRate: 16000,
    },
    ios: {
        extension: '.wav',
        outputFormat: IOSOutputFormat.LINEARPCM,
        audioQuality: AudioQuality.HIGH,
        sampleRate: 16000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
    },
    web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
    },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChunkResult {
    /** 0-based chunk index */
    index: number;
    /** Assessment returned by Muaalem (or null if still processing) */
    assessment: MuaalemAssessment | null;
    /** Whether this chunk is still being analysed */
    processing: boolean;
}

export interface VADRecorderState {
    isSessionActive: boolean;
    isRecording: boolean;
    chunksSent: number;
    chunksCompleted: number;
    isFinishing: boolean;
}

import type { SharedValue } from 'react-native-reanimated';
import { toast } from '../components/ui/Toast';

export interface UseVADRecorderReturn {
    state: VADRecorderState;
    meterLevelShared: SharedValue<number>;
    meterHistoryShared: SharedValue<number[]>;
    /** Elapsed session seconds — updated on the UI thread (no React re-renders). */
    elapsedSecondsShared: SharedValue<number>;
    startSession: () => Promise<void>;
    finishSession: () => Promise<MuaalemAssessment | null>;
    cancelSession: () => Promise<void>;
}

// ─── Normaliser ──────────────────────────────────────────────────────────────

/**
 * Convert dB metering (typically -160..0) into a 0..1 float for UI.
 * We clamp the useful range to -60..0 dB.
 */
function normaliseMeter(db: number): number {
    const clamped = Math.max(-60, Math.min(0, db));
    return (clamped + 60) / 60; // -60 → 0, 0 → 1
}

// ─── History ring-buffer size ────────────────────────────────────────────────
const HISTORY_SIZE = 20;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVADRecorder(referenceText: string, ayahRange?: AyahRange): UseVADRecorderReturn {
    const recorder = useAudioRecorder(RECORDING_OPTIONS);
    // ── State ────────────────────────────────────────────────────────────────
    const [state, setState] = useState<VADRecorderState>({
        isSessionActive: false,
        isRecording: false,
        chunksSent: 0,
        chunksCompleted: 0,
        isFinishing: false,
    });

    // ── Reanimated shared values for metering + timer (no React re-renders) ─
    const meterLevelShared = useSharedValue(0);
    const meterHistoryShared = useSharedValue<number[]>(new Array(HISTORY_SIZE).fill(0));
    const elapsedSecondsShared = useSharedValue(0);

    // ── Refs (mutable across renders) ────────────────────────────────────────
    const recordingRef = useRef<AudioRecorder | null>(null);
    const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const silenceStartRef = useRef<number | null>(null);
    const chunkStartTimeRef = useRef<number>(0);
    const chunkIndexRef = useRef(0);
    const chunkResultsRef = useRef<ChunkResult[]>([]);
    const sessionActiveRef = useRef(false);
    const isFinishingRef = useRef(false);
    const referenceTextRef = useRef(referenceText);
    const ayahRangeRef = useRef(ayahRange);
    const mountedRef = useRef(true);

    // Keep ref in sync with latest referenceText to avoid stale closures in setInterval
    useEffect(() => {
        referenceTextRef.current = referenceText;
        ayahRangeRef.current = ayahRange;
    }, [referenceText, ayahRange]);

    // ── Cleanup on unmount ───────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            clearTimers();
            if (recordingRef.current) {
                recordingRef.current.stop().catch(() => {});
            }
        };
    }, []);

    // ── Timer helpers ────────────────────────────────────────────────────────

    function clearTimers() {
        if (meteringTimerRef.current) {
            clearInterval(meteringTimerRef.current);
            meteringTimerRef.current = null;
        }
        if (elapsedTimerRef.current) {
            clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = null;
        }
    }

    // ── Create a new expo-audio recording with metering enabled ─────────────────
    //
    // IMPORTANT: Android's MediaRecorder does NOT natively support WAV output.
    // Setting extension='.wav' on Android with DEFAULT encoder produces a broken
    // file (~12KB header only, no actual audio). We use m4a/AAC on Android instead,
    // which librosa/ffmpeg on the backend handles perfectly.
    // iOS supports true Linear PCM WAV natively.

    async function createRecording(): Promise<AudioRecorder> {
        await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
        recorder.record();
        return recorder;
    }
    // ── Start metering poller ────────────────────────────────────────────────

    function startMeteringPoller() {
        meteringTimerRef.current = setInterval(async () => {
            if (!recordingRef.current || !sessionActiveRef.current || isFinishingRef.current) return;

            try {
                const status = recordingRef.current.getStatus();
                if (!status.isRecording) return;

                const db = status.metering ?? -160;
                const normalised = normaliseMeter(db);

                // ── Update Reanimated shared values (zero React re-renders) ──
                meterLevelShared.value = normalised;
                meterHistoryShared.value = [
                    ...meterHistoryShared.value.slice(1),
                    normalised,
                ];

                // ── VAD: Silence detection → auto-split ───────────────────
                const now = Date.now();
                if (db < SILENCE_THRESHOLD_DB) {
                    // Below threshold — start or continue silence window
                    if (silenceStartRef.current === null) {
                        silenceStartRef.current = now;
                    } else if (now - silenceStartRef.current >= SILENCE_DURATION_MS) {
                        // Silence has lasted long enough — check minimum chunk length
                        const chunkDuration = now - chunkStartTimeRef.current;
                        if (chunkDuration >= MIN_CHUNK_DURATION_MS) {
                            // Reset before the async call to prevent double-triggering
                            silenceStartRef.current = null;
                            // splitChunk is async but we do NOT await it here so the
                            // setInterval callback returns immediately (non-blocking).
                            splitChunk().catch(err =>
                                console.error('[VAD] Auto-split error:', err)
                            );
                        }
                    }
                } else {
                    // Above threshold — voice detected, reset silence window
                    silenceStartRef.current = null;
                }
            } catch (err) {
                console.warn('[VAD] Metering poll error:', err);
            }
        }, METERING_INTERVAL_MS);
    }

    // ── Split: stop current recording, send to API, start new recording ──────

    async function splitChunk() {
        if (!recordingRef.current || !sessionActiveRef.current) return;

        const currentRecording = recordingRef.current;
        recordingRef.current = null;

        try {
            // Stop current
            const status = currentRecording.getStatus();
            if (status.isRecording || status.canRecord) {
                await currentRecording.stop();
            }
            const uri = currentRecording.uri;

            // Start new recording immediately (zero gap for the user)
            if (sessionActiveRef.current && !isFinishingRef.current) {
                const newRec = await createRecording();
                recordingRef.current = newRec;
                chunkStartTimeRef.current = Date.now();
            }

            // Send stopped chunk to API in background
            if (uri) {
                const idx = chunkIndexRef.current++;
                const chunkEntry: ChunkResult = { index: idx, assessment: null, processing: true };
                chunkResultsRef.current.push(chunkEntry);

                setState(prev => ({
                    ...prev,
                    chunksSent: prev.chunksSent + 1,
                }));

                // Fire-and-forget (we'll collect results on finish)
            checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
                .then(assessment => {
                    if (!mountedRef.current) return;
                    chunkEntry.assessment = assessment;
                    chunkEntry.processing = false;
                    setState(prev => ({
                        ...prev,
                        chunksCompleted: prev.chunksCompleted + 1,
                    }));
                })
                .catch(err => {
                    if (!mountedRef.current) return;
                    console.error('[VAD] Chunk analysis failed:', err);
                    chunkEntry.assessment = { score: 0, mistakes: [], error: 'فشل تحليل المقطع' };
                    chunkEntry.processing = false;
                    setState(prev => ({
                        ...prev,
                        chunksCompleted: prev.chunksCompleted + 1,
                    }));
                });
            }
        } catch (err) {
            console.error('[VAD] splitChunk error:', err);
        }
    }

    // ── Public: Start Session ────────────────────────────────────────────────

    const startSession = useCallback(async () => {
        if (sessionActiveRef.current) return;

        try {
            mediumImpact();

            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
                toast.error('يرجى السماح بالوصول إلى الميكروفون');
                return;
            }

            await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
            });

            // Reset state
            chunkIndexRef.current = 0;
            chunkResultsRef.current = [];
            silenceStartRef.current = null;
            isFinishingRef.current = false;
            sessionActiveRef.current = true;

            const rec = await createRecording();
            recordingRef.current = rec;
            chunkStartTimeRef.current = Date.now();

        setState({
            isSessionActive: true,
            isRecording: true,
            chunksSent: 0,
            chunksCompleted: 0,
            isFinishing: false,
        });

        // Reset metering shared values
        meterLevelShared.value = 0;
        meterHistoryShared.value = new Array(HISTORY_SIZE).fill(0);
        elapsedSecondsShared.value = 0;

        // Start pollers
        startMeteringPoller();

        // Elapsed timer updates a shared value on the UI thread — updating
        // React state every second here used to re-render the whole recite
        // screen (including the mushaf pager) once per second.
        const sessionStart = Date.now();
        elapsedTimerRef.current = setInterval(() => {
            elapsedSecondsShared.value = Math.floor((Date.now() - sessionStart) / 1000);
        }, 1000);
        } catch (err) {
            console.error('[VAD] startSession error:', err);
            sessionActiveRef.current = false;
            toast.error('فشل بدء التسجيل. حاول مرة أخرى.');
        }
    }, [referenceText]);

    // ── Public: Finish Session ───────────────────────────────────────────────

    const finishSession = useCallback(async (): Promise<MuaalemAssessment | null> => {
        if (!sessionActiveRef.current) return null;

        mediumImpact();
        isFinishingRef.current = true;
        sessionActiveRef.current = false;

        setState(prev => ({ ...prev, isFinishing: true, isSessionActive: false }));

        clearTimers();

        // Stop current recording and send as final chunk (fire-and-forget — no blocking await)
        if (recordingRef.current) {
            try {
                const currentRecording = recordingRef.current;
                recordingRef.current = null;

                const status = currentRecording.getStatus();
                if (status.isRecording || status.canRecord) {
                    await currentRecording.stop();
                }
                const uri = currentRecording.uri;

                if (uri) {
                    // Always send the final chunk even if shorter than MIN_CHUNK_DURATION_MS
                    // so we never discard the user's last words.
                    const idx = chunkIndexRef.current++;
                    const chunkEntry: ChunkResult = { index: idx, assessment: null, processing: true };
                    chunkResultsRef.current.push(chunkEntry);

                    if (mountedRef.current) {
                        setState(prev => ({ ...prev, chunksSent: prev.chunksSent + 1 }));
                    }

                    // ⚠️  Fire-and-forget: do NOT await — the setInterval poller below
                    // will detect when processing === false without blocking the JS thread.
                    checkRecitationWithMuaalem(uri, referenceTextRef.current, ayahRangeRef.current)
                        .then(assessment => {
                            chunkEntry.assessment = assessment;
                            chunkEntry.processing = false;
                            if (mountedRef.current) {
                                setState(prev => ({
                                    ...prev,
                                    chunksCompleted: prev.chunksCompleted + 1,
                                }));
                            }
                        })
                        .catch(err => {
                            console.error('[VAD] Final chunk analysis failed:', err);
                            chunkEntry.assessment = { score: 0, mistakes: [], error: 'فشل تحليل المقطع الأخير' };
                            chunkEntry.processing = false;
                            if (mountedRef.current) {
                                setState(prev => ({
                                    ...prev,
                                    chunksCompleted: prev.chunksCompleted + 1,
                                }));
                            }
                        });
                }
            } catch (err) {
                console.error('[VAD] finishSession stop error:', err);
            }
        }

        // Wait for all in-flight chunks to complete using async polling
        const POLL_INTERVAL = 500;
        const MAX_WAIT = 30_000;
        await new Promise<void>((resolve) => {
            const startTime = Date.now();
            const poll = setInterval(() => {
                const stillProcessing = chunkResultsRef.current.some(c => c.processing);
                const elapsed = Date.now() - startTime;
                if (!stillProcessing || elapsed >= MAX_WAIT) {
                    clearInterval(poll);
                    if (stillProcessing) {
                        console.warn('[VAD] finishSession: timed out waiting for chunks after', MAX_WAIT, 'ms');
                    }
                    resolve();
                }
            }, POLL_INTERVAL);
        });

        // Aggregate results
        const aggregated = aggregateChunkResults(chunkResultsRef.current);

        if (mountedRef.current) {
            setState(prev => ({
                ...prev,
                isFinishing: false,
                isRecording: false,
                chunksCompleted: chunkResultsRef.current.filter(c => !c.processing).length,
            }));
        }

        return aggregated;
    }, [referenceText]);

    // ── Public: Cancel Session ───────────────────────────────────────────────

    const cancelSession = useCallback(async () => {
        sessionActiveRef.current = false;
        isFinishingRef.current = true;

        clearTimers();

        if (recordingRef.current) {
            try {
                await recordingRef.current.stop();
            } catch (_) {}
            recordingRef.current = null;
        }

        chunkResultsRef.current = [];

        setState({
            isSessionActive: false,
            isRecording: false,
            chunksSent: 0,
            chunksCompleted: 0,
            isFinishing: false,
        });

        // Reset metering shared values
        meterLevelShared.value = 0;
        meterHistoryShared.value = new Array(HISTORY_SIZE).fill(0);
        elapsedSecondsShared.value = 0;
    }, []);

    return { state, meterLevelShared, meterHistoryShared, elapsedSecondsShared, startSession, finishSession, cancelSession };
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Merge all chunk assessments into one final MuaalemAssessment.
 * - Score = weighted average of non-error chunks
 * - Mistakes = concatenated from all chunks (deduplicated by description)
 */
function aggregateChunkResults(chunks: ChunkResult[]): MuaalemAssessment {
    const validChunks = chunks.filter(c => c.assessment && !c.assessment.error);

    if (validChunks.length === 0) {
        // All chunks failed
        const lastError = chunks.find(c => c.assessment?.error)?.assessment?.error;
        return {
            score: 0,
            mistakes: [],
            error: lastError || 'فشل تحليل جميع المقاطع.',
        };
    }

    // Weighted average score
    const totalScore = validChunks.reduce((sum, c) => sum + (c.assessment!.score || 0), 0);
    const avgScore = Math.round(totalScore / validChunks.length);

    // Collect all mistakes, deduplicate by description
    const seenDescriptions = new Set<string>();
    const allMistakes: MuaalemMistake[] = [];

    for (const chunk of validChunks) {
        for (const mistake of chunk.assessment!.mistakes) {
            if (!seenDescriptions.has(mistake.description)) {
                seenDescriptions.add(mistake.description);
                allMistakes.push(mistake);
            }
        }
    }

    return { score: avgScore, mistakes: allMistakes };
}
