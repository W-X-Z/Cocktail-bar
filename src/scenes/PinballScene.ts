import Phaser from 'phaser';
import { button, H, panel, txt, W } from '../ui/theme';

/**
 * 손님 기다리는 동안 하는 핀볼 미니게임 (Bar 씬 위 오버레이 — 뒤에서 영업은 계속 흐른다).
 * 화면 왼쪽/오른쪽 절반을 눌러 플리퍼 조작. 수동 물리(중력·반사·캡슐 충돌).
 */

const BOARD_L = 70;
const BOARD_R = 650;
const BOARD_T = 210;
const DRAIN_Y = 1120;
const GRAVITY = 1500;
const BALL_R = 14;

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Bumper {
  x: number;
  y: number;
  r: number;
  color: number;
  /** 반발 임펄스 (기본 480) */
  kick?: number;
  /** 기본 점수 (기본 100) */
  score?: number;
  obj?: Phaser.GameObjects.Arc;
}

export class PinballScene extends Phaser.Scene {
  private ballX = 0;
  private ballY = 0;
  private vx = 0;
  private vy = 0;
  private ballsLeft = 3;
  private score = 0;
  private ballLive = false;
  private gameOver = false;

  private leftPressed = false;
  private rightPressed = false;
  private leftAngle = 0.5; // 현재 각도 (rad, 아래로 처짐 +)
  private rightAngle = 0.5;

  private ball!: Phaser.GameObjects.Arc;
  private flipperG!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private ballsText!: Phaser.GameObjects.Text;
  private alertBanner: Phaser.GameObjects.Container | null = null;
  private overPanel: Phaser.GameObjects.Container | null = null;

  private comboCount = 0;
  private lastBumperHitAt = 0;
  private trail: Array<{ x: number; y: number }> = [];
  private trailG!: Phaser.GameObjects.Graphics;

  private bumpers: Bumper[] = [
    { x: 230, y: 430, r: 30, color: 0xffd75a },
    { x: 470, y: 430, r: 30, color: 0x5ad7ff },
    { x: 350, y: 610, r: 34, color: 0xff5a8a },
    // 슬링샷 (플리퍼 위 킥커 — 세게 튕기고 점수는 작다)
    { x: 165, y: 815, r: 20, color: 0xa8ff5a, kick: 650, score: 50 },
    { x: 555, y: 815, r: 20, color: 0xa8ff5a, kick: 650, score: 50 },
  ];

  // 하단 경사 가이드 (공을 플리퍼로 유도)
  private guides: Seg[] = [
    { x1: BOARD_L, y1: 900, x2: 240, y2: 1030 },
    { x1: BOARD_R, y1: 900, x2: 480, y2: 1030 },
  ];

  private readonly flipperLen = 105;
  private readonly pivotL = { x: 240, y: 1040 };
  private readonly pivotR = { x: 480, y: 1040 };

  constructor() {
    super('Pinball');
  }

  create(): void {
    this.ballsLeft = 3;
    this.score = 0;
    this.gameOver = false;
    this.alertBanner = null;
    this.overPanel = null;

    // 배경 (뒤의 바가 살짝 비침)
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0510, 0.88).setInteractive();
    panel(this, W / 2, 120, W - 60, 120);
    txt(this, 56, 92, '🕹 PINBALL', 36, '#ff9ec6', { fontStyle: 'bold' }).setShadow(0, 0, '#ff4f9e', 12);
    this.scoreText = txt(this, 56, 138, '', 26, '#ffd75a', { fontStyle: 'bold' });
    this.ballsText = txt(this, W - 200, 138, '', 26, '#f2e6d0');
    button(this, W - 110, 100, 130, 64, '나가기', () => this.scene.stop(), 0x8a5a2e);

    // 보드
    const board = this.add.graphics();
    board.fillStyle(0x1c1026, 1);
    board.fillRoundedRect(BOARD_L - 16, BOARD_T - 16, BOARD_R - BOARD_L + 32, DRAIN_Y - BOARD_T + 60, 18);
    board.lineStyle(4, 0x6a3a7e, 1);
    board.strokeRoundedRect(BOARD_L - 16, BOARD_T - 16, BOARD_R - BOARD_L + 32, DRAIN_Y - BOARD_T + 60, 18);
    // 가이드 레일
    board.lineStyle(6, 0x8a5aae, 1);
    for (const g of this.guides) board.lineBetween(g.x1, g.y1, g.x2, g.y2);
    // 별 장식
    for (let i = 0; i < 14; i++) {
      const sx = BOARD_L + ((i * 97) % (BOARD_R - BOARD_L));
      const sy = BOARD_T + ((i * 173) % 500);
      board.fillStyle(0xffffff, 0.12 + (i % 3) * 0.05);
      board.fillCircle(sx, sy, 2);
    }

    // 범퍼
    for (const b of this.bumpers) {
      this.add.circle(b.x, b.y, b.r + 6, b.color, 0.18);
      b.obj = this.add.circle(b.x, b.y, b.r, b.color, 0.9).setStrokeStyle(4, 0xffffff, 0.5);
    }

    this.comboCount = 0;
    this.lastBumperHitAt = 0;
    this.trail = [];
    this.trailG = this.add.graphics();
    this.flipperG = this.add.graphics();
    this.ball = this.add.circle(0, 0, BALL_R, 0xe8eef4).setStrokeStyle(2, 0x8a98a4);


    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 260) return;
      if (p.x < W / 2) this.leftPressed = true;
      else this.rightPressed = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.x < W / 2) this.leftPressed = false;
      else this.rightPressed = false;
    });

    this.launchBall();

    // 손님 대기 알림 체크
    this.time.addEvent({ delay: 600, loop: true, callback: () => this.checkCustomers() });
  }

  private launchBall(): void {
    this.ballX = BOARD_L + 60 + Math.random() * (BOARD_R - BOARD_L - 120);
    this.ballY = BOARD_T + 60;
    this.vx = (Math.random() - 0.5) * 300;
    this.vy = 120;
    this.ballLive = true;
    this.ball.setVisible(true);
  }

  private checkCustomers(): void {
    const bar = this.scene.get('Bar') as unknown as { customers?: Array<{ state: string } | null> };
    const waiting = bar.customers?.some((c) => c && c.state === 'seated');
    if (waiting && !this.alertBanner) {
      const banner = this.add.container(0, 0).setDepth(10);
      const bg = this.add
        .rectangle(W / 2, 320, 520, 90, 0xd84343, 0.95)
        .setStrokeStyle(3, 0xffffff, 0.6);
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

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.033);

    // 플리퍼 각도 (누르면 위로 스윙)
    const targetL = this.leftPressed ? -0.45 : 0.5;
    const targetR = this.rightPressed ? -0.45 : 0.5;
    const prevL = this.leftAngle;
    const prevR = this.rightAngle;
    this.leftAngle += (targetL - this.leftAngle) * Math.min(1, dt * 22);
    this.rightAngle += (targetR - this.rightAngle) * Math.min(1, dt * 22);
    const lSwing = prevL - this.leftAngle > 0.01;
    const rSwing = prevR - this.rightAngle > 0.01;

    this.drawFlippers();

    if (this.ballLive && !this.gameOver) {
      // 서브스텝 물리
      for (let step = 0; step < 2; step++) {
        const h = dt / 2;
        this.vy += GRAVITY * h;
        this.ballX += this.vx * h;
        this.ballY += this.vy * h;

        // 벽
        if (this.ballX < BOARD_L + BALL_R) {
          this.ballX = BOARD_L + BALL_R;
          this.vx = Math.abs(this.vx) * 0.85;
        }
        if (this.ballX > BOARD_R - BALL_R) {
          this.ballX = BOARD_R - BALL_R;
          this.vx = -Math.abs(this.vx) * 0.85;
        }
        if (this.ballY < BOARD_T + BALL_R) {
          this.ballY = BOARD_T + BALL_R;
          this.vy = Math.abs(this.vy) * 0.85;
        }

        // 범퍼
        for (const b of this.bumpers) {
          const dx = this.ballX - b.x;
          const dy = this.ballY - b.y;
          const d = Math.hypot(dx, dy);
          if (d < b.r + BALL_R && d > 0.01) {
            const nx = dx / d;
            const ny = dy / d;
            this.ballX = b.x + nx * (b.r + BALL_R + 1);
            this.ballY = b.y + ny * (b.r + BALL_R + 1);
            const dot = this.vx * nx + this.vy * ny;
            const kick = b.kick ?? 480;
            this.vx = (this.vx - 2 * dot * nx) * 0.6 + nx * kick;
            this.vy = (this.vy - 2 * dot * ny) * 0.6 + ny * kick;

            // 콤보: 1.4초 안에 연속 히트 시 배율 증가 (최대 x4)
            const now = this.time.now;
            this.comboCount = now - this.lastBumperHitAt < 1400 ? this.comboCount + 1 : 1;
            this.lastBumperHitAt = now;
            const mult = Math.min(4, 1 + Math.floor(this.comboCount / 3));
            const gained = (b.score ?? 100) * mult;
            this.score += gained;
            this.popScore(b.x, b.y - b.r - 14, gained, mult);

            if (b.obj) {
              this.tweens.killTweensOf(b.obj);
              b.obj.setScale(1.25);
              this.tweens.add({ targets: b.obj, scale: 1, duration: 160 });
              // 히트 링 이펙트
              const ring = this.add.circle(b.x, b.y, b.r, b.color, 0).setStrokeStyle(4, 0xffffff, 0.8);
              this.tweens.add({
                targets: ring,
                scale: 1.9,
                alpha: 0,
                duration: 260,
                onComplete: () => ring.destroy(),
              });
            }
          }
        }

        // 가이드 + 플리퍼 (캡슐 충돌)
        for (const g of this.guides) this.collideSeg(g, false, false);
        this.collideSeg(this.flipperSeg('L'), true, lSwing);
        this.collideSeg(this.flipperSeg('R'), true, rSwing);

        // 속도 제한
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 1500) {
          this.vx *= 1500 / sp;
          this.vy *= 1500 / sp;
        }
      }

      // 드레인
      if (this.ballY > DRAIN_Y + 40) {
        this.ballLive = false;
        this.ball.setVisible(false);
        this.ballsLeft -= 1;
        if (this.ballsLeft > 0) {
          this.time.delayedCall(700, () => this.launchBall());
        } else {
          this.showGameOver();
        }
      }

      this.ball.setPosition(this.ballX, this.ballY);

      // 볼 트레일
      this.trail.push({ x: this.ballX, y: this.ballY });
      if (this.trail.length > 9) this.trail.shift();
      this.trailG.clear();
      this.trail.forEach((t, i) => {
        this.trailG.fillStyle(0xaad4ff, 0.05 + (i / this.trail.length) * 0.22);
        this.trailG.fillCircle(t.x, t.y, BALL_R * (0.35 + (i / this.trail.length) * 0.55));
      });
    } else {
      this.trailG.clear();
      this.trail = [];
    }

    const mult = Math.min(4, 1 + Math.floor(this.comboCount / 3));
    const comboLabel = mult > 1 && this.time.now - this.lastBumperHitAt < 1400 ? `  x${mult}` : '';
    this.scoreText.setText(`SCORE ${this.score.toLocaleString()}${comboLabel}`);
    this.ballsText.setText(`● ${Math.max(0, this.ballsLeft)}`);
  }

  /** 범퍼 위 점수 팝업 */
  private popScore(x: number, y: number, gained: number, mult: number): void {
    const t = txt(this, x, y, mult > 1 ? `+${gained} x${mult}` : `+${gained}`, 24, mult > 1 ? '#ffd75a' : '#ffffff', {
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 550, onComplete: () => t.destroy() });
  }

  private flipperSeg(side: 'L' | 'R'): Seg {
    if (side === 'L') {
      const a = this.leftAngle;
      return {
        x1: this.pivotL.x,
        y1: this.pivotL.y,
        x2: this.pivotL.x + Math.cos(a) * this.flipperLen,
        y2: this.pivotL.y + Math.sin(a) * this.flipperLen,
      };
    }
    const a = this.rightAngle;
    return {
      x1: this.pivotR.x,
      y1: this.pivotR.y,
      x2: this.pivotR.x - Math.cos(a) * this.flipperLen,
      y2: this.pivotR.y + Math.sin(a) * this.flipperLen,
    };
  }

  private collideSeg(s: Seg, isFlipper: boolean, swinging: boolean): void {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((this.ballX - s.x1) * dx + (this.ballY - s.y1) * dy) / len2));
    const cx = s.x1 + dx * t;
    const cy = s.y1 + dy * t;
    const ddx = this.ballX - cx;
    const ddy = this.ballY - cy;
    const d = Math.hypot(ddx, ddy);
    const pad = isFlipper ? 11 : 5;
    if (d < BALL_R + pad && d > 0.01) {
      const nx = ddx / d;
      const ny = ddy / d;
      this.ballX = cx + nx * (BALL_R + pad + 0.5);
      this.ballY = cy + ny * (BALL_R + pad + 0.5);
      const dot = this.vx * nx + this.vy * ny;
      if (dot < 0) {
        this.vx -= 2 * dot * nx * 0.85;
        this.vy -= 2 * dot * ny * 0.85;
      }
      if (isFlipper && swinging) {
        this.vx += nx * 350;
        this.vy -= 750; // 플리퍼 스윙 임펄스
      }
    }
  }

  private drawFlippers(): void {
    this.flipperG.clear();
    const draw = (s: Seg, pressed: boolean) => {
      this.flipperG.lineStyle(22, pressed ? 0xffd75a : 0xe8a33d, 1);
      this.flipperG.lineBetween(s.x1, s.y1, s.x2, s.y2);
      this.flipperG.fillStyle(0xb87a20, 1);
      this.flipperG.fillCircle(s.x1, s.y1, 14);
    };
    draw(this.flipperSeg('L'), this.leftPressed);
    draw(this.flipperSeg('R'), this.rightPressed);
  }

  private showGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    const best = Math.max(this.score, (this.registry.get('pinballBest') as number) ?? 0);
    this.registry.set('pinballBest', best);

    const p = this.add.container(0, 0).setDepth(11);
    this.overPanel = p;
    p.add(panel(this, W / 2, 640, 480, 330));
    p.add(txt(this, W / 2, 540, 'GAME OVER', 44, '#ff9ec6', { fontStyle: 'bold' }).setOrigin(0.5));
    p.add(txt(this, W / 2, 610, `점수 ${this.score.toLocaleString()}`, 32, '#ffd75a', { fontStyle: 'bold' }).setOrigin(0.5));
    p.add(txt(this, W / 2, 655, `최고 ${best.toLocaleString()}`, 24, '#b09070').setOrigin(0.5));
    const retry = button(this, W / 2 - 105, 730, 180, 70, '다시하기', () => {
      this.overPanel?.destroy();
      this.ballsLeft = 3;
      this.score = 0;
      this.gameOver = false;
      this.launchBall();
    });
    p.add(retry.container);
    const exit = button(this, W / 2 + 105, 730, 180, 70, '나가기', () => this.scene.stop(), 0x8a5a2e);
    p.add(exit.container);
  }
}
