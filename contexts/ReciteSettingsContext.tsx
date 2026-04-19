import * as React from 'react';

interface ReciteSettingsContextValue {
    settingsVisible: boolean;
    setSettingsVisible: React.Dispatch<React.SetStateAction<boolean>>;
    currentFontSize: number;
    setCurrentFontSize: React.Dispatch<React.SetStateAction<number>>;
    isBookmarked: boolean;
    setIsBookmarked: React.Dispatch<React.SetStateAction<boolean>>;
    nightMode: boolean;
    setNightMode: (value: boolean) => void;
}

const ReciteSettingsContext = React.createContext<ReciteSettingsContextValue | null>(null);

export function ReciteSettingsProvider({
    children,
    initialFontSize,
    nightMode: nightModeProp,
    toggleTheme,
}: {
    children: React.ReactNode;
    initialFontSize: number;
    nightMode: boolean;
    toggleTheme: () => void;
}) {
    const [settingsVisible, setSettingsVisible] = React.useState(false);
    const [currentFontSize, setCurrentFontSize] = React.useState(initialFontSize);
    const [isBookmarked, setIsBookmarked] = React.useState(false);

    const setNightMode = React.useCallback((value: boolean) => {
        if (value !== nightModeProp) toggleTheme();
    }, [nightModeProp, toggleTheme]);

    const value = React.useMemo(() => ({
        settingsVisible, setSettingsVisible,
        currentFontSize, setCurrentFontSize,
        isBookmarked, setIsBookmarked,
        nightMode: nightModeProp, setNightMode,
    }), [settingsVisible, currentFontSize, isBookmarked, nightModeProp, setNightMode]);

    return (
        <ReciteSettingsContext.Provider value={value}>
            {children}
        </ReciteSettingsContext.Provider>
    );
}

export function useReciteSettings() {
    const ctx = React.useContext(ReciteSettingsContext);
    if (!ctx) throw new Error('useReciteSettings must be used within ReciteSettingsProvider');
    return ctx;
}
