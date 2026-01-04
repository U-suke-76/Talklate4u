import { useState, useCallback, useEffect } from 'react';

export interface MicrophoneDevice {
    deviceId: string;
    label: string;
}

export function useMicrophone(onLog?: (msg: string) => void) {
    const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
    const [activeMic, setActiveMic] = useState<MicrophoneDevice | null>(null);

    const loadMicrophones = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices
                .filter((d) => d.kind === "audioinput")
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Mic ${d.deviceId.slice(0, 4)}`,
                }));

            setMicrophones(mics);
            if (mics.length > 0 && onLog) {
                onLog(`Microphones loaded: ${mics.length} devices found.`);
            }
            return mics;
        } catch (err) {
            console.error("Failed to load microphones", err);
            if (onLog) onLog(`Error loading microphones: ${err}`);
            return [];
        }
    }, [onLog]);

    const selectMicrophone = useCallback(async (micLabel: string | undefined, allMics: MicrophoneDevice[]) => {
       
        // [DEBUG] Log all available devices to help diagnose matching issues
        const logMsg = `[DEBUG] Config Mic: "${micLabel}"`;
        if (onLog) onLog(logMsg);
        window.electronAPI?.log(logMsg);

        // 1. Exact Match
        const targetMic = allMics.find((d) => d.label === micLabel);

        if (micLabel && !targetMic) {
            if (onLog) {
                 onLog(`Warning: Mic "${micLabel}" not found. Using System Default.`);
                 const available = `Available: ${allMics.map((d) => `"${d.label}"`).join(", ")}`;
                 onLog(available);
                 window.electronAPI?.log(`[Warning] Mic mismatch. ${available}`);
            }
            console.warn(`Mic "${micLabel}" not found. Available:`, allMics.map((d) => d.label));
        } else if (targetMic) {
            const msg = `Success: Selected "${targetMic.label}" (ID: ${targetMic.deviceId})`;
            if (onLog) onLog(msg);
            window.electronAPI?.log(msg);
        } else {
            const msg = `Info: No specific mic configured. Using Default.`;
            if (onLog) onLog(msg);
            window.electronAPI?.log(msg);
        }

        const selected = targetMic || null;
        setActiveMic(selected);
        return selected;
    }, [onLog]);

    // Initial load
    // Initial load
    useEffect(() => {
        loadMicrophones();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        microphones,
        activeMic,
        loadMicrophones,
        selectMicrophone,
        setActiveMic
    };
}
