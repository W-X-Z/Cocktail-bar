import Phaser from 'phaser';
import { BarScene } from './scenes/BarScene';
import { BootScene } from './scenes/BootScene';
import { MixScene } from './scenes/MixScene';
import { PortraitPreviewScene } from './scenes/PortraitPreviewScene';
import { ShopScene } from './scenes/ShopScene';
import { COLORS, H, W } from './ui/theme';

const debugPortraits = location.search.includes('portraits');

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
    : [BootScene, BarScene, MixScene, ShopScene],
});

// E2E 테스트/디버깅용 훅
declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}
window.__game = game;
