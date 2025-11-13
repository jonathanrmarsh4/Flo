import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  threshold?: number;
}

export function useLongPress(
  { onLongPress, onClick, threshold = 500 }: UseLongPressOptions
) {
  const isLongPress = useRef(false);
  const timerId = useRef<number | null>(null);

  const start = useCallback(() => {
    isLongPress.current = false;
    timerId.current = window.setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, threshold);
  }, [onLongPress, threshold]);

  const clear = useCallback(() => {
    if (timerId.current) {
      clearTimeout(timerId.current);
      timerId.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    start();
  }, [start]);

  const handlePointerUp = useCallback(() => {
    clear();
    if (!isLongPress.current && onClick) {
      onClick();
    }
  }, [clear, onClick]);

  const handlePointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerCancel,
  };
}
