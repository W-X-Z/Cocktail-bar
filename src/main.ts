import Phaser from 'phaser';
import { BarScene } from './scenes/BarScene';
import { BootScene } from './scenes/BootScene';
import { MixScene } from './scenes/MixScene';
import { ShopScene } from './scenes/ShopScene';
import { COLORS, H, W } from './ui/theme';

new Phaser.Game({
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
  scene: [BootScene, BarScene, MixScene, ShopScene],
});
