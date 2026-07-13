/**
 * Offline Upload Queue System
 * Queues failed uploads and retries when network is restored.
 * Uses the Muaalem API pipeline (same as VAD recorder).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkRecitationWithMuaalem, MuaalemAssessment, AyahRange } from './muaalem-api';
import { checkConnectivity } from './network';
import { supabase } from './supabase';
import { updateReviewSchedule } from './planner';
import { awardXP, updateStreak, XP_REWARDS } from './gamification';
import { advanceWardPosition } from './ward';
import type { RecitationAssessment } from './recitation-storage';

interface QueuedUpload {
  kind?: 'audio_upload';
  id: string;
  audioUri: string;
  referenceText: string;
  ayahRange?: AyahRange;
  userId: string;
  surahNumber: number;
  timestamp: number;
  retryCount: number;
}

export interface QueuedRecitationEvent {
  kind: 'recitation_sync';
  id: string;
  eventId: string;
  userId: string;
  localDay: string;
  surahNumber: number;
  surahName: string;
  selectedRange: { from: number; to: number };
  uniquePages: number;
  score: number | null;
  mistakes: NonNullable<RecitationAssessment['mistakes']>;
  side: 'forward' | 'backward';
  totalVerses: number;
  createdAt: string;
  retryCount: number;
  syncStatus: 'pending' | 'syncing' | 'failed';
}

const QUEUE_KEY = 'offline_upload_queue';
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 10;

type OfflineQueueItem = QueuedUpload | QueuedRecitationEvent;

function isRecitationEvent(item: OfflineQueueItem): item is QueuedRecitationEvent {
  return item.kind === 'recitation_sync';
}

export class OfflineUploadQueue {
  private static instance: OfflineUploadQueue;
  private queue: OfflineQueueItem[] = [];
  private processing = false;
  private loaded = false;

  private constructor() {
    // Queue is loaded lazily on first access via ensureLoaded()
  }

  static getInstance(): OfflineUploadQueue {
    if (!OfflineUploadQueue.instance) {
      OfflineUploadQueue.instance = new OfflineUploadQueue();
    }
    return OfflineUploadQueue.instance;
  }

  /** Ensures queue is loaded from AsyncStorage before any operation */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.loadQueue();
    this.loaded = true;
  }

  private async loadQueue(): Promise<void> {
    try {
      const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
      if (queueJson) {
        try {
          this.queue = JSON.parse(queueJson);
        } catch (parseErr) {
          console.warn('[offline-queue] Corrupt queue data, resetting:', parseErr);
          this.queue = [];
          await AsyncStorage.removeItem(QUEUE_KEY);
        }
        console.log(`📦 Loaded ${this.queue.length} queued uploads`);
      }
    } catch (error) {
      console.error('Error loading queue:', error);
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  }

  async addToQueue(
    audioUri: string,
    referenceText: string,
    userId: string,
    surahNumber: number,
    ayahRange?: AyahRange,
  ): Promise<string> {
    await this.ensureLoaded();
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('طابور التحميل ممتلئ. يرجى الانتظار حتى يتم رفع التسجيلات السابقة.');
    }

    const upload: QueuedUpload = {
      kind: 'audio_upload',
      id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      audioUri,
      referenceText,
      userId,
      surahNumber,
      ayahRange,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.push(upload);
    await this.saveQueue();

    console.log(`✅ Added upload to queue: ${upload.id}`);
    return upload.id;
  }

  async addRecitationEvent(event: Omit<QueuedRecitationEvent, 'kind' | 'id' | 'retryCount' | 'syncStatus'>): Promise<string> {
    await this.ensureLoaded();
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('طابور المزامنة ممتلئ. يرجى الاتصال بالإنترنت لمزامنة النتائج السابقة.');
    }

    const existing = this.queue.find(item => isRecitationEvent(item) && item.eventId === event.eventId);
    if (existing) return existing.id;

    const queued: QueuedRecitationEvent = {
      ...event,
      kind: 'recitation_sync',
      id: `recitation_${event.eventId}`,
      retryCount: 0,
      syncStatus: 'pending',
    };

    this.queue.push(queued);
    await this.saveQueue();
    console.log(`✅ Added recitation event to queue: ${queued.eventId}`);
    return queued.id;
  }

  private async processRecitationEvent(event: QueuedRecitationEvent): Promise<void> {
    event.syncStatus = 'syncing';

    if (event.mistakes.length > 0) {
      const mistakesToSave = event.mistakes.map(mistake => ({
        user_id: event.userId,
        surah: event.surahNumber,
        verse: event.selectedRange.from,
        error_description: `${mistake.text} → ${mistake.correction}: ${mistake.description}`,
        event_id: event.eventId,
        created_at: event.createdAt,
      }));
      const { error } = await supabase.from('mistake_log').insert(mistakesToSave);
      if (error) console.warn('[offline-queue] mistake sync failed:', error.message);
    }

    const { error: dailyError } = await supabase.rpc('upsert_daily_log_atomic', {
      p_user_id: event.userId,
      p_date: event.localDay,
      p_surah_number: event.surahNumber,
      p_verse_from: event.selectedRange.from,
      p_verse_to: event.selectedRange.to,
      p_pages: event.uniquePages,
      p_score: event.score,
      p_event_id: event.eventId,
    });
    if (dailyError) throw dailyError;

    await updateReviewSchedule(event.userId, event.surahNumber, event.score ?? 0);

    const streakStatus = await updateStreak(event.userId, event.localDay);
    if (streakStatus === 'incremented') {
      await awardXP(event.userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak', `${event.eventId}:streak`);
    }
    await awardXP(event.userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation', `${event.eventId}:page`);
    if (event.mistakes.length === 0) {
      await awardXP(event.userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation', `${event.eventId}:perfect`);
    }

    const isSurahCompleted = event.selectedRange.from === 1 && event.selectedRange.to >= event.totalVerses;
    if (isSurahCompleted) {
      await advanceWardPosition(
        event.userId,
        event.side,
        event.surahNumber,
        event.selectedRange.to,
        event.totalVerses,
      );
    }
  }

  async processQueue(): Promise<void> {
    await this.ensureLoaded();
    if (this.processing || this.queue.length === 0) {
      return;
    }

    const isOnline = await checkConnectivity();
    if (!isOnline) {
      console.log('⚠️ Offline — skipping queue processing');
      return;
    }

    this.processing = true;
    console.log(`📤 Processing ${this.queue.length} queued uploads...`);

    const results: Array<{ id: string; success: boolean; result?: MuaalemAssessment }> = [];

    for (const upload of [...this.queue]) {
      try {
        console.log(`📤 Syncing ${upload.id} (attempt ${upload.retryCount + 1})...`);

        if (isRecitationEvent(upload)) {
          await this.processRecitationEvent(upload);
          results.push({ id: upload.id, success: true });
          this.queue = this.queue.filter(u => u.id !== upload.id);
          console.log(`✅ Recitation event ${upload.eventId} synced`);
          continue;
        }

        const result = await checkRecitationWithMuaalem(
          upload.audioUri,
          upload.referenceText,
          upload.ayahRange,
        );

        results.push({ id: upload.id, success: true, result });

        this.queue = this.queue.filter(u => u.id !== upload.id);
        console.log(`✅ Upload ${upload.id} succeeded`);
      } catch (error: any) {
        console.error(`❌ Upload ${upload.id} failed:`, error.message);

        upload.retryCount++;
        if (upload.retryCount >= MAX_RETRIES) {
          this.queue = this.queue.filter(u => u.id !== upload.id);
          console.log(`🗑️ Removed ${upload.id} after ${MAX_RETRIES} retries`);
        }

        results.push({ id: upload.id, success: false });
      }
    }

    await this.saveQueue();
    this.processing = false;

    console.log(`✅ Queue processing complete. ${this.queue.length} remaining.`);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    console.log('🗑️ Queue cleared');
  }

  getQueuedUploads(): OfflineQueueItem[] {
    return [...this.queue];
  }
}

export const offlineQueue = OfflineUploadQueue.getInstance();
