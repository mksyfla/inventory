import { useState, useEffect } from 'react';

export function useDebouncedSearch(initialValue: string = '', delayMs: number = 300) {
  const [searchTerm, setSearchTerm] = useState<string>(initialValue);
  const [debouncedTerm, setDebouncedTerm] = useState<string>(initialValue);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, delayMs]);

  return {
    searchTerm,
    debouncedTerm,
    setSearchTerm,
    isDebouncing: searchTerm !== debouncedTerm,
  };
}
