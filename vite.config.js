import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'tests/**/*.mjs', 'tests/scenarios/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    tags: [
      { name: 'engine', description: 'Duel engine: DuelCore, AI, MCTS, phases, combat, cardHandlers, cast-flow' },
      { name: 'overworld', description: 'Overworld/map/dungeon/sprite/structure specs and scenario tests' },
      { name: 'mobile', description: 'Any describe with a mobile viewport; desktop/mobile parity pairs' },
      { name: 'premodern', description: 'Premodern card pool structural integrity tests' },
    ],
  },
});
