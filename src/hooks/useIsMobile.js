// src/hooks/useIsMobile.js
// Returns true when viewport width is <= 768px (narrow) OR height is <= 500px (landscape phone).
// Updates on resize via ResizeObserver for accuracy over window.resize.
// Used exclusively for layout switching — no game logic.

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const SHORT_BREAKPOINT = 500; // landscape phone

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && (
      window.innerWidth <= MOBILE_BREAKPOINT || window.innerHeight <= SHORT_BREAKPOINT
    )
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const check = () => setIsMobile(
      window.innerWidth <= MOBILE_BREAKPOINT || window.innerHeight <= SHORT_BREAKPOINT
    );

    // ResizeObserver on document.body is more reliable than window resize
    const ro = new ResizeObserver(check);
    ro.observe(document.body);

    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return isMobile;
}
