import Phaser from 'phaser';
import { GameState, SLOT_COUNT } from '../systems/GameState';
import { bottleTexture, glowTexture, vignetteTexture } from '../ui/art';
import { button, COLORS, formatMoney, H, panel, txt, W } from '../ui/theme';

/** 타이틀 + 세이브 슬롯 선택 화면 */
export class BootScene extends Phaser.Scene {
  private confirmingDelete: number | null = null;

  constructor() {
    super('Boot');
  }

  create(): void {
    this.confirmingDelete = null;
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);

    // 뒷배경: 은은한 바 조명 + 진열 보틀 실루엣
    this.add
      .image(W / 2, H * 0.22, glowTexture(this))
      .setScale(4.2, 2.2)
      .setTint(0x8a3a5a)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    const deco = ['#c87830', '#d81830', '#48a848', '#e8f4f0', '#f0e8c8', '#8c2818', '#f8a828'];
    deco.forEach((c, i) => {
      const key = bottleTexture(this, `deco_bottle_${i}`, c, i % 3 !== 1);
      this.add
        .image(120 + i * 80, H * 0.13, key)
        .setScale(1.05)
        .setAlpha(0.5);
    });

    // 네온 사인 타이틀
    this.add
      .image(W / 2, H * 0.28, glowTexture(this))
      .setScale(3.2, 1.2)
      .setTint(0xff4f9e)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    const title = txt(this, W / 2, H * 0.28, 'COCKTAIL BAR', 74, '#ffd7ea', {
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
    txt(this, W / 2, H * 0.35, '슬롯을 선택해 시작하세요', 26, '#b09070').setOrigin(0.5);

    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H));

    this.drawSlots();

    txt(
      this,
      W / 2,
      H * 0.93,
      '붓기는 기기를 기울여서, 셰이킹은 흔들어서!\n(데스크톱: 드래그로 대체)',
      22,
      '#9a8a7a',
      { align: 'center' },
    ).setOrigin(0.5);
  }

  private drawSlots(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const y = H * 0.46 + i * 180;
      const info = GameState.slotInfo(i);

      panel(this, W / 2, y, 600, 156);
      txt(this, W / 2 - 270, y - 52, `슬롯 ${i + 1}`, 24, '#e8a33d', { fontStyle: 'bold' });

      if (info) {
        txt(this, W / 2 - 270, y - 14, `Day ${info.day} · ${formatMoney(info.money)} · 메뉴 ${info.menuCount}종`, 26);
        const cont = button(this, W / 2 + 160, y, 220, 74, '이어하기 ▶', () => {
          GameState.startSlot(i);
          this.scene.start('Bar');
        });
        cont.container.setY(y + 20);

        const delBtn = button(
          this,
          W / 2 - 200,
          y + 34,
          150,
          52,
          '삭제',
          () => {
            if (this.confirmingDelete === i) {
              GameState.deleteSlot(i);
              this.scene.restart();
            } else {
              this.confirmingDelete = i;
              delBtn.label.setText('정말 삭제?');
            }
          },
          0x8a4a3a,
        );
      } else {
        txt(this, W / 2 - 270, y - 14, '빈 슬롯', 26, '#9a8a7a');
        button(
          this,
          W / 2 + 160,
          y + 20,
          220,
          74,
          '새 게임 시작',
          () => {
            GameState.startSlot(i);
            this.scene.start('Bar');
          },
          0x5fbf67,
        );
      }
    }
  }
}
