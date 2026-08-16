import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';

describe('useDebouncedSearch Custom Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates debouncedTerm after specified delay', () => {
    const { result } = renderHook(() => useDebouncedSearch('', 300));

    expect(result.current.searchTerm).toBe('');
    expect(result.current.debouncedTerm).toBe('');
    expect(result.current.isDebouncing).toBe(false);

    // Update search term
    act(() => {
      result.current.setSearchTerm('SKU-001');
    });

    expect(result.current.searchTerm).toBe('SKU-001');
    expect(result.current.debouncedTerm).toBe('');
    expect(result.current.isDebouncing).toBe(true);

    // Fast forward timer by 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedTerm).toBe('SKU-001');
    expect(result.current.isDebouncing).toBe(false);
  });
});
