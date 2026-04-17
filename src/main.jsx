// src/main.jsx
// Application entry point. Mounts React root.
// Per MECHANICS_INDEX.md §8.1

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in index.html');

createRoot(container).render(
<React.StrictMode>
<App />
</React.StrictMode>
);