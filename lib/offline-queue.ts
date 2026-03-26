/**
 * Offline Upload Queue System
 * Queues failed uploads and retries when network is restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkRecitationViaStorage, RecitationAssessment } from './recitation-storage';
import { checkConnectivity } from './network';

interface QueuedUpload {
  id: string;
  audioUri: string;
  referenceText: string;
  userId: string;
  surahNumber: number;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'offline_upload_queue';
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 10;

export class OfflineUploadQueue {
  private static instance: OfflineUploadQueue;
  private queue: QueuedUpload[] = [];
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
    surahNumber: number
  ): Promise<string> {
    await this.ensureLoaded();
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('طابور التحميل ممتلئ. يرجى الانتظار حتى يتم رفع التسجيلات السابقة.');
    }

    const upload: QueuedUpload = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      audioUri,
      referenceText,
      userId,
      surahNumber,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.push(upload);
    await this.saveQueue();

    console.log(`✅ Added upload to queue: ${upload.id}`);
    return upload.id;
  }

  async processQueue(): Promise<void> {
    await this.ensureLoaded();
    if (this.processing || this.queue.length === 0) {
      return;
    }

    const isOnline = await checkConnectivity();
    if (!isOnline) {
      console.log('⚠️ Offline - skipping queue processing');
      return;
    }

    this.processing = true;
    console.log(`📤 Processing ${this.queue.length} queued uploads...`);

    const results: Array<{ id: string; success: boolean; result?: RecitationAssessment }> = [];

    for (const upload of [...this.queue]) {
      try {
        console.log(`📤 Uploading ${upload.id} (attempt ${upload.retryCount + 1})...`);

        const result = await checkRecitationViaStorage(
          upload.audioUri,
          upload.referenceText,
          upload.userId
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

  getQueuedUploads(): QueuedUpload[] {
    return [...this.queue];
  }
}

export const offlineQueue = OfflineUploadQueue.getInstance();
