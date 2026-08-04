import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { createOrder } from '../systems/OrderSystem';
import type { Order, ScoreLine } from '../systems/types';
import {
  bottleTexture,
  counterTexture,
  glowTexture,
  personFrontTexture,
  vignetteTexture,
} from '../ui/art';
import { button, COLORS, formatMoney, H, panel, txt, W } from '../ui/theme';

const DAY_LENGTH_SEC = 150; // 실시간 150초 = 영업시간 20:00 → 02:00
const PATIENCE_SEC = 75;

interface Customer {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  patienceBar: Phaser.GameObjects.Rectangle;
  order: Order;
  patience: number; // 0~1
  seatIndex: number;
  state: 'walking' | 'seated' | 'mixing' | 'reacting' | 'leaving';
}

export interface MixResultPayload {
  seatIndex: number;
  totalPaid: number;
  tip: number;
  scoreTotal: number;
  recipeName?: string;
  worstLines?: ScoreLine[];
  cancelled?: boolean;
}

/** 바텐더 POV 운영 씬 — 카운터 너머로 손님을 마주 본다 */
export class BarScene extends Phaser.Scene {
  private customers: (Customer | null)[] = [null, null, null, null];
  private clockSec = 0;
  private dayOver = false;
  private spawnTimer = 0;
  private nextSpawnIn = 2;

  private moneyText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container | null = null;

  private seatX(i: number): number {
    return 120 + i * 165;
  }
  /** 손님 얼굴 기준 y (카운터 뒤) */
  private readonly seatY = 640;

  constructor() {
    super('Bar');
  }

  create(): void {
    this.customers = [null, null, null, null];
    this.clockSec = 0;
    this.dayOver = false;
    this.spawnTimer = 0;
    this.nextSpawnIn = 2;
    this.toast = null;

    this.drawRoom();
    this.drawHud();

    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setDepth(45);

    this.events.on(
      Phaser.Scenes.Events.WAKE,
      (_sys: Phaser.Scenes.Systems, data?: MixResultPayload) => {
        if (data && typeof data.seatIndex === 'number') this.onMixDone(data);
      },
    );
  }

  private drawRoom(): void {
    // 홀 배경 (손님 쪽 공간)
    const wallG = this.add.graphics();
    wallG.fillGradientStyle(0x241318, 0x241318, 0x160a10, 0x160a10, 1);
    wallG.fillRect(0, 140, W, 660);
    // 벽 패널
    for (let x = 40; x < W; x += 160) {
      this.add.rectangle(x + 60, 400, 120, 380, 0x2e1a20).setStrokeStyle(2, 0x000000, 0.3);
    }
    // 입구 (왼쪽)
    this.add.rectangle(60, 470, 110, 330, 0x0e0703).setStrokeStyle(3, COLORS.accent, 0.4);
    txt(this, 60, 330, '입구', 20, '#b09070').setOrigin(0.5);
    // 홀 조명
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(this.seatX(i) + 90, 320, 4, 60, 0x0a0506);
      this.add.circle(this.seatX(i) + 90, 360, 16, 0xffc878, 0.9).setStrokeStyle(2, 0x8a5a20);
      this.add
        .image(this.seatX(i) + 90, 430, glowTexture(this))
        .setScale(1.6, 1.2)
        .setTint(0xffc878)
        .setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD);
    }

    // 머리 위 보틀 선반 (POV: 우리 머리 위 행잉 셰프)
    this.add.image(W / 2, 64, counterTexture(this, 'wall_wood', W, 128, '#3a2113')).setDisplaySize(W, 128);
    this.add.rectangle(W / 2, 128, W, 12, 0x1a0d06);
    this.add.rectangle(W / 2, 96, W - 80, 12, 0x241206).setStrokeStyle(2, 0x000000, 0.4);
    const shelfColors = ['#c87830', '#d81830', '#48a848', '#e8f4f0', '#3c2010', '#f0e8c8', '#8c2818', '#f8a828', '#5a7a9a', '#c8e878'];
    shelfColors.forEach((c, i) => {
      const key = bottleTexture(this, `deco_bottle_${i}`, c, i % 3 !== 1);
      this.add.image(75 + i * 64, 92, key).setScale(0.6).setOrigin(0.5, 1);
    });
    this.add
      .image(W / 2, 60, glowTexture(this))
      .setScale(3.4, 0.9)
      .setTint(0xffb85a)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD);

    // 네온 사인
    const neon = txt(this, W / 2, 160, '~ COCKTAIL BAR ~', 26, '#ff9ec6', { fontStyle: 'bold' }).setOrigin(0.5);
    neon.setShadow(0, 0, '#ff4f9e', 14);
    this.tweens.add({ targets: neon, alpha: 0.72, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 바 카운터 (전경 — 내 앞의 작업대)
    const counter = this.add.image(W / 2, 940, counterTexture(this, 'bar_counter', W, 300));
    counter.setDepth(20);
    this.add.rectangle(W / 2, 786, W, 20, COLORS.woodLight).setDepth(20).setStrokeStyle(2, 0x000000, 0.35);
    this.add
      .image(W / 2, 830, glowTexture(this))
      .setScale(3.6, 0.7)
      .setTint(0xffcf8a)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(21);
    // 좌석별 코스터
    for (let i = 0; i < 4; i++) {
      this.add.ellipse(this.seatX(i) + 90, 828, 84, 26, 0x33200f).setDepth(21).setStrokeStyle(2, 0x000000, 0.3);
    }
  }

  private drawHud(): void {
    panel(this, W / 2, 205, W - 40, 74).setDepth(46);
    this.dayText = txt(this, 56, 205, '', 28, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(46);
    this.clockText = txt(this, W / 2, 205, '', 32, '#f2e6d0', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(46);
    this.moneyText = txt(this, W - 56, 205, '', 28, '#7fdc8a', { fontStyle: 'bold' }).setOrigin(1, 0.5).setDepth(46);
    this.hintText = txt(this, W / 2, 262, '', 23, '#ff8a8a').setOrigin(0.5).setDepth(46);

    button(this, W - 130, 1186, 208, 78, '영업 종료', () => this.endDay(), 0x8a5a2e).container.setDepth(46);
    txt(this, 40, 1152, '손님을 탭하면 주문을 받습니다', 22, '#b09070').setDepth(46);
    txt(this, 40, 1188, `메뉴 ${GameState.menu.length}종 영업 중`, 22, '#b09070').setDepth(46);
  }

  private clockLabel(): string {
    const gameMin = (this.clockSec / DAY_LENGTH_SEC) * 360; // 6시간 = 360분
    const total = 20 * 60 + gameMin;
    const hh = Math.floor(total / 60) % 24;
    const mm = Math.floor(total % 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  override update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (!this.dayOver) {
      this.clockSec += dt;
      if (this.clockSec >= DAY_LENGTH_SEC) {
        this.endDay();
        return;
      }
      this.trySpawn(dt);
    }
    this.updateCustomers(dt);

    this.dayText.setText(`Day ${GameState.day}`);
    this.clockText.setText(this.clockLabel());
    this.moneyText.setText(formatMoney(GameState.money));
  }

  private trySpawn(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer < this.nextSpawnIn) return;

    const free = this.customers.findIndex((c) => c === null);
    if (free === -1) return;

    const order = createOrder();
    if (!order) {
      this.hintText.setText('재고 부족으로 손님을 받을 수 없어요 — 영업 종료 후 발주하세요!');
      this.spawnTimer = 0;
      this.nextSpawnIn = 5;
      return;
    }
    this.hintText.setText('');
    this.spawnTimer = 0;
    this.nextSpawnIn = 10 + Math.random() * 10;
    this.spawnCustomer(free, order);
  }

  private spawnCustomer(seatIndex: number, order: Order): void {
    const bodies = ['#4a6a8a', '#8a4a6a', '#6a8a4a', '#8a6a3a', '#5a4a8a', '#8a3a3a'];
    const hairs = ['#2a1a10', '#4a3a2a', '#141414', '#6a4a1a', '#8a8a8a'];
    const skins = ['#e8b890', '#d8a878', '#c89060', '#f0c8a0'];
    const bi = Math.floor(Math.random() * bodies.length);
    const hi = Math.floor(Math.random() * hairs.length);
    const si = Math.floor(Math.random() * skins.length);

    const c = this.add.container(-70, this.seatY);
    const sprite = this.add.image(
      0,
      0,
      personFrontTexture(this, `front_${bi}_${hi}_${si}`, bodies[bi]!, hairs[hi]!, skins[si]!),
    );
    c.add(sprite);
    c.setDepth(10);
    // 걸어오는 동안 위아래로 씰룩
    this.tweens.add({ targets: sprite, y: -6, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 말풍선
    const desired = GameState.recipe(order.desiredId);
    const ordered = GameState.recipe(order.orderedId);
    const label = order.tipEligible
      ? `${ordered.nameKo} 주세요!`
      : `${desired.nameKo}는 없나요…\n그럼 ${ordered.nameKo}로.`;

    const bubbleText = txt(this, 0, -10, label, 22, '#241308', { align: 'center' }).setOrigin(0.5);
    bubbleText.setShadow(0, 0, 'rgba(0,0,0,0)', 0);
    const bw = Math.max(bubbleText.width + 34, 150);
    const bh = bubbleText.height + 44;
    const bubbleG = this.add.graphics();
    bubbleG.fillStyle(COLORS.bubble, 0.98);
    bubbleG.lineStyle(2.5, 0x8a6a4a, 0.6);
    bubbleG.fillRoundedRect(-bw / 2, -bh / 2 - 4, bw, bh, 14);
    bubbleG.strokeRoundedRect(-bw / 2, -bh / 2 - 4, bw, bh, 14);
    bubbleG.fillTriangle(-14, bh / 2 - 6, 14, bh / 2 - 6, -6, bh / 2 + 14);
    const patienceBg = this.add.rectangle(0, bh / 2 - 16, bw - 24, 8, 0x000000, 0.22);
    const patienceBar = this.add
      .rectangle(-(bw - 24) / 2, bh / 2 - 16, bw - 24, 8, COLORS.ok)
      .setOrigin(0, 0.5);
    const bubble = this.add.container(0, 0, [bubbleG, bubbleText, patienceBg, patienceBar]);
    bubble.setVisible(false);
    c.add(bubble);
    bubble.setPosition(30, -120);

    const customer: Customer = {
      container: c,
      sprite,
      bubble,
      bubbleText,
      patienceBar,
      order,
      patience: 1,
      seatIndex,
      state: 'walking',
    };
    this.customers[seatIndex] = customer;

    const sx = this.seatX(seatIndex) + 90;
    this.tweens.add({
      targets: c,
      x: sx,
      duration: 1400,
      ease: 'Sine.inOut',
      onComplete: () => {
        if (customer.state === 'walking') customer.state = 'seated';
        this.tweens.killTweensOf(sprite);
        sprite.setY(0);
        bubble.setVisible(true);
        bubble.setScale(0);
        this.tweens.add({ targets: bubble, scale: 1, duration: 260, ease: 'Back.out' });
        const worldX = sx + 30 + bw / 2;
        if (worldX > W - 10) bubble.x = 30 - (worldX - (W - 10));
      },
    });

    c.setInteractive(
      new Phaser.Geom.Rectangle(-55, -70, 110, 140),
      Phaser.Geom.Rectangle.Contains,
    );
    c.on('pointerdown', () => this.acceptOrder(customer));
  }

  private acceptOrder(customer: Customer): void {
    if (customer.state !== 'seated') return;
    if (this.customers.some((c) => c?.state === 'mixing')) return; // 한 번에 한 잔
    customer.state = 'mixing';
    customer.bubbleText.setText(`(조주 중…)\n${GameState.recipe(customer.order.orderedId).nameKo}`);
    this.scene.sleep();
    this.scene.run('Mix', {
      recipeId: customer.order.orderedId,
      tipEligible: customer.order.tipEligible,
      patience: customer.patience,
      seatIndex: customer.seatIndex,
    });
  }

  /** 조주 완료 → 손님 반응을 메인 씬에서 연출 */
  private onMixDone(data: MixResultPayload): void {
    const customer = this.customers[data.seatIndex];
    if (!customer) return;
    if (data.cancelled) {
      customer.state = 'seated';
      customer.bubbleText.setText(`${GameState.recipe(customer.order.orderedId).nameKo} 기다리는 중…`);
      return;
    }

    customer.state = 'reacting';
    const s = data.scoreTotal;
    const face = s >= 0.85 ? '😍' : s >= 0.6 ? '🙂' : s >= 0.35 ? '😐' : '🤢';
    const comment =
      s >= 0.85 ? '완벽해요!' : s >= 0.6 ? '맛있네요~' : s >= 0.35 ? '음… 그럭저럭.' : '이게 뭐죠…?';
    customer.bubbleText.setText(`${face} ${comment}`);
    customer.patienceBar.setVisible(false);

    // 반응 애니메이션: 좋으면 신나서 들썩, 나쁘면 부르르
    if (s >= 0.6) {
      this.tweens.add({ targets: customer.sprite, y: -14, duration: 160, yoyo: true, repeat: 3, ease: 'Sine.inOut' });
    } else {
      customer.sprite.setTint(s < 0.35 ? 0xff9090 : 0xffffff);
      this.tweens.add({ targets: customer.sprite, x: 6, duration: 60, yoyo: true, repeat: 5 });
    }

    if (data.totalPaid > 0) {
      this.floatText(customer.container.x, this.seatY - 160, `+${formatMoney(data.totalPaid - data.tip)}`);
      if (data.tip > 0) {
        this.time.delayedCall(400, () =>
          this.floatText(customer.container.x, this.seatY - 160, `팁 +${formatMoney(data.tip)}`, '#ffd27a'),
        );
      }
    }

    this.showToast(data);

    this.time.delayedCall(2000, () => this.removeCustomer(customer, false));
  }

  /** 채점 요약 토스트 (탭하면 닫힘) */
  private showToast(data: MixResultPayload): void {
    this.toast?.destroy();
    const lines = data.worstLines ?? [];
    const h = 96 + lines.length * 34;
    const toast = this.add.container(0, 0).setDepth(47);
    const bg = panel(this, W / 2, 330 + h / 2 - 40, 620, h);
    toast.add(bg);
    toast.add(
      txt(this, W / 2, 320, `${data.recipeName} — ${Math.round(data.scoreTotal * 100)}점`, 28, '#e8a33d', {
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    lines.forEach((line, i) => {
      const color = line.ratio >= 0.9 ? '#7fdc8a' : line.ratio >= 0.5 ? '#ffd27a' : '#ff8a8a';
      toast.add(txt(this, W / 2, 356 + i * 34, `${line.label}: ${line.detail}`, 21, color).setOrigin(0.5));
    });
    bg.setInteractive();
    bg.on('pointerdown', () => {
      toast.destroy();
      if (this.toast === toast) this.toast = null;
    });
    this.toast = toast;
    this.time.delayedCall(4500, () => {
      if (this.toast === toast) {
        toast.destroy();
        this.toast = null;
      }
    });
  }

  private floatText(x: number, y: number, message: string, color = '#7fdc8a'): void {
    const t = txt(this, x, y, message, 30, color, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(48);
    this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 2200, onComplete: () => t.destroy() });
  }

  private updateCustomers(dt: number): void {
    for (const customer of this.customers) {
      if (!customer || customer.state !== 'seated') continue;
      customer.patience -= dt / PATIENCE_SEC;
      customer.patienceBar.setScale(Math.max(0.001, customer.patience), 1);
      customer.patienceBar.setFillStyle(
        customer.patience > 0.5 ? COLORS.ok : customer.patience > 0.25 ? COLORS.accent : COLORS.danger,
      );
      if (customer.patience <= 0) {
        this.floatText(customer.container.x, this.seatY - 160, '💢 그냥 갈게요!', '#ff8a8a');
        this.removeCustomer(customer, true);
      }
    }
  }

  private removeCustomer(customer: Customer, angry: boolean): void {
    this.customers[customer.seatIndex] = null;
    customer.state = 'leaving';
    customer.bubble.setVisible(false);
    customer.container.disableInteractive();
    this.tweens.add({
      targets: customer.container,
      x: -70,
      alpha: angry ? 0.6 : 1,
      duration: 1100,
      ease: 'Sine.inOut',
      onComplete: () => customer.container.destroy(),
    });
  }

  private endDay(): void {
    if (this.dayOver) return;
    this.dayOver = true;
    for (const c of this.customers) {
      if (c && (c.state === 'seated' || c.state === 'walking')) this.removeCustomer(c, false);
    }
    const closedDay = GameState.day;
    const settle = GameState.closeDay();

    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive());
    overlay.add(panel(this, W / 2, H / 2 - 40, 560, 400));
    overlay.add(
      txt(this, W / 2, H / 2 - 200, `Day ${closedDay} 영업 종료`, 42, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0.5),
    );
    overlay.add(txt(this, W / 2 - 220, H / 2 - 130, '오늘 매출', 26, '#b09070'));
    overlay.add(txt(this, W / 2 + 220, H / 2 - 130, `+${formatMoney(settle.revenue)}`, 26, '#7fdc8a').setOrigin(1, 0));
    overlay.add(txt(this, W / 2 - 220, H / 2 - 88, '운영비 (임대료·공과금)', 26, '#b09070'));
    overlay.add(txt(this, W / 2 + 220, H / 2 - 88, `-${formatMoney(settle.cost)}`, 26, '#ff8a8a').setOrigin(1, 0));
    overlay.add(txt(this, W / 2 - 220, H / 2 - 46, '순익', 26, '#f2e6d0', { fontStyle: 'bold' }));
    overlay.add(
      txt(this, W / 2 + 220, H / 2 - 46, `${settle.net >= 0 ? '+' : ''}${formatMoney(settle.net)}`, 26, settle.net >= 0 ? '#7fdc8a' : '#ff8a8a', {
        fontStyle: 'bold',
      }).setOrigin(1, 0),
    );
    overlay.add(txt(this, W / 2, H / 2 + 10, `보유 자금 ${formatMoney(GameState.money)}`, 30).setOrigin(0.5));
    const shopBtn = button(this, W / 2, H / 2 + 90, 400, 86, '발주 & 메뉴 관리', () => {
      this.scene.start('Shop');
    });
    overlay.add(shopBtn.container);
  }
}
