import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        learn: fileURLToPath(new URL('./learn.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', 'tests/**/*.mjs', 'tests/scenarios/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    tags: [
      { name: 'engine', description: 'Duel engine: DuelCore, AI, MCTS, phases, combat, cardHandlers, cast-flow' },
      { name: 'overworld', description: 'Overworld/map/dungeon/sprite/structure specs and scenario tests' },
      { name: 'mobile', description: 'Any describe with a mobile viewport; desktop/mobile parity pairs' },
      { name: 'premodern', description: 'Premodern card pool structural integrity tests' },
      { name: 'learn', description: 'Learn Mode: puzzle runner, exercise data, lesson player' },
    ],
  },
});
