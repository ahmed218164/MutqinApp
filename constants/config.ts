/**
 * constants/config.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Central configuration constants for MutqinApp.
 * Extracted from magic numbers scattered across the codebase.
 *
 * Import from here instead of using raw numbers in business logic.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Ward / Memorization ──────────────────────────────────────────────────────

/** Default number of verses per Mushaf page (used as fallback when SQLite cache isn't populated) */
export const DEFAULT_VERSES_PER_PAGE = 15;

/** Total number of pages in the standard Hafs Mushaf */
export const TOTAL_MUSHAF_PAGES = 604;

/** Total number of surahs in the Quran */
export const TOTAL_SURAHS = 114;

// ─── Review / SM-2 ──────────────────────────────────────────────────────────

/** Maximum number of due reviews to show per day (prevents overwhelming the user) */
export const MAX_DAILY_REVIEWS = 15;

/** Default number of days before the first review (used by the legacy review system) */
export const DEFAULT_REVIEW_DAYS = 5;

/** SM-2 default ease factor */
export const SM2_DEFAULT_EFACTOR = 2.5;

/** SM-2 minimum ease factor (floor from the spec) */
export const SM2_MIN_EFACTOR = 1.3;

/** SM-2 maximum review interval in days */
export const SM2_MAX_INTERVAL_DAYS = 365;

// ─── Recording / Audio ─────────────────────────────────────────────────────

/** VAD: dB threshold below which we consider "silence" */
export const VAD_SILENCE_THRESHOLD_DB = -35;

/** VAD: How long silence must last before we split (ms) */
export const VAD_SILENCE_DURATION_MS = 3000;

/** VAD: Metering poll interval (ms) */
export const VAD_METERING_INTERVAL_MS = 100;

/** VAD: Minimum chunk duration before analysis (ms) */
export const VAD_MIN_CHUNK_DURATION_MS = 3000;

/** Maximum audio file size for upload (MB) */
export const MAX_UPLOAD_SIZE_MB = 10;

/** Upload timeout (ms) */
export const UPLOAD_TIMEOUT_MS = 30000;

/** Muaalem API request timeout — covers cold start + inference (ms) */
export const MUAALEM_REQUEST_TIMEOUT_MS = 300_000; // 5 minutes

// ─── Gamification ───────────────────────────────────────────────────────────

/** XP required for level n: base_xp + (n-1) * xp_increment */
export const XP_BASE_PER_LEVEL = 100;

/** XP increment per additional level (after level 5 the formula changes) */
export const XP_INCREMENT_PER_LEVEL = 50;

// ─── Offline Queue ──────────────────────────────────────────────────────────

/** Maximum number of uploads that can be queued offline */
export const MAX_OFFLINE_QUEUE_SIZE = 10;

/** Maximum retries for a failed offline upload */
export const MAX_OFFLINE_RETRIES = 3;

// ─── Health Check ───────────────────────────────────────────────────────────

/** Dashboard periodic health check interval (ms) */
export const HEALTH_CHECK_INTERVAL_MS = 30000;
