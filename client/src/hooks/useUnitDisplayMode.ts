import { useState, useEffect, useCallback } from 'react';

export type UnitDisplayMode = 'original' | 'standard';

const STORAGE_KEY = 'flo_unit_display_mode';

export function useUnitDisplayMode() {
  const [mode, setModeState] = useState<UnitDisplayMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'original' || stored === 'standard') {
        return stored;
      }
    }
    return 'original';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((newMode: UnitDisplayMode) => {
    setModeState(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState(prev => prev === 'original' ? 'standard' : 'original');
  }, []);

  const isOriginal = mode === 'original';
  const isStandard = mode === 'standard';

  return {
    mode,
    setMode,
    toggleMode,
    isOriginal,
    isStandard,
  };
}
