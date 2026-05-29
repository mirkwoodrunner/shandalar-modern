import { useState, useCallback } from 'react';

export interface TweakValues {
  arrowColor: string;
  arrowThickness: number;
  arrowStyle: 'solid' | 'dashed' | 'dotted';
  arrowGlow: boolean;
  arrowAnimate: boolean;
  aiSpeed: number;
}

function readAiSpeedParam(): number {
  const raw = new URLSearchParams(window.location.search).get('aiSpeed');
  const n   = raw !== null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 400;
}

const TWEAK_DEFAULTS: TweakValues = {
  arrowColor: '#ffd060',
  arrowThickness: 3,
  arrowStyle: 'solid',
  arrowGlow: true,
  arrowAnimate: true,
  aiSpeed: readAiSpeedParam(),
};

export function useTweaks() {
  const [values, setValues] = useState<TweakValues>(TWEAK_DEFAULTS);

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, val: TweakValues[K]) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);

  return [values, setTweak] as const;
}
