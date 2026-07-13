let hasWarnedAboutNetwork = false;

export function isNetworkError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /network request failed|failed to fetch|network|timeout|fetch/i.test(message);
}

export function warnNetworkOnce(scope: string, error: unknown) {
    if (!isNetworkError(error) || hasWarnedAboutNetwork) return;

    hasWarnedAboutNetwork = true;
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown network error');
    console.warn(`[${scope}] Offline or unreachable network. The app will continue with local state.`, message);
}
