import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { createOrder } from '../systems/OrderSystem';
import type { Order } from '../systems/types';
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
  state: 'seated' | 'mixing' | 'leaving';
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

    // 조주 완료 후 wake로 복귀
    this.events.on(
      Phaser.Scenes.Events.WAKE,
      (_sys: Phaser.Scenes.Systems, data?: MixResultPayload) => {
        if (data && typeof data.seatIndex === 'number') this.onMixDone(data);
      },
    );
  }

  private drawRoom(): void {
    // 바닥
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.floor);
    for (let y = 0; y < H; y += 80) {
      this.add.rectangle(W / 2, y, W, 2, 0x000000, 0.15);
    }
    // 벽 + 문
    this.add.rectangle(W / 2, 60, W, 120, COLORS.woodDark);
    this.add.rectangle(90, 60, 100, 100, 0x120a06).setStrokeStyle(3, COLORS.accent, 0.6);
    txt(this, 90, 60, '입구', 20, '#9a8a7a').setOrigin(0.5);
    // 뒤 선반 (분위기용 보틀)
    for (let i = 0; i < 8; i++) {
      const colors = [0xc87830, 0xd81830, 0x48a848, 0xe8f4f0, 0x3c2010, 0xf0e8c8, 0x8c2818, 0xf8a828];
      this.add.rectangle(240 + i * 60, 50, 26, 64, colors[i]!, 0.9).setStrokeStyle(2, 0x000000, 0.4);
    }
    txt(this, W / 2, 132, '~ 오늘도 좋은 밤 ~', 20, '#6a5a4a').setOrigin(0.5);

    // 바 카운터 (손님석 아래)
    this.add.rectangle(W / 2, 950, W - 60, 210, COLORS.wood).setStrokeStyle(4, COLORS.woodDark);
    this.add.rectangle(W / 2, 855, W - 60, 24, COLORS.woodLight);
    // 바텐더 (플레이어)
    const bartender = this.add.container(W / 2, 985);
    bartender.add(this.add.circle(0, 0, 42, 0x2c2c3a).setStrokeStyle(3, 0x000000, 0.4));
    bartender.add(this.add.circle(0, -6, 26, 0xf0c8a0));
    bartender.add(this.add.rectangle(0, -34, 40, 12, 0x1a1a26));
    txt(this, W / 2, 1050, '나 (바텐더)', 22, '#9a8a7a').setOrigin(0.5);

    // 스툴 4개
    for (let i = 0; i < 4; i++) {
      this.add.circle(this.seatX(i) + 90, this.seatY, 46, COLORS.woodDark).setStrokeStyle(4, 0x000000, 0.3);
    }
  }

  private drawHud(): void {
    panel(this, W / 2, 190, W - 40, 70, COLORS.panel);
    this.dayText = txt(this, 50, 190, '', 28, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.clockText = txt(this, W / 2, 190, '', 30, '#f2e6d0', { fontStyle: 'bold' }).setOrigin(0.5);
    this.moneyText = txt(this, W - 50, 190, '', 28, '#5fbf67', { fontStyle: 'bold' }).setOrigin(1, 0.5);
    this.hintText = txt(this, W / 2, 250, '', 24, '#d84343').setOrigin(0.5);

    button(this, W - 130, 1180, 200, 76, '영업 종료', () => this.endDay(), 0x7a5a3a);
    txt(this, 40, 1145, '손님을 탭하면 주문을 받습니다', 22, '#9a8a7a');
    txt(this, 40, 1180, `메뉴 ${GameState.menu.length}종 영업 중`, 22, '#9a8a7a');
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
    const bodyColors = [0x4a6a8a, 0x8a4a6a, 0x6a8a4a, 0x8a6a3a, 0x5a4a8a, 0x8a3a3a];
    const hairColors = [0x2a1a10, 0x4a3a2a, 0x111111, 0x6a4a1a, 0x888888];
    const body = bodyColors[Math.floor(Math.random() * bodyColors.length)]!;
    const hair = hairColors[Math.floor(Math.random() * hairColors.length)]!;

    const c = this.add.container(90, 120);
    c.add(this.add.circle(0, 0, 38, body).setStrokeStyle(3, 0x000000, 0.35));
    c.add(this.add.circle(0, -4, 22, 0xe8b890));
    c.add(this.add.circle(0, -12, 18, hair));
    c.setDepth(5);

    // 말풍선
    const desired = GameState.recipe(order.desiredId);
    const ordered = GameState.recipe(order.orderedId);
    const label = order.tipEligible
      ? `${ordered.nameKo} 주세요!`
      : `${desired.nameKo}는 없나요…\n그럼 ${ordered.nameKo}로.`;

    const bubbleText = txt(this, 0, -8, label, 22, '#241308', { align: 'center' }).setOrigin(0.5);
    const bw = Math.max(bubbleText.width + 30, 140);
    const bh = bubbleText.height + 36;
    const bubbleBg = this.add.rectangle(0, -8, bw, bh, COLORS.bubble).setStrokeStyle(2, 0x000000, 0.3);
    const patienceBg = this.add.rectangle(0, bh / 2 - 14, bw - 20, 8, 0x000000, 0.25);
    const patienceBar = this.add.rectangle(-(bw - 20) / 2, bh / 2 - 14, bw - 20, 8, COLORS.ok).setOrigin(0, 0.5);
    const bubble = this.add.container(0, 0, [bubbleBg, bubbleText, patienceBg, patienceBar]);
    bubble.setVisible(false);
    c.add(bubble);
    bubble.setPosition(30, -86);

    const customer: Customer = {
      container: c,
      bubble,
      bubbleText,
      patienceBar,
      order,
      patience: 1,
      seatIndex,
      state: 'seated',
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
        bubble.setVisible(true);
        // 말풍선이 화면 밖으로 나가지 않게 조정
        const worldX = sx + 30 + bw / 2;
        if (worldX > W - 10) bubble.x = 30 - (worldX - (W - 10));
      },
    });

    c.setInteractive(
      new Phaser.Geom.Circle(0, 0, 60),
      Phaser.Geom.Circle.Contains,
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
        this.floatText(customer.container.x, customer.container.y - 170, `팁 +${formatMoney(data.tip)}`, '#e8a33d');
      }
    }
    this.removeCustomer(customer, false);
  }

  private floatText(x: number, y: number, message: string, color = '#5fbf67'): void {
    const t = txt(this, x, y, message, 30, color, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(20);
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
        this.floatText(customer.container.x, customer.container.y - 120, '💢 그냥 갈게요!', '#d84343');
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
      if (c && c.state === 'seated') this.removeCustomer(c, false);
    }
    const overlay = this.add.container(0, 0).setDepth(50);
    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7));
    overlay.add(panel(this, W / 2, H / 2 - 60, 520, 300));
    overlay.add(
      txt(this, W / 2, H / 2 - 150, `Day ${GameState.day} 영업 종료`, 42, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0.5),
    );
    overlay.add(txt(this, W / 2, H / 2 - 80, `보유 자금 ${formatMoney(GameState.money)}`, 30).setOrigin(0.5));
    const shopBtn = button(this, W / 2, H / 2 + 10, 380, 84, '발주 & 메뉴 관리', () => {
      GameState.nextDay();
      this.scene.start('Shop');
    });
    overlay.add(shopBtn.container);
  }
}
