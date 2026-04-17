// src/hooks/useKeyboard.js
// Keyboard shortcut handler for duel actions.
// Presentation layer only — dispatches to DuelCore via useDuel callbacks.

import { useEffect } from 'react';

/**

- Bind keyboard shortcuts for duel controls.
- 
- @param {object} handlers - Map of key → handler function
- Supported keys: "Enter", "Escape", " " (space), "ArrowRight", etc.
- @param {boolean} [enabled=true] - Whether to listen
  */
  export function useKeyboard(handlers, enabled = true) {
  useEffect(() => {
  if (!enabled) return;
  
  const onKeyDown = (e) => {
  // Don't fire when user is typing in an input/textarea
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  
  const handler = handlers[e.key];
  if (handler) {
  e.preventDefault();
  handler(e);
  }
  };
  
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers, enabled]);
  }

/**

- Common duel keyboard bindings factory.
- Pass the dispatcher functions from useDuel.
  */
  export function makeDuelKeyHandlers({ advancePhase, resolveStack, selectCard, mulligan }) {
  return {
  " ":          () => advancePhase?.(),    // Space → next phase
  "Enter":      () => resolveStack?.(),    // Enter → resolve stack
  "Escape":     () => selectCard?.(null),  // Esc → deselect
  "ArrowRight": () => advancePhase?.(),    // → → next phase
  };
  }

export default { useKeyboard, makeDuelKeyHandlers };
