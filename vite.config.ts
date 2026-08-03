import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 하위 경로(/Cocktail-bar/)와 Capacitor 로컬 파일 양쪽에서 동작하도록 상대 경로 빌드
  base: './',
});
