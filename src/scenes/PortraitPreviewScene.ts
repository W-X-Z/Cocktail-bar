import Phaser from 'phaser';
import { personas } from '../systems/CustomerSystem';
import { portraitTexture, seatedTexture } from '../ui/portraits';
import { COLORS, H, txt, W } from '../ui/theme';

/** 개발용: 전체 페르소나 초상화 프리뷰 (?portraits 로 진입, 탭하면 바스트↔웨이스트 전환) */
export class PortraitPreviewScene extends Phaser.Scene {
  private seated = true;

  constructor() {
    super('PortraitPreview');
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    txt(
      this,
      W / 2,
      36,
      this.seated ? '웨이스트샷 (좌석용) — 탭하여 전환' : '바스트샷 (대화 카드용) — 탭하여 전환',
      28,
      '#e8a33d',
      { fontStyle: 'bold' },
    ).setOrigin(0.5);

    const cols = 4;
    personas.forEach((p, i) => {
      const x = 100 + (i % cols) * 175;
      const y = 190 + Math.floor(i / cols) * 330;
      const key = this.seated
        ? seatedTexture(this, `seated_${p.id}`, p.look)
        : portraitTexture(this, `portrait_${p.id}`, p.look);
      this.add.image(x, y, key).setScale(this.seated ? 3 : 4);
      txt(this, x, y + (this.seated ? 130 : 110), `${p.name}`, 19, '#f2e6d0').setOrigin(0.5);
    });

    this.input.on('pointerdown', () => {
      this.seated = !this.seated;
      this.scene.restart();
    });
  }
}
