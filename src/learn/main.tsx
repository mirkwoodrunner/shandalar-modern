// src/learn/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LearnApp } from './LearnApp';
import './ui/learn.css';

createRoot(document.getElementById('learn-root')!).render(
  <React.StrictMode>
    <LearnApp />
  </React.StrictMode>,
);
