// src/hooks/useIsMobile.js
// Returns true when viewport width is <= 768px.
// Updates on resize via ResizeObserver for accuracy over window.resize.
// Used exclusively for layout switching — no game logic.

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);

    // ResizeObserver on document.body is more reliable than window resize
    const ro = new ResizeObserver(check);
    ro.observe(document.body);

    // Also listen to window resize as fallback
    window.addEventListener('resize', check);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  return isMobile;
}
