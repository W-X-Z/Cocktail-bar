import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { button, COLORS, H, txt, W } from '../ui/theme';

/** 타이틀 화면. 첫 유저 제스처를 확보하는 역할도 겸한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);

    // 네온 사인 느낌의 타이틀
    txt(this, W / 2, H * 0.28, '🍸', 120).setOrigin(0.5);
    const title = txt(this, W / 2, H * 0.4, 'COCKTAIL BAR', 72, '#e8a33d', {
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: title,
      alpha: 0.75,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    txt(this, W / 2, H * 0.47, '나만의 바를 운영하며 진짜 레시피로 조주하세요', 26, '#f2e6d0').setOrigin(0.5);

    button(this, W / 2, H * 0.62, 380, 90, '영업 시작', () => {
      this.scene.start('Bar');
    });

    button(
      this,
      W / 2,
      H * 0.72,
      380,
      70,
      '새 게임 (저장 초기화)',
      () => {
        GameState.reset();
        this.scene.start('Bar');
      },
      0x7a5a3a,
    );

    txt(
      this,
      W / 2,
      H * 0.9,
      '셰이킹은 휴대폰을 실제로 흔들어요!\n(데스크톱에서는 화면을 빠르게 문질러 대체)',
      22,
      '#9a8a7a',
      { align: 'center' },
    ).setOrigin(0.5);
  }
}
