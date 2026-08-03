import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { bottleTexture, glowTexture, vignetteTexture } from '../ui/art';
import { button, COLORS, H, txt, W } from '../ui/theme';

/** 타이틀 화면. 첫 유저 제스처를 확보하는 역할도 겸한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);

    // 뒷배경: 은은한 바 조명 + 진열 보틀 실루엣
    this.add
      .image(W / 2, H * 0.3, glowTexture(this))
      .setScale(4.2, 2.6)
      .setTint(0x8a3a5a)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    const deco = ['#c87830', '#d81830', '#48a848', '#e8f4f0', '#f0e8c8', '#8c2818', '#f8a828'];
    deco.forEach((c, i) => {
      const key = bottleTexture(this, `deco_bottle_${i}`, c, i % 3 !== 1);
      this.add
        .image(120 + i * 80, H * 0.19, key)
        .setScale(1.15)
        .setAlpha(0.5);
    });

    // 네온 사인 타이틀
    this.add
      .image(W / 2, H * 0.4, glowTexture(this))
      .setScale(3.2, 1.4)
      .setTint(0xff4f9e)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    txt(this, W / 2, H * 0.3, '🍸', 110).setOrigin(0.5);
    const title = txt(this, W / 2, H * 0.4, 'COCKTAIL BAR', 74, '#ffd7ea', {
      fontStyle: 'bold',
    }).setOrigin(0.5);
    title.setShadow(0, 0, '#ff4f9e', 18);
    this.tweens.add({
      targets: title,
      alpha: 0.78,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H));
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
