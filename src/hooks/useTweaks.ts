import { useState, useCallback } from 'react';

export interface TweakValues {
  arrowColor: string;
  arrowThickness: number;
  arrowStyle: 'solid' | 'dashed' | 'dotted';
  arrowGlow: boolean;
  arrowAnimate: boolean;
  aiSpeed: number;
}

const TWEAK_DEFAULTS: TweakValues = {
  arrowColor: '#ffd060',
  arrowThickness: 3,
  arrowStyle: 'solid',
  arrowGlow: true,
  arrowAnimate: true,
  aiSpeed: 400,
};

export function useTweaks() {
  const [values, setValues] = useState<TweakValues>(TWEAK_DEFAULTS);

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, val: TweakValues[K]) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);

  return [values, setTweak] as const;
}
