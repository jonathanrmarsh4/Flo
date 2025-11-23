import { useState, useEffect } from 'react';

// Define tile IDs
export type TileId = 
  | 'health-metrics' // Heart & Metabolic + Body Composition grid
  | 'flomentum'
  | 'readiness'
  | 'sleep'
  | 'insights'
  | 'quick-stats';

// Default tile order
const DEFAULT_TILE_ORDER: TileId[] = [
  'health-metrics',
  'flomentum',
  'readiness',
  'sleep',
  'insights',
  'quick-stats',
];

const STORAGE_KEY = 'flo-dashboard-tile-order';

export function useTileOrder() {
  const [tileOrder, setTileOrder] = useState<TileId[]>(() => {
    // Try to load from localStorage
    if (typeof window === 'undefined') return DEFAULT_TILE_ORDER;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TileId[];
        // Validate that all tiles are present
        const hasAllTiles = DEFAULT_TILE_ORDER.every(id => parsed.includes(id));
        if (hasAllTiles && parsed.length === DEFAULT_TILE_ORDER.length) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load tile order from localStorage:', error);
    }
    
    return DEFAULT_TILE_ORDER;
  });

  // Persist to localStorage whenever order changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tileOrder));
    } catch (error) {
      console.error('Failed to save tile order to localStorage:', error);
    }
  }, [tileOrder]);

  const reorderTiles = (newOrder: TileId[]) => {
    setTileOrder(newOrder);
  };

  const resetToDefault = () => {
    setTileOrder(DEFAULT_TILE_ORDER);
  };

  return {
    tileOrder,
    reorderTiles,
    resetToDefault,
  };
}
