import Phaser from 'phaser';
import { BarScene } from './scenes/BarScene';
import { BootScene } from './scenes/BootScene';
import { MixScene } from './scenes/MixScene';
import { PinballScene } from './scenes/PinballScene';
import { PortraitPreviewScene } from './scenes/PortraitPreviewScene';
import { ShopScene } from './scenes/ShopScene';
import { COLORS, H, W } from './ui/theme';

const debugPortraits = location.search.includes('portraits');

// 폰트가 로드된 뒤 게임 시작 (실패해도 폴백 폰트로 진행)
try {
  await Promise.race([
    Promise.all([document.fonts.load('20px Galmuri11'), document.fonts.load('bold 20px Galmuri11')]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
} catch {
  /* ignore */
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 2,
  },
  scene: debugPortraits
    ? [PortraitPreviewScene]
    : [BootScene, BarScene, MixScene, ShopScene, PinballScene],
});

// E2E 테스트/디버깅용 훅
declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}
window.__game = game;
