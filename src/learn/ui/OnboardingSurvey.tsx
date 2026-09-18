// src/learn/ui/OnboardingSurvey.tsx
// Presentation only. Collects the three raw answers and hands them to
// onComplete; LearnApp/useLearnProgress computes startingTier and persists
// it. No rules logic. One responsive layout for mobile and desktop -- no
// @media queries, no viewport branching. See docs/LEARN_L1_SPEC.md section 5.

import React, { useState } from 'react';
import type { SurveyAnswers } from '../persistence';

type OnboardingSurveyProps = {
  onComplete: (answers: SurveyAnswers) => void;
};

const PLAYED_BEFORE_OPTIONS: { value: SurveyAnswers['playedBefore']; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'few', label: 'A few games' },
  { value: 'regularly', label: 'Regularly' },
];

export function OnboardingSurvey({ onComplete }: OnboardingSurveyProps) {
  const [playedBefore, setPlayedBefore] = useState<SurveyAnswers['playedBefore'] | null>(null);
  const [playedOrganized, setPlayedOrganized] = useState<boolean | null>(null);
  const [studyingJudge, setStudyingJudge] = useState<boolean | null>(null);

  const ready = playedBefore !== null && playedOrganized !== null && studyingJudge !== null;

  const submit = () => {
    if (playedBefore === null || playedOrganized === null || studyingJudge === null) return;
    onComplete({ playedBefore, playedOrganized, studyingJudge });
  };

  return (
    <div data-testid="onboarding-survey" className="learn-survey-overlay">
      <div className="learn-survey-panel">
        <h2>A few quick questions</h2>

        <div className="learn-survey-question">
          <p>Have you played Magic: The Gathering before?</p>
          <div className="learn-survey-options">
            {PLAYED_BEFORE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                data-testid={`survey-played-before-${opt.value}`}
                className={`learn-button learn-button-secondary${playedBefore === opt.value ? ' learn-survey-option-selected' : ''}`}
                onClick={() => setPlayedBefore(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="learn-survey-question">
          <p>Have you played in an organized event (store tournament, prerelease)?</p>
          <div className="learn-survey-options">
            <button
              type="button"
              data-testid="survey-organized-yes"
              className={`learn-button learn-button-secondary${playedOrganized === true ? ' learn-survey-option-selected' : ''}`}
              onClick={() => setPlayedOrganized(true)}
            >
              Yes
            </button>
            <button
              type="button"
              data-testid="survey-organized-no"
              className={`learn-button learn-button-secondary${playedOrganized === false ? ' learn-survey-option-selected' : ''}`}
              onClick={() => setPlayedOrganized(false)}
            >
              No
            </button>
          </div>
        </div>

        <div className="learn-survey-question">
          <p>Are you studying for a judge certification?</p>
          <div className="learn-survey-options">
            <button
              type="button"
              data-testid="survey-judge-yes"
              className={`learn-button learn-button-secondary${studyingJudge === true ? ' learn-survey-option-selected' : ''}`}
              onClick={() => setStudyingJudge(true)}
            >
              Yes
            </button>
            <button
              type="button"
              data-testid="survey-judge-no"
              className={`learn-button learn-button-secondary${studyingJudge === false ? ' learn-survey-option-selected' : ''}`}
              onClick={() => setStudyingJudge(false)}
            >
              No
            </button>
          </div>
        </div>

        <button
          type="button"
          data-testid="survey-submit"
          className="learn-button learn-button-primary"
          disabled={!ready}
          onClick={submit}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
