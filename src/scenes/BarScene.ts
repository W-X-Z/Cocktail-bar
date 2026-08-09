import Phaser from 'phaser';
import {
  applyAffinity,
  line,
  pickPersona,
  pickTalk,
  reactionKey,
  recordAngryLeave,
  recordServe,
  regularLevel,
} from '../systems/CustomerSystem';
import { GameState } from '../systems/GameState';
import { createOrder } from '../systems/OrderSystem';
import type { Order, Persona, ScoreLine, Talk, TalkOption } from '../systems/types';
import {
  arcadeTexture,
  bottleTexture,
  counterTexture,
  glowTexture,
  vignetteTexture,
} from '../ui/art';
import { portraitTexture, seatedTexture } from '../ui/portraits';
import { button, COLORS, formatMoney, H, panel, txt, W } from '../ui/theme';

const DAY_LENGTH_SEC = 150; // 실시간 150초 = 영업시간 20:00 → 02:00
const BASE_PATIENCE_SEC = 75;
/** 바 월드 폭 — 화면(720)보다 넓고, 드래그로 가로 스크롤 */
const WORLD_W = 1080;

interface Customer {
  persona: Persona;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  patienceBar: Phaser.GameObjects.Rectangle;
  order: Order;
  patience: number;
  patienceSec: number;
  seatIndex: number;
  state: 'walking' | 'seated' | 'mixing' | 'reacting' | 'enjoying' | 'leaving';
  /** 이번 방문에 마신 잔 수 */
  drinksHad: number;
  drinkColor: number;
  drinkObj: Phaser.GameObjects.Container | null;
  drinkLevel: number;
  sipsLeft: number;
}

export interface MixResultPayload {
  seatIndex: number;
  totalPaid: number;
  tip: number;
  scoreTotal: number;
  recipeName?: string;
  worstLines?: ScoreLine[];
  drinkColor?: number;
  cancelled?: boolean;
}

/** 바텐더 POV 운영 씬 — 넓은 바를 드래그로 둘러보며 손님을 마주 본다 */
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
  private dialogueCard: Phaser.GameObjects.Container | null = null;
  private dialogueSticky = false;

  private seatX(i: number): number {
    return 260 + i * 230;
  }
  private readonly seatY = 682;

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
    this.dialogueCard = null;
    this.dialogueSticky = false;

    this.cameras.main.setBounds(0, 0, WORLD_W, H);
    this.cameras.main.scrollX = 0;

    this.drawRoom();
    this.drawHud();

    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setDepth(45).setScrollFactor(0);

    // 드래그로 가로 스크롤 (대화 선택 중에는 잠금)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.dialogueSticky) return;
      this.cameras.main.scrollX = Phaser.Math.Clamp(
        this.cameras.main.scrollX - (p.x - p.prevPosition.x),
        0,
        WORLD_W - W,
      );
    });

    this.events.on(
      Phaser.Scenes.Events.WAKE,
      (_sys: Phaser.Scenes.Systems, data?: MixResultPayload) => {
        if (data && typeof data.seatIndex === 'number') this.onMixDone(data);
      },
    );
  }

  private drawRoom(): void {
    // 홀 배경
    const wallG = this.add.graphics();
    wallG.fillGradientStyle(0x241318, 0x241318, 0x160a10, 0x160a10, 1);
    wallG.fillRect(0, 140, WORLD_W, 660);
    for (let x = 40; x < WORLD_W; x += 160) {
      this.add.rectangle(x + 60, 400, 120, 380, 0x2e1a20).setStrokeStyle(2, 0x000000, 0.3);
    }
    this.add.rectangle(60, 470, 110, 330, 0x0e0703).setStrokeStyle(3, COLORS.accent, 0.4);
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

    // 머리 위 보틀 선반 (월드 전체 폭)
    this.add
      .image(WORLD_W / 2, 64, counterTexture(this, 'wall_wood_w', WORLD_W, 128, '#3a2113'))
      .setDisplaySize(WORLD_W, 128);
    this.add.rectangle(WORLD_W / 2, 128, WORLD_W, 12, 0x1a0d06);
    this.add.rectangle(WORLD_W / 2, 96, WORLD_W - 80, 12, 0x241206).setStrokeStyle(2, 0x000000, 0.4);
    const shelfColors = ['#c87830', '#d81830', '#48a848', '#e8f4f0', '#3c2010', '#f0e8c8', '#8c2818', '#f8a828', '#5a7a9a', '#c8e878'];
    for (let i = 0; i * 64 < WORLD_W - 120; i++) {
      const c = shelfColors[i % shelfColors.length]!;
      const key = bottleTexture(this, `deco_bottle_${i % shelfColors.length}`, c, i % 3 !== 1);
      this.add.image(75 + i * 64, 92, key).setScale(0.6).setOrigin(0.5, 1);
    }
    this.add
      .image(WORLD_W / 2, 60, glowTexture(this))
      .setScale(4.6, 0.9)
      .setTint(0xffb85a)
      .setAlpha(0.45)
      .setBlendMode(Phaser.BlendModes.ADD);

    const neon = txt(this, WORLD_W / 2, 160, '~ 소문의 낙원 ~', 26, '#ff9ec6', { fontStyle: 'bold' }).setOrigin(0.5);
    neon.setShadow(0, 0, '#ff4f9e', 14);
    this.tweens.add({ targets: neon, alpha: 0.72, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 핀볼 오락기
    const arcade = this.add.image(62, 700, arcadeTexture(this)).setDepth(9);
    arcade.setInteractive({ useHandCursor: true });
    arcade.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 16 && !this.scene.isActive('Pinball')) this.scene.launch('Pinball');
    });
    this.add
      .image(62, 660, glowTexture(this))
      .setScale(1.1)
      .setTint(0xff4f9e)
      .setAlpha(0.25)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(8);
    this.tweens.add({ targets: arcade, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 바 카운터 (월드 전체 폭)
    this.add.image(WORLD_W / 2, 940, counterTexture(this, 'bar_counter_w', WORLD_W, 300)).setDepth(20);
    this.add.rectangle(WORLD_W / 2, 786, WORLD_W, 20, COLORS.woodLight).setDepth(20).setStrokeStyle(2, 0x000000, 0.35);
    this.add
      .image(WORLD_W / 2, 830, glowTexture(this))
      .setScale(5.2, 0.7)
      .setTint(0xffcf8a)
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(21);
    for (let i = 0; i < 4; i++) {
      this.add.ellipse(this.seatX(i) + 90, 828, 84, 26, 0x33200f).setDepth(21).setStrokeStyle(2, 0x000000, 0.3);
    }
  }

  private drawHud(): void {
    panel(this, W / 2, 205, W - 40, 74).setDepth(46).setScrollFactor(0);
    this.dayText = txt(this, 56, 205, '', 28, '#e8a33d', { fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(46)
      .setScrollFactor(0);
    this.clockText = txt(this, W / 2, 205, '', 32, '#f2e6d0', { fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(46)
      .setScrollFactor(0);
    this.moneyText = txt(this, W - 56, 205, '', 28, '#7fdc8a', { fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(46)
      .setScrollFactor(0);
    this.hintText = txt(this, W / 2, 262, '', 23, '#ff8a8a').setOrigin(0.5).setDepth(46).setScrollFactor(0);

    const endBtn = button(this, W - 130, 1186, 208, 78, '영업 종료', () => this.endDay(), 0x8a5a2e);
    endBtn.container.setDepth(46).setScrollFactor(0, 0, true);
    txt(this, 40, 1188, `메뉴 ${GameState.menu.length}종`, 22, '#b09070').setDepth(46).setScrollFactor(0);
  }

  private clockLabel(): string {
    const gameMin = (this.clockSec / DAY_LENGTH_SEC) * 360;
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

    const activeIds = this.customers.filter((c): c is Customer => !!c).map((c) => c.persona.id);
    const persona = pickPersona(activeIds);
    const order = createOrder(persona);
    if (!order) {
      this.hintText.setText('재고 부족! 발주 필요');
      this.spawnTimer = 0;
      this.nextSpawnIn = 5;
      return;
    }
    this.hintText.setText('');
    this.spawnTimer = 0;
    this.nextSpawnIn = 10 + Math.random() * 10;
    this.spawnCustomer(free, persona, order);
  }

  private nameLabel(persona: Persona): string {
    const lv = regularLevel(persona.id);
    return lv.level > 0 ? `${persona.name} ${'♥'.repeat(lv.level)}` : persona.name;
  }

  private spawnCustomer(seatIndex: number, persona: Persona, order: Order): void {
    GameState.recordVisit(persona.id);
    const lv = regularLevel(persona.id);

    const c = this.add.container(-90, this.seatY);
    const sprite = this.add
      .image(0, 0, seatedTexture(this, `seated_${persona.id}`, persona.look))
      .setScale(3);
    c.add(sprite);
    const nameText = txt(this, 0, 0, this.nameLabel(persona), 20, lv.level >= 2 ? '#ffd27a' : '#b09070', {
      fontStyle: 'bold',
      align: 'center',
    })
      .setOrigin(0.5)
      .setDepth(22)
      .setVisible(false);
    c.setDepth(10);
    this.tweens.add({ targets: sprite, y: -6, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const desired = GameState.recipe(order.desiredId);
    const ordered = GameState.recipe(order.orderedId);
    const greetText = line(persona, 'greet');
    const orderText = order.tipEligible
      ? line(persona, 'order', { drink: ordered.nameKo })
      : line(persona, 'orderFallback', { drink: ordered.nameKo, desired: desired.nameKo });

    const bubbleText = txt(this, 0, -10, '', 22, '#241308', {
      align: 'center',
      wordWrap: { width: 250 },
    }).setOrigin(0.5);
    bubbleText.setShadow(0, 0, 'rgba(0,0,0,0)', 0);
    const bw = 290;
    const bh = 108;
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
    bubble.setPosition(40, -168);

    const patienceSec = BASE_PATIENCE_SEC * persona.patienceMul * (1 + lv.patienceBonus);
    const customer: Customer = {
      persona,
      container: c,
      sprite,
      nameText,
      bubble,
      bubbleText,
      patienceBar,
      order,
      patience: 1,
      patienceSec,
      seatIndex,
      state: 'walking',
      drinksHad: 0,
      drinkColor: 0xd8c8a8,
      drinkObj: null,
      drinkLevel: 1,
      sipsLeft: 0,
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
        nameText.setPosition(sx, 806).setVisible(true);
        bubble.setVisible(true);
        bubble.setScale(0);
        bubbleText.setText(greetText);
        this.showDialogue(persona, greetText);
        this.tweens.add({ targets: bubble, scale: 1, duration: 260, ease: 'Back.out' });
        const worldX = sx + 40 + bw / 2;
        if (worldX > WORLD_W - 10) bubble.x = 40 - (worldX - (WORLD_W - 10));
        this.time.delayedCall(1700, () => {
          if (customer.state === 'seated') bubbleText.setText(orderText);
        });
      },
    });

    c.setInteractive(new Phaser.Geom.Rectangle(-70, -114, 140, 230), Phaser.Geom.Rectangle.Contains);
    c.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 16) this.acceptOrder(customer);
    });
  }

  private acceptOrder(customer: Customer): void {
    if (customer.state !== 'seated') return;
    if (this.customers.some((c) => c?.state === 'mixing')) return;
    customer.state = 'mixing';
    customer.bubbleText.setText('조주 중…');
    const lv = regularLevel(customer.persona.id);
    this.scene.sleep();
    this.scene.run('Mix', {
      recipeId: customer.order.orderedId,
      tipEligible: customer.order.tipEligible,
      patience: customer.patience,
      seatIndex: customer.seatIndex,
      tipMul: customer.persona.tipMul * (1 + lv.tipBonus),
    });
  }

  private onMixDone(data: MixResultPayload): void {
    const customer = this.customers[data.seatIndex];
    if (!customer) return;
    if (data.cancelled) {
      customer.state = 'seated';
      customer.bubbleText.setText('기다리는 중…');
      return;
    }

    customer.state = 'reacting';
    customer.drinksHad += 1;
    customer.drinkColor = data.drinkColor ?? 0xd8c8a8;
    const s = data.scoreTotal;
    const face = s >= 0.85 ? '😍' : s >= 0.6 ? '🙂' : s >= 0.35 ? '😐' : '🤢';
    const reactionLine = line(customer.persona, reactionKey(s));
    customer.bubbleText.setText(`${face}`);
    this.showDialogue(customer.persona, reactionLine);
    customer.patienceBar.setVisible(false);

    if (s >= 0.6) {
      this.tweens.add({ targets: customer.sprite, y: -14, duration: 160, yoyo: true, repeat: 3, ease: 'Sine.inOut' });
    } else {
      customer.sprite.setTint(s < 0.35 ? 0xff9090 : 0xffffff);
      this.tweens.add({ targets: customer.sprite, x: 6, duration: 60, yoyo: true, repeat: 5 });
    }

    if (data.totalPaid > 0) {
      this.floatText(customer.container.x, this.seatY - 190, `+${formatMoney(data.totalPaid - data.tip)}`);
      if (data.tip > 0) {
        this.time.delayedCall(400, () =>
          this.floatText(customer.container.x, this.seatY - 190, `팁 +${formatMoney(data.tip)}`, '#ffd27a'),
        );
      }
    }

    const newLevel = recordServe(customer.persona.id, s);
    customer.nameText.setText(this.nameLabel(customer.persona));
    if (newLevel) {
      this.time.delayedCall(800, () => {
        this.floatText(
          customer.container.x,
          this.seatY - 240,
          `🎉 ${newLevel.label}!`,
          '#ff9ec6',
        );
      });
    }

    this.showToast(data);

    // 반응/대화 후 → 잔을 즐기며 머무른다
    const talk = s >= 0.35 && Math.random() < 0.65 ? pickTalk(customer.persona) : null;
    if (talk) {
      this.time.delayedCall(2000, () => this.startTalk(customer, talk));
    } else {
      this.time.delayedCall(2200, () => this.enterEnjoying(customer));
    }
  }

  /* ---------- 음료를 즐기며 머무르기 ---------- */

  private enterEnjoying(customer: Customer): void {
    if (this.customers[customer.seatIndex] !== customer) return;
    if (customer.state === 'leaving') return;
    if (this.dayOver) {
      this.removeCustomer(customer, false);
      return;
    }
    customer.state = 'enjoying';
    customer.sprite.clearTint();
    customer.bubble.setVisible(false);

    // 코스터 위 음료
    const gx = this.seatX(customer.seatIndex) + 90;
    const drink = this.add.container(gx, 818).setDepth(22);
    customer.drinkObj = drink;
    customer.drinkLevel = 1;
    customer.sipsLeft = 3 + Math.floor(Math.random() * 3); // 3~5모금
    this.redrawDrink(customer);

    this.scheduleSip(customer);
  }

  private redrawDrink(customer: Customer): void {
    const drink = customer.drinkObj;
    if (!drink) return;
    drink.removeAll(true);
    const g = this.add.graphics();
    const h = 40;
    const w = 30;
    // 액체
    const lh = (h - 8) * customer.drinkLevel;
    g.fillStyle(customer.drinkColor, 0.95);
    g.fillRect(-w / 2 + 3, h / 2 - 4 - lh, w - 6, lh);
    // 잔
    g.lineStyle(2.5, 0xe8f2f8, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.lineStyle(1.5, 0xffffff, 0.35);
    g.lineBetween(-w / 2 + 6, -h / 2 + 4, -w / 2 + 6, h / 2 - 6);
    drink.add(g);
  }

  private scheduleSip(customer: Customer): void {
    this.time.delayedCall(3500 + Math.random() * 4000, () => {
      if (this.customers[customer.seatIndex] !== customer || customer.state !== 'enjoying') return;
      const drink = customer.drinkObj;
      if (!drink) return;
      // 잔을 들어 한 모금
      this.tweens.add({
        targets: drink,
        y: 742,
        angle: -16,
        duration: 340,
        yoyo: true,
        ease: 'Sine.inOut',
        onYoyo: () => {
          customer.sipsLeft -= 1;
          customer.drinkLevel = Math.max(0, customer.sipsLeft / (customer.sipsLeft + 1) * customer.drinkLevel);
          this.redrawDrink(customer);
        },
        onComplete: () => {
          this.tweens.add({ targets: customer.sprite, y: -4, duration: 140, yoyo: true });
          if (customer.sipsLeft <= 0) {
            customer.drinkLevel = 0;
            this.redrawDrink(customer);
            this.time.delayedCall(1600, () => this.finishDrink(customer));
          } else {
            this.scheduleSip(customer);
          }
        },
      });
    });
  }

  private finishDrink(customer: Customer): void {
    if (this.customers[customer.seatIndex] !== customer || customer.state !== 'enjoying') return;
    customer.drinkObj?.destroy();
    customer.drinkObj = null;

    // 한 잔 더? (최대 2잔)
    if (!this.dayOver && customer.drinksHad < 2 && Math.random() < 0.45) {
      const order = createOrder(customer.persona);
      if (order) {
        customer.order = order;
        customer.state = 'seated';
        customer.patience = 1;
        customer.patienceBar.setVisible(true);
        const ordered = GameState.recipe(order.orderedId);
        const desired = GameState.recipe(order.desiredId);
        const orderText = order.tipEligible
          ? line(customer.persona, 'order', { drink: ordered.nameKo })
          : line(customer.persona, 'orderFallback', { drink: ordered.nameKo, desired: desired.nameKo });
        customer.bubble.setVisible(true);
        customer.bubble.setScale(0);
        customer.bubbleText.setText(orderText);
        this.tweens.add({ targets: customer.bubble, scale: 1, duration: 260, ease: 'Back.out' });
        return;
      }
    }
    this.removeCustomer(customer, false);
  }

  /* ---------- 대화 ---------- */

  private showDialogue(
    persona: Persona,
    text: string,
    options?: { label: string; onPick: () => void }[],
  ): void {
    if (this.dialogueSticky && !options) return;
    this.dialogueCard?.destroy();
    const interactive = !!options && options.length > 0;
    this.dialogueSticky = interactive;

    const card = this.add.container(0, 0).setDepth(49);
    const panelH = interactive ? 226 : 190;
    const panelY = interactive ? 967 : 985;
    card.add(panel(this, W / 2 + 40, panelY, W - 100, panelH));

    const portrait = this.add
      .image(120, panelY - 43, portraitTexture(this, `portrait_${persona.id}`, persona.look))
      .setScale(5);
    card.add(portrait);
    const lv = regularLevel(persona.id);
    card.add(
      txt(
        this,
        225,
        panelY - 70,
        `${this.nameLabel(persona)}  ·  ${persona.job}`,
        24,
        lv.level >= 2 ? '#ffd27a' : '#e8a33d',
        { fontStyle: 'bold' },
      ),
    );
    card.add(txt(this, 225, panelY - 33, text, 24, '#f2e6d0', { wordWrap: { width: 430 }, lineSpacing: 5 }));

    if (interactive) {
      options.forEach((opt, i) => {
        const b = button(this, 254 + i * 162, panelY + 76, 150, 56, opt.label, () => {
          this.dialogueSticky = false;
          opt.onPick();
        }, 0x5a7a9a);
        card.add(b.container);
      });
    }

    card.setScrollFactor(0, 0, true);
    card.setAlpha(0);
    portrait.setX(100);
    this.tweens.add({ targets: card, alpha: 1, duration: 180 });
    this.tweens.add({ targets: portrait, x: 120, duration: 220, ease: 'Back.out' });

    this.dialogueCard = card;
    if (!interactive) {
      this.time.delayedCall(3000, () => {
        if (this.dialogueCard === card) {
          this.tweens.add({ targets: card, alpha: 0, duration: 300, onComplete: () => card.destroy() });
          this.dialogueCard = null;
        }
      });
    }
  }

  private startTalk(customer: Customer, talk: Talk): void {
    if (customer.state !== 'reacting') return;
    customer.bubbleText.setText('💬');

    let resolved = false;
    const resolve = (opt: TalkOption) => {
      if (resolved) return;
      resolved = true;
      this.dialogueSticky = false;
      this.showDialogue(customer.persona, opt.reply);

      if (opt.affinity !== 0) {
        const icon = opt.affinity > 0 ? '💗 +1' : '💔 -1';
        this.floatText(customer.container.x, this.seatY - 200, icon, opt.affinity > 0 ? '#ff9ec6' : '#8a8a9a');
      }
      const newLevel = applyAffinity(customer.persona.id, opt.affinity);
      customer.nameText.setText(this.nameLabel(customer.persona));
      if (newLevel) {
        this.floatText(
          customer.container.x,
          this.seatY - 250,
          `🎉 ${newLevel.label}!`,
          '#ff9ec6',
        );
      }
      this.time.delayedCall(2200, () => this.enterEnjoying(customer));
    };

    this.showDialogue(
      customer.persona,
      talk.text,
      talk.options.map((opt) => ({
        label: { sympathize: '🙌 호응', advise: '💡 조언', silence: '🤫 침묵' }[opt.kind],
        onPick: () => resolve(opt),
      })),
    );

    this.time.delayedCall(8000, () => {
      if (!resolved) {
        const fallback =
          talk.options.find((o) => o.kind === 'silence') ??
          talk.options.find((o) => o.affinity === 0) ??
          talk.options[0]!;
        resolve(fallback);
      }
    });
  }

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
    lines.forEach((l, i) => {
      const color = l.ratio >= 0.9 ? '#7fdc8a' : l.ratio >= 0.5 ? '#ffd27a' : '#ff8a8a';
      toast.add(txt(this, W / 2, 356 + i * 34, `${l.label}: ${l.detail}`, 21, color).setOrigin(0.5));
    });
    bg.setInteractive();
    bg.on('pointerdown', () => {
      toast.destroy();
      if (this.toast === toast) this.toast = null;
    });
    toast.setScrollFactor(0, 0, true);
    this.toast = toast;
    this.time.delayedCall(4500, () => {
      if (this.toast === toast) {
        toast.destroy();
        this.toast = null;
      }
    });
  }

  private floatText(x: number, y: number, message: string, color = '#7fdc8a'): void {
    const t = txt(this, Math.min(Math.max(x, 180), WORLD_W - 180), y, message, 28, color, { fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(48);
    this.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 2400, onComplete: () => t.destroy() });
  }

  private updateCustomers(dt: number): void {
    for (const customer of this.customers) {
      if (!customer || customer.state !== 'seated') continue;
      customer.patience -= dt / customer.patienceSec;
      customer.patienceBar.setScale(Math.max(0.001, customer.patience), 1);
      customer.patienceBar.setFillStyle(
        customer.patience > 0.5 ? COLORS.ok : customer.patience > 0.25 ? COLORS.accent : COLORS.danger,
      );
      if (customer.patience <= 0) {
        const angryLine = line(customer.persona, 'angry');
        customer.bubbleText.setText('💢');
        this.showDialogue(customer.persona, angryLine);
        recordAngryLeave(customer.persona.id);
        customer.nameText.setText(this.nameLabel(customer.persona));
        const c = customer;
        c.state = 'reacting';
        this.time.delayedCall(1400, () => this.removeCustomer(c, true));
      }
    }
  }

  private removeCustomer(customer: Customer, angry: boolean): void {
    if (customer.state === 'leaving') return;
    this.customers[customer.seatIndex] = null;
    customer.state = 'leaving';
    customer.bubble.setVisible(false);
    customer.nameText.destroy();
    customer.drinkObj?.destroy();
    customer.container.disableInteractive();
    this.tweens.add({
      targets: customer.container,
      x: -90,
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
      if (c && (c.state === 'seated' || c.state === 'walking' || c.state === 'enjoying')) {
        this.removeCustomer(c, false);
      }
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
    overlay.add(txt(this, W / 2 - 220, H / 2 - 88, '운영비', 26, '#b09070'));
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
    overlay.setScrollFactor(0, 0, true);
  }
}
