/**
 * Local-day helpers.
 *
 * Mutqin treats "today" as the user's device-local calendar day for streaks,
 * daily logs, ward completion, and client fallbacks. Server RPCs should accept
 * this date from the client instead of deriving CURRENT_DATE independently.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalDay(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseLocalDay(localDay: string): Date {
    const [year, month, day] = localDay.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

export function addLocalDays(localDay: string, days: number): string {
    const date = parseLocalDay(localDay);
    date.setDate(date.getDate() + days);
    return getLocalDay(date);
}

export function diffLocalDays(fromLocalDay: string, toLocalDay: string): number {
    const from = parseLocalDay(fromLocalDay);
    const to = parseLocalDay(toLocalDay);
    return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function createEventId(parts: Array<string | number | null | undefined>): string {
    return parts
        .filter(part => part !== null && part !== undefined && `${part}`.length > 0)
        .map(part => `${part}`.replace(/[^a-zA-Z0-9_-]/g, '-'))
        .join(':');
}
