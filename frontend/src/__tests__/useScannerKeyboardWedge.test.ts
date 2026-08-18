import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScannerKeyboardWedge } from '../hooks/useScannerKeyboardWedge';

describe('useScannerKeyboardWedge Custom Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accumulates fast keystrokes and calls onScan when Enter key is pressed', () => {
    const handleScan = vi.fn();
    renderHook(() =>
      useScannerKeyboardWedge({
        onScan: handleScan,
        playAudio: false,
        maxKeyIntervalMs: 50,
      })
    );

    // Simulate fast barcode scanner keystrokes for "SKU123"
    const keys = ['S', 'K', 'U', '1', '2', '3'];
    keys.forEach((key) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
        vi.advanceTimersByTime(10); // 10ms interval
      });
    });

    // Press Enter to finish scanning
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(handleScan).toHaveBeenCalledTimes(1);
    expect(handleScan).toHaveBeenCalledWith('SKU123');
  });

  it('ignores keystrokes when typing inside an input element', () => {
    const handleScan = vi.fn();
    renderHook(() =>
      useScannerKeyboardWedge({
        onScan: handleScan,
        enabledInInputs: false,
        playAudio: false,
      })
    );

    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);

    // Dispatch event targeted at input element
    act(() => {
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(handleScan).not.toHaveBeenCalled();
    document.body.removeChild(inputEl);
  });

  it('resets buffer when keystrokes are too slow (> 50ms)', () => {
    const handleScan = vi.fn();
    renderHook(() =>
      useScannerKeyboardWedge({
        onScan: handleScan,
        playAudio: false,
        maxKeyIntervalMs: 50,
      })
    );

    // Slow human typing: S -> wait 100ms -> K -> wait 100ms -> Enter
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S' }));
      vi.advanceTimersByTime(100); // Exceeds 50ms interval
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K' }));
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(handleScan).not.toHaveBeenCalled();
  });
});
