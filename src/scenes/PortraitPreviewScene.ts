import Phaser from 'phaser';
import { personas } from '../systems/CustomerSystem';
import { portraitTexture } from '../ui/portraits';
import { COLORS, H, txt, W } from '../ui/theme';

/** 개발용: 전체 페르소나 초상화 프리뷰 (?portraits 로 진입) */
export class PortraitPreviewScene extends Phaser.Scene {
  constructor() {
    super('PortraitPreview');
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    txt(this, W / 2, 40, '초상화 프리뷰', 32, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0.5);

    const cols = 3;
    personas.forEach((p, i) => {
      const x = 130 + (i % cols) * 230;
      const y = 200 + Math.floor(i / cols) * 290;
      this.add
        .image(x, y, portraitTexture(this, `portrait_${p.id}`, p.look))
        .setScale(4.5);
      txt(this, x, y + 122, `${p.name} (${p.job})`, 20, '#f2e6d0').setOrigin(0.5);
    });
  }
}
