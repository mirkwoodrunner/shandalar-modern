// src/ui/duel/ScenarioOverlay.tsx
// The lesson-chrome shell for scenario mode (Learn Mode L3).
//
// Presentation only. It knows nothing about exercises, goals, grading, or the
// lesson lifecycle -- it takes strings and callbacks and lays them out over the
// duel board. Every decision about what to show is made by the caller
// (src/learn/ui/ScenarioLesson.tsx); every decision about game state is made by
// DuelCore. This component resolves no rules and mutates nothing.
//
// It is mounted only by a duel screen whose config has `scenario: true`, so no
// campaign or sandbox duel can reach it.

import { useState } from 'react';
import css from './ScenarioOverlay.module.css';

export type ScenarioOverlayButton = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
};

export type ScenarioOverlayFeedback = {
  tone: 'success' | 'fail' | 'error';
  text: string;
};

export interface ScenarioOverlayProps {
  /** Short label above the prompt, e.g. the exercise title. */
  title: string;
  /** The task, in the learner's words. */
  prompt: string;
  /** Shown only once the learner asks for it. */
  hint?: string | null;
  /** A refused action's explanation. The learner is still acting. */
  rejection?: string | null;
  /** A graded attempt's result. Mutually exclusive with rejection in practice. */
  feedback?: ScenarioOverlayFeedback | null;
  buttons: ScenarioOverlayButton[];
  /** Mobile gets a top-docked band with a collapse toggle; desktop a left dock. */
  isMobile: boolean;
}

const TONE_CLASS: Record<ScenarioOverlayFeedback['tone'], string> = {
  success: css.success,
  fail: css.fail,
  error: css.error,
};

export function ScenarioOverlay({
  title,
  prompt,
  hint = null,
  rejection = null,
  feedback = null,
  buttons,
  isMobile,
}: ScenarioOverlayProps) {
  // Collapsing is mobile-only: on a phone the band sits over the opponent's
  // row, and a learner mid-attempt sometimes needs to see what is under it.
  // Desktop has room for both, so the toggle never renders there.
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = isMobile && collapsed;

  const shellClass = [
    css.overlay,
    isMobile ? css.mobile : css.desktop,
    isCollapsed ? css.collapsed : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass} data-testid="scenario-overlay">
      <div className={css.panel}>
        <div className={css.header}>
          <span className={css.title} data-testid="scenario-title">{title}</span>
          {isMobile && (
            <button
              type="button"
              className={css.collapseToggle}
              data-testid="scenario-collapse-toggle"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed(c => !c)}
            >
              {isCollapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>

        {!isCollapsed && (
          <>
            <p className={css.prompt} data-testid="scenario-prompt">{prompt}</p>

            {hint && (
              <p className={css.hint} data-testid="scenario-hint">{hint}</p>
            )}

            {rejection && (
              <p className={css.rejection} data-testid="scenario-rejection">{rejection}</p>
            )}

            {feedback && (
              <p
                className={`${css.feedback} ${TONE_CLASS[feedback.tone]}`}
                data-testid="scenario-feedback"
                data-outcome={feedback.tone}
              >
                {feedback.text}
              </p>
            )}

            <div className={css.buttons}>
              {buttons.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`${css.button} ${b.primary ? css.primary : ''}`}
                  data-testid={`scenario-${b.id}-button`}
                  disabled={b.disabled}
                  onClick={b.onClick}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ScenarioOverlay;
