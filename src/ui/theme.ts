import Phaser from 'phaser';

export const W = 720;
export const H = 1280;

export const COLORS = {
  bg: 0x12080f,
  wood: 0x4a2c1a,
  woodDark: 0x33200f,
  woodLight: 0x6b3f24,
  floor: 0x241318,
  accent: 0xe8a33d,
  accentDark: 0xb87a20,
  cream: 0xf2e6d0,
  danger: 0xd84343,
  ok: 0x5fbf67,
  panel: 0x1e1016,
  panelLight: 0x2e1a24,
  bubble: 0xf7f1e3,
};

export const FONT = 'Trebuchet MS, Arial, sans-serif';

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color = '#f2e6d0',
  style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    ...style,
  });
}

export interface Btn {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  onClick: () => void,
  color = COLORS.accent,
): Btn {
  const bg = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(3, 0x000000, 0.35);
  const label = txt(scene, 0, 0, text, Math.min(30, h * 0.42), '#241308', { fontStyle: 'bold' }).setOrigin(0.5);
  const container = scene.add.container(x, y, [bg, label]);
  container.setSize(w, h);
  let enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => {
    if (!enabled) return;
    scene.tweens.add({ targets: container, scale: 0.94, duration: 60, yoyo: true });
    onClick();
  });
  return {
    container,
    bg,
    label,
    setEnabled(on: boolean) {
      enabled = on;
      bg.setFillStyle(on ? color : 0x555555);
      label.setAlpha(on ? 1 : 0.55);
    },
  };
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color = COLORS.panel,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, color, 0.96).setStrokeStyle(2, COLORS.accent, 0.5);
}

export function formatMoney(n: number): string {
  return `${n.toLocaleString('ko-KR')}₩`;
}
