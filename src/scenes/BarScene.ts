import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { createOrder } from '../systems/OrderSystem';
import type { Order } from '../systems/types';
import {
  bottleTexture,
  counterTexture,
  floorTexture,
  glowTexture,
  personTexture,
  shadowTexture,
  stoolTexture,
  vignetteTexture,
} from '../ui/art';
import { button, COLORS, formatMoney, H, panel, txt, W } from '../ui/theme';

const DAY_LENGTH_SEC = 150; // 실시간 150초 = 영업시간 20:00 → 02:00
const PATIENCE_SEC = 75;

interface Customer {
  container: Phaser.GameObjects.Container;
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  patienceBar: Phaser.GameObjects.Rectangle;
  order: Order;
  patience: number; // 0~1
  seatIndex: number;
  state: 'walking' | 'seated' | 'mixing' | 'leaving';
}

interface MixResultPayload {
  seatIndex: number;
  totalPaid: number;
  tip: number;
  scoreTotal: number;
  cancelled?: boolean;
}

/** 탑다운 바 운영 씬 */
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

  private seatX(i: number): number {
    return 120 + i * 160;
  }
  private readonly seatY = 760;

  constructor() {
    super('Bar');
  }

  create(): void {
    this.customers = [null, null, null, null];
    this.clockSec = 0;
    this.dayOver = false;
    this.spawnTimer = 0;
    this.nextSpawnIn = 2;

    this.drawRoom();
    this.drawHud();

    // 분위기: 비네트 (입력 통과)
    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setDepth(45);

    // 조주 완료 후 wake로 복귀
    this.events.on(
      Phaser.Scenes.Events.WAKE,
      (_sys: Phaser.Scenes.Systems, data?: MixResultPayload) => {
        if (data && typeof data.seatIndex === 'number') this.onMixDone(data);
      },
    );
  }

  private drawRoom(): void {
    // 마루 바닥
    this.add.tileSprite(W / 2, H / 2, W, H, floorTexture(this));

    // 뒷벽
    this.add.image(W / 2, 64, counterTexture(this, 'wall_wood', W, 128, '#3a2113')).setDisplaySize(W, 128);
    this.add.rectangle(W / 2, 132, W, 10, 0x1a0d06);

    // 입구
    this.add.rectangle(90, 62, 104, 104, 0x0e0703).setStrokeStyle(3, COLORS.accent, 0.55);
    this.add.rectangle(90, 62, 84, 84, 0x1c1009);
    txt(this, 90, 62, '입구', 20, '#b09070').setOrigin(0.5);

    // 백바 선반 + 진열 보틀
    this.add.rectangle(450, 96, 500, 14, 0x241206).setStrokeStyle(2, 0x000000, 0.4);
    const shelfColors = ['#c87830', '#d81830', '#48a848', '#e8f4f0', '#3c2010', '#f0e8c8', '#8c2818', '#f8a828', '#5a7a9a'];
    shelfColors.forEach((c, i) => {
      const key = bottleTexture(this, `deco_bottle_${i}`, c, i % 3 !== 1);
      this.add.image(230 + i * 55, 56, key).setScale(0.62).setOrigin(0.5, 1).setY(92);
    });
    // 선반 뒤 은은한 조명
    this.add.image(450, 60, glowTexture(this)).setScale(2.6, 0.9).setTint(0xffb85a).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);

    // 네온 사인
    const neon = txt(this, W / 2, 160, '~ COCKTAIL BAR ~', 26, '#ff9ec6', { fontStyle: 'bold' }).setOrigin(0.5);
    neon.setShadow(0, 0, '#ff4f9e', 14);
    this.tweens.add({ targets: neon, alpha: 0.72, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 천장 조명 (좌석 위 광원)
    for (let i = 0; i < 4; i++) {
      this.add
        .image(this.seatX(i) + 90, this.seatY - 30, glowTexture(this))
        .setScale(1.7)
        .setTint(0xffc878)
        .setAlpha(0.30)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(8);
    }

    // 바 카운터
    const counter = this.add.image(W / 2, 952, counterTexture(this, 'bar_counter', W - 56, 212));
    counter.setDepth(3);
    this.add.rectangle(W / 2, 850, W - 56, 18, COLORS.woodLight, 1).setDepth(3).setStrokeStyle(2, 0x000000, 0.35);
    // 카운터 위 조명 반사
    this.add
      .image(W / 2, 900, glowTexture(this))
      .setScale(3.4, 0.8)
      .setTint(0xffcf8a)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4);

    // 바텐더 (플레이어)
    this.add.image(W / 2, 1006, shadowTexture(this)).setScale(1.15).setDepth(3);
    this.add.image(W / 2, 985, personTexture(this, 'person_bartender', '#23232f', '#1a1a22', '#f0c8a0')).setDepth(4);
    txt(this, W / 2, 1046, '나 (바텐더)', 20, '#b09070').setOrigin(0.5).setDepth(4);

    // 스툴
    for (let i = 0; i < 4; i++) {
      const x = this.seatX(i) + 90;
      this.add.image(x, this.seatY + 14, shadowTexture(this)).setScale(1.1);
      this.add.image(x, this.seatY, stoolTexture(this));
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

    const c = this.add.container(90, 120);
    c.add(this.add.image(0, 16, shadowTexture(this)).setScale(0.95));
    const sprite = this.add.image(
      0,
      0,
      personTexture(this, `person_${bi}_${hi}_${si}`, bodies[bi]!, hairs[hi]!, skins[si]!),
    );
    c.add(sprite);
    c.setDepth(10);
    // 걸어오는 동안 살짝 씰룩
    this.tweens.add({ targets: sprite, angle: 4, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 말풍선
    const desired = GameState.recipe(order.desiredId);
    const ordered = GameState.recipe(order.orderedId);
    const label = order.tipEligible
      ? `${ordered.nameKo} 주세요!`
      : `${desired.nameKo}는 없나요…\n그럼 ${ordered.nameKo}로.`;

    const bubbleText = txt(this, 0, -10, label, 22, '#241308', { align: 'center' }).setOrigin(0.5);
    bubbleText.setShadow(0, 0, '', 0);
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
    bubble.setPosition(34, -92);

    const customer: Customer = {
      container: c,
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
      y: this.seatY,
      duration: 1400,
      ease: 'Sine.inOut',
      onComplete: () => {
        if (customer.state === 'walking') customer.state = 'seated';
        this.tweens.killTweensOf(sprite);
        sprite.setAngle(0);
        bubble.setVisible(true);
        bubble.setScale(0);
        this.tweens.add({ targets: bubble, scale: 1, duration: 260, ease: 'Back.out' });
        // 말풍선이 화면 밖으로 나가지 않게 조정
        const worldX = sx + 34 + bw / 2;
        if (worldX > W - 10) bubble.x = 34 - (worldX - (W - 10));
      },
    });

    c.setInteractive(new Phaser.Geom.Circle(0, 0, 60), Phaser.Geom.Circle.Contains);
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

  private onMixDone(data: MixResultPayload): void {
    const customer = this.customers[data.seatIndex];
    if (!customer) return;
    if (data.cancelled) {
      // 조주 취소 → 손님은 자리에서 계속 대기
      customer.state = 'seated';
      customer.bubbleText.setText(`${GameState.recipe(customer.order.orderedId).nameKo} 기다리는 중…`);
      return;
    }
    if (data.totalPaid > 0) {
      const face =
        data.scoreTotal >= 0.85 ? '😍' : data.scoreTotal >= 0.6 ? '🙂' : data.scoreTotal >= 0.35 ? '😐' : '🤢';
      this.floatText(customer.container.x, customer.container.y - 120, `${face} +${formatMoney(data.totalPaid)}`);
      if (data.tip > 0) {
        this.floatText(customer.container.x, customer.container.y - 170, `팁 +${formatMoney(data.tip)}`, '#ffd27a');
      }
    }
    this.removeCustomer(customer, false);
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
        this.floatText(customer.container.x, customer.container.y - 120, '💢 그냥 갈게요!', '#ff8a8a');
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
      x: 90,
      y: 120,
      alpha: angry ? 0.6 : 1,
      duration: 1100,
      ease: 'Sine.inOut',
      onComplete: () => customer.container.destroy(),
    });
  }

  private endDay(): void {
    if (this.dayOver) return;
    this.dayOver = true;
    // 남은 손님 정리
    for (const c of this.customers) {
      if (c && (c.state === 'seated' || c.state === 'walking')) this.removeCustomer(c, false);
    }
    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive());
    overlay.add(panel(this, W / 2, H / 2 - 60, 540, 310));
    overlay.add(
      txt(this, W / 2, H / 2 - 150, `Day ${GameState.day} 영업 종료`, 42, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0.5),
    );
    overlay.add(txt(this, W / 2, H / 2 - 80, `보유 자금 ${formatMoney(GameState.money)}`, 30).setOrigin(0.5));
    const shopBtn = button(this, W / 2, H / 2 + 10, 400, 86, '발주 & 메뉴 관리', () => {
      GameState.nextDay();
      this.scene.start('Shop');
    });
    overlay.add(shopBtn.container);
  }
}
