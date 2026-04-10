/**
 * Playback Service — runs on the RNTP background thread.
 *
 * This module handles all remote control events (lock screen controls,
 * headphone buttons, notification actions). It must be registered before
 * TrackPlayer is set up in the app.
 *
 * IMPORTANT: This file must NOT import any React or Expo modules.
 * It runs in a separate JS context (background service thread).
 */
import TrackPlayer, { Event, State } from 'react-native-track-player';

export async function PlaybackService() {
    // ── Remote Controls ────────────────────────────────────────────────────

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
        TrackPlayer.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
        TrackPlayer.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
        TrackPlayer.stop();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
        TrackPlayer.skipToNext();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        TrackPlayer.skipToPrevious();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
        TrackPlayer.seekTo(event.position);
    });

    // ── Playback State Changes ─────────────────────────────────────────────
    // Log errors that occur in background to aid debugging.
    TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
        console.error('[PlaybackService] Playback error:', error);
    });
}
