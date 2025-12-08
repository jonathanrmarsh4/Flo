import { useState, useEffect } from 'react';

// Define tile IDs
export type TileId = 
  | 'morning-briefing'
  | 'heart-metabolic'
  | 'body-composition'
  | 'flomentum'
  | 'readiness'
  | 'sleep'
  | 'insights';

// Default tile order (Flo Overview is locked at top, these are the sortable tiles below it)
const DEFAULT_TILE_ORDER: TileId[] = [
  'morning-briefing',
  'flomentum',
  'insights',
  'sleep',
  'readiness',
  'heart-metabolic',
  'body-composition',
];

const STORAGE_KEY = 'flo-dashboard-tile-order';

export function useTileOrder() {
  const [tileOrder, setTileOrder] = useState<TileId[]>(() => {
    // Try to load from localStorage
    if (typeof window === 'undefined') return DEFAULT_TILE_ORDER;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Filter out any removed tiles (like 'quick-stats') and validate
        const validTiles = parsed.filter((id): id is TileId => 
          DEFAULT_TILE_ORDER.includes(id as TileId)
        );
        // Validate that all current tiles are present
        const hasAllTiles = DEFAULT_TILE_ORDER.every(id => validTiles.includes(id));
        if (hasAllTiles && validTiles.length === DEFAULT_TILE_ORDER.length) {
          return validTiles;
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
