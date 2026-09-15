// src/learn/ui/FeedbackPanel.tsx
// Presentation only. Calls hook callbacks; no rules logic.

import React from 'react';

type Feedback = null | { result: 'success' | 'fail' | 'rejected'; text: string };

type FeedbackPanelProps = {
  feedback: Feedback;
  onContinue: () => void;
  onRetry: () => void;
};

export function FeedbackPanel({ feedback, onContinue, onRetry }: FeedbackPanelProps) {
  if (!feedback) return null;
  return (
    <div data-testid="feedback-panel" data-result={feedback.result} className={`learn-feedback-panel learn-feedback-${feedback.result}`}>
      <p data-testid="feedback-text" className="learn-feedback-text">{feedback.text}</p>
      {feedback.result === 'success' && (
        <button data-testid="continue-button" className="learn-button learn-button-primary" onClick={onContinue}>
          Continue
        </button>
      )}
      {feedback.result === 'fail' && (
        <button data-testid="retry-button" className="learn-button learn-button-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
