import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsContextType {
    theme: 'light' | 'dark';
    fontSize: number;
    toggleTheme: () => void;
    setFontSize: (size: number) => void;
}

const SettingsContext = React.createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = React.useState<'light' | 'dark'>('dark');
    const [fontSize, setFontSizeState] = React.useState(20);

    React.useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        try {
            const savedTheme = await AsyncStorage.getItem('theme');
            const savedFontSize = await AsyncStorage.getItem('fontSize');

            if (savedTheme) setTheme(savedTheme as 'light' | 'dark');
            if (savedFontSize) setFontSizeState(parseInt(savedFontSize));
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async function toggleTheme() {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        await AsyncStorage.setItem('theme', newTheme);
    }

    async function setFontSize(size: number) {
        setFontSizeState(size);
        await AsyncStorage.setItem('fontSize', size.toString());
    }

    return (
        <SettingsContext.Provider value={{ theme, fontSize, toggleTheme, setFontSize }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = React.useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
