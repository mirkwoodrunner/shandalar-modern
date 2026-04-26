import { useState, useCallback } from 'react';

export interface TweakValues {
  arrowColor: string;
  arrowThickness: number;
  arrowStyle: 'solid' | 'dashed' | 'dotted';
  arrowGlow: boolean;
  arrowAnimate: boolean;
  scenario: string;
  oppArchetype: 'aggro' | 'control' | 'midrange';
  aiSpeed: number;
  seed: number;
}

// /*EDITMODE-BEGIN*/
const TWEAK_DEFAULTS: TweakValues = {
  arrowColor: '#ffd060',
  arrowThickness: 3,
  arrowStyle: 'solid',
  arrowGlow: true,
  arrowAnimate: true,
  scenario: 'spell-creature',
  oppArchetype: 'midrange',
  aiSpeed: 400,
  seed: Math.floor(Math.random() * 99999),
};
// /*EDITMODE-END*/

export function useTweaks() {
  const [values, setValues] = useState<TweakValues>(TWEAK_DEFAULTS);

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, val: TweakValues[K]) => {
    setValues(prev => ({ ...prev, [key]: val }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
  }, []);

  return [values, setTweak] as const;
}
