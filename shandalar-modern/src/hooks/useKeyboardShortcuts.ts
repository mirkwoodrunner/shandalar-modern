import { useEffect } from 'react';

interface ShortcutHandlers {
  onPassPriority: () => void;
  onEndTurn: () => void;
  onCancel: () => void;
  onQuickCast: (index: number) => void;
  isIdle: boolean;
}

export function useKeyboardShortcuts({
  onPassPriority,
  onEndTurn,
  onCancel,
  onQuickCast,
  isIdle,
}: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        onPassPriority();
      } else if (e.code === 'Enter' && isIdle) {
        e.preventDefault();
        onEndTurn();
      } else if (e.code === 'Escape') {
        onCancel();
      } else if (e.key >= '1' && e.key <= '9') {
        onQuickCast(parseInt(e.key) - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPassPriority, onEndTurn, onCancel, onQuickCast, isIdle]);
}
