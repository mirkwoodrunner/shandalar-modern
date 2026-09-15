// src/learn/ui/LearnFooter.tsx
// Presentation only.

import React from 'react';
import { DISCLAIMER } from '../content';

export function LearnFooter() {
  return (
    <footer data-testid="learn-disclaimer" className="learn-footer">
      {DISCLAIMER}
    </footer>
  );
}
