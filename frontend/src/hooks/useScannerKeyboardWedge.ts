import { useEffect, useRef } from 'react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';

export interface UseScannerKeyboardWedgeOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  enabledInInputs?: boolean;
  minBarcodeLength?: number;
  maxKeyIntervalMs?: number;
  playAudio?: boolean;
}

export function useScannerKeyboardWedge({
  onScan,
  enabled = true,
  enabledInInputs = false,
  minBarcodeLength = 3,
  maxKeyIntervalMs = 50,
  playAudio = true,
}: UseScannerKeyboardWedgeOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // If user is actively typing in an input field and enabledInInputs is false, ignore global wedge
      if (isInput && !enabledInInputs) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // If interval between keys is too long, reset buffer unless it's the very first character
      if (timeDiff > maxKeyIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Reset buffer timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        bufferRef.current = '';
      }, 200);

      // Handle Enter key (Barcode scanner prefix/suffix)
      if (event.key === 'Enter') {
        const scannedString = bufferRef.current.trim();
        if (scannedString.length >= minBarcodeLength) {
          event.preventDefault();
          if (playAudio) {
            playSuccessBeep();
          }
          onScan(scannedString);
        }
        bufferRef.current = '';
        return;
      }

      // Only accumulate single printable characters (length 1, not Shift, Control, Alt, etc.)
      if (event.key && event.key.length === 1) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, enabledInInputs, minBarcodeLength, maxKeyIntervalMs, playAudio, onScan]);

  return {
    clearBuffer: () => {
      bufferRef.current = '';
    },
    triggerErrorSound: () => {
      if (playAudio) {
        playErrorBeep();
      }
    },
    triggerSuccessSound: () => {
      if (playAudio) {
        playSuccessBeep();
      }
    },
  };
}
