import * as React from 'react';
import { RecitationAssessment } from '../lib/recitation-storage';

interface ReciteRecordingState {
    analyzing: boolean;
    uploadStep: 'idle' | 'uploading' | 'analyzing' | 'saving';
    feedback: RecitationAssessment | null;
    modalVisible: boolean;
    saving: boolean;
}

interface ReciteRecordingContextValue extends ReciteRecordingState {
    setAnalyzing: React.Dispatch<React.SetStateAction<boolean>>;
    setUploadStep: React.Dispatch<React.SetStateAction<'idle' | 'uploading' | 'analyzing' | 'saving'>>;
    setFeedback: React.Dispatch<React.SetStateAction<RecitationAssessment | null>>;
    setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
    setSaving: React.Dispatch<React.SetStateAction<boolean>>;
}

const ReciteRecordingContext = React.createContext<ReciteRecordingContextValue | null>(null);

export function ReciteRecordingProvider({ children }: { children: React.ReactNode }) {
    const [analyzing, setAnalyzing] = React.useState(false);
    const [uploadStep, setUploadStep] = React.useState<'idle' | 'uploading' | 'analyzing' | 'saving'>('idle');
    const [feedback, setFeedback] = React.useState<RecitationAssessment | null>(null);
    const [modalVisible, setModalVisible] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    const value = React.useMemo(() => ({
        analyzing, setAnalyzing,
        uploadStep, setUploadStep,
        feedback, setFeedback,
        modalVisible, setModalVisible,
        saving, setSaving,
    }), [analyzing, uploadStep, feedback, modalVisible, saving]);

    return (
        <ReciteRecordingContext.Provider value={value}>
            {children}
        </ReciteRecordingContext.Provider>
    );
}

export function useReciteRecording() {
    const ctx = React.useContext(ReciteRecordingContext);
    if (!ctx) throw new Error('useReciteRecording must be used within ReciteRecordingProvider');
    return ctx;
}
