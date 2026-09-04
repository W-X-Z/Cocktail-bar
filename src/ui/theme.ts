import Phaser from 'phaser';
import { buttonTexture, panelTexture } from './art';

export const W = 720;
export const H = 1280;

export const COLORS = {
  bg: 0x12080f,
  wood: 0x59331d,
  woodDark: 0x33200f,
  woodLight: 0x7a4a28,
  accent: 0xe8a33d,
  accentDark: 0xb87a20,
  cream: 0xf2e6d0,
  danger: 0xd84343,
  ok: 0x5fbf67,
  panel: 0x1e1016,
  panelLight: 0x2e1a24,
  bubble: 0xf7f1e3,
  /** 네온 핑크 — 면 채우기 금지, 보더·텍스트·글로우 전용 (docs/05-ui-style.md) */
  neon: 0xff4f9a,
};

export const FONT = 'Galmuri11, sans-serif';

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color = '#f2e6d0',
  style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    ...style,
  });
  t.setShadow(0, 1, 'rgba(0,0,0,0.45)', 2);
  return t;
}

export interface Btn {
  container: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
  setToggled(on: boolean): void;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  onClick: (p: Phaser.Input.Pointer) => void,
  color = COLORS.accent,
): Btn {
  const image = scene.add.image(0, 0, buttonTexture(scene, w, h, hex(color)));
  const label = txt(scene, 0, -2, text, Math.min(28, h * 0.38), '#1c1008', { fontStyle: 'bold' }).setOrigin(0.5);
  label.setShadow(0, 0, 'rgba(0,0,0,0)', 0);
  const container = scene.add.container(x, y, [image, label]);
  container.setSize(w, h);
  let enabled = true;
  image.setInteractive({ useHandCursor: true });
  image.on('pointerdown', () => {
    if (!enabled) return;
    // 뎁스만큼 가라앉는 프레스 (코지 UI 관례)
    scene.tweens.add({ targets: container, y: y + 4, duration: 60, yoyo: true });
  });
  // 클릭은 "탭"일 때만 (드래그 스크롤이 버튼 위를 지나가도 오발동하지 않게)
  image.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!enabled || p.getDistance() >= 16) return;
    onClick(p);
  });
  return {
    container,
    image,
    label,
    setEnabled(on: boolean) {
      enabled = on;
      image.setTint(on ? 0xffffff : 0x666666);
      label.setAlpha(on ? 1 : 0.5);
    },
    setToggled(on: boolean) {
      image.setTint(on ? 0xffe0a0 : 0xffffff);
      container.setScale(on ? 1.04 : 1);
    },
  };
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, panelTexture(scene, w, h));
}

export function formatMoney(n: number): string {
  return `${n.toLocaleString('ko-KR')}₩`;
}
