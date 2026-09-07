import Phaser from 'phaser';
import { moleTexture } from '../ui/art';
import { button, H, panel, txt, W } from '../ui/theme';

/**
 * 두더지 팡 미니게임 (Bar 씬 위 오버레이 — 뒤에서 영업은 계속 흐른다).
 * 3×3 구멍에서 올라오는 두더지를 탭. 황금 두더지는 3배 점수. 45초 라운드.
 */

const ROUND_SEC = 45;
const COLS = 3;
const ROWS = 3;
const HOLE_X0 = 170;
const HOLE_DX = 190;
const HOLE_Y0 = 420;
const HOLE_DY = 230;

interface Hole {
  x: number;
  y: number;
  mole: Phaser.GameObjects.Image;
  up: boolean;
  golden: boolean;
  hideAt: number;
}

export class WhackScene extends Phaser.Scene {
  private score = 0;
  private combo = 0;
  private timeLeft = ROUND_SEC;
  private gameOver = false;
  private holes: Hole[] = [];
  private nextPopAt = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private alertBanner: Phaser.GameObjects.Container | null = null;
  private overPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Whack');
  }

  create(): void {
    this.score = 0;
    this.combo = 0;
    this.timeLeft = ROUND_SEC;
    this.gameOver = false;
    this.holes = [];
    this.nextPopAt = 0;
    this.alertBanner = null;
    this.overPanel = null;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a1006, 0.9).setInteractive();
    panel(this, W / 2, 120, W - 60, 120);
    txt(this, 56, 92, '🔨 MOLE!', 36, '#5ad7ff', { fontStyle: 'bold' }).setShadow(0, 0, '#2a8ac0', 12);
    this.scoreText = txt(this, 56, 138, '', 26, '#ffd75a', { fontStyle: 'bold' });
    this.timeText = txt(this, W - 220, 138, '', 26, '#f2e6d0');
    button(this, W - 110, 100, 130, 64, '나가기', () => this.scene.stop(), 0x8a5a2e);

    // 잔디 보드
    const board = this.add.graphics();
    board.fillStyle(0x1e3a16, 1);
    board.fillRoundedRect(60, 300, W - 120, 800, 20);
    board.lineStyle(4, 0x3a6a2a, 1);
    board.strokeRoundedRect(60, 300, W - 120, 800, 20);
    for (let i = 0; i < 30; i++) {
      board.fillStyle(0x2a5220, 0.8);
      const gx = 80 + ((i * 137) % (W - 160));
      const gy = 320 + ((i * 211) % 750);
      board.fillRect(gx, gy, 3, 9);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const x = HOLE_X0 + col * HOLE_DX;
        const y = HOLE_Y0 + r * HOLE_DY;
        this.add.ellipse(x, y + 44, 128, 44, 0x120b04).setStrokeStyle(3, 0x000000, 0.5);
        const mole = this.add.image(x, y + 40, moleTexture(this)).setScale(0);
        mole.setInteractive({ useHandCursor: true });
        const hole: Hole = { x, y, mole, up: false, golden: false, hideAt: 0 };
        mole.on('pointerdown', () => this.hit(hole));
        this.holes.push(hole);
        // 구멍 앞 흙더미 (두더지가 구멍에서 나오는 느낌)
        this.add.ellipse(x, y + 58, 132, 34, 0x1a1108);
      }
    }

    this.time.addEvent({ delay: 600, loop: true, callback: () => this.checkCustomers() });
  }

  private hit(hole: Hole): void {
    if (!hole.up || this.gameOver) return;
    hole.up = false;
    this.combo += 1;
    const mult = Math.min(3, 1 + Math.floor(this.combo / 5));
    const gained = (hole.golden ? 300 : 100) * mult;
    this.score += gained;
    const t = txt(this, hole.x, hole.y - 40, `+${gained}`, 26, hole.golden ? '#ffd75a' : '#a8ffb0', { fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(5);
    this.tweens.add({ targets: t, y: hole.y - 110, alpha: 0, duration: 600, onComplete: () => t.destroy() });
    // 얻어맞는 연출
    this.tweens.killTweensOf(hole.mole);
    hole.mole.setAngle(0);
    this.tweens.add({ targets: hole.mole, angle: 14, scaleY: 0.6, duration: 70, yoyo: true });
    this.tweens.add({ targets: hole.mole, scale: 0, delay: 140, duration: 120 });
  }

  private popMole(now: number): void {
    const down = this.holes.filter((h) => !h.up);
    if (down.length === 0) return;
    const hole = down[Math.floor(Math.random() * down.length)]!;
    hole.up = true;
    hole.golden = Math.random() < 0.12;
    hole.hideAt = now + 900 - Math.min(400, this.score / 10); // 점수 오를수록 빨라짐
    hole.mole.setTexture(moleTexture(this, hole.golden));
    hole.mole.setScale(0).setAngle(0).setPosition(hole.x, hole.y + 52);
    this.tweens.killTweensOf(hole.mole);
    this.tweens.add({ targets: hole.mole, scale: 1, y: hole.y + 6, duration: 120, ease: 'Back.out' });
  }

  override update(time: number, deltaMs: number): void {
    if (this.gameOver) return;
    this.timeLeft -= deltaMs / 1000;
    if (this.timeLeft <= 0) {
      this.showGameOver();
      return;
    }

    if (time >= this.nextPopAt) {
      this.popMole(time);
      this.nextPopAt = time + 480 + Math.random() * 420 - Math.min(280, this.score / 15);
    }
    for (const h of this.holes) {
      if (h.up && time >= h.hideAt) {
        h.up = false;
        this.combo = 0; // 놓치면 콤보 초기화
        this.tweens.add({ targets: h.mole, scale: 0, y: h.y + 52, duration: 130 });
      }
    }

    const mult = Math.min(3, 1 + Math.floor(this.combo / 5));
    this.scoreText.setText(`SCORE ${this.score.toLocaleString()}${mult > 1 ? `  x${mult}` : ''}`);
    this.timeText.setText(`⏱ ${Math.ceil(this.timeLeft)}s`);
  }

  private checkCustomers(): void {
    const bar = this.scene.get('Bar') as unknown as { customers?: Array<{ state: string } | null> };
    const waiting = bar.customers?.some((c) => c && c.state === 'seated');
    if (waiting && !this.alertBanner) {
      const banner = this.add.container(0, 0).setDepth(10);
      const bg = this.add.rectangle(W / 2, 320, 520, 90, 0xd84343, 0.95).setStrokeStyle(3, 0xffffff, 0.6);
      banner.add(bg);
      banner.add(txt(this, W / 2 - 90, 320, '🔔 손님 도착!', 28, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      const go = button(this, W / 2 + 170, 320, 140, 60, '바로 가기', () => this.scene.stop(), 0xffd75a);
      banner.add(go.container);
      this.tweens.add({ targets: bg, alpha: 0.75, duration: 500, yoyo: true, repeat: -1 });
      this.alertBanner = banner;
    } else if (!waiting && this.alertBanner) {
      this.alertBanner.destroy();
      this.alertBanner = null;
    }
  }

  private showGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    for (const h of this.holes) {
      h.up = false;
      this.tweens.add({ targets: h.mole, scale: 0, duration: 120 });
    }
    const best = Math.max(this.score, (this.registry.get('whackBest') as number) ?? 0);
    this.registry.set('whackBest', best);

    const p = this.add.container(0, 0).setDepth(11);
    this.overPanel = p;
    p.add(panel(this, W / 2, 640, 480, 330));
    p.add(txt(this, W / 2, 540, 'TIME UP!', 44, '#5ad7ff', { fontStyle: 'bold' }).setOrigin(0.5));
    p.add(txt(this, W / 2, 610, `점수 ${this.score.toLocaleString()}`, 32, '#ffd75a', { fontStyle: 'bold' }).setOrigin(0.5));
    p.add(txt(this, W / 2, 655, `최고 ${best.toLocaleString()}`, 24, '#b09070').setOrigin(0.5));
    const retry = button(this, W / 2 - 105, 730, 180, 70, '다시하기', () => {
      this.overPanel?.destroy();
      this.score = 0;
      this.combo = 0;
      this.timeLeft = ROUND_SEC;
      this.gameOver = false;
    });
    p.add(retry.container);
    const exit = button(this, W / 2 + 105, 730, 180, 70, '나가기', () => this.scene.stop(), 0x8a5a2e);
    p.add(exit.container);
  }
}
