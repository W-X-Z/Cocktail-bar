import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { settle } from '../systems/OrderSystem';
import { scoreMix } from '../systems/RecipeSystem';
import { ShakeDetector } from '../systems/ShakeDetector';
import { StirDetector } from '../systems/StirDetector';
import type { Ingredient, MixAction, Recipe } from '../systems/types';
import { button, COLORS, formatMoney, H, panel, txt, W, type Btn } from '../ui/theme';

interface MixSceneData {
  recipeId: string;
  tipEligible: boolean;
  patience: number;
  seatIndex: number;
}

type MixMode = 'idle' | 'stir' | 'shake';

const GLASS_CAPACITY: Record<string, number> = {
  highball: 260,
  rocks: 200,
  coupe: 160,
  martini: 160,
};

const POUR_RATE_MLPS = 40;
const GLASS_X = 240;
const GLASS_Y = 850;

/** POV 조주 씬 */
export class MixScene extends Phaser.Scene {
  private recipe!: Recipe;
  private sceneData!: MixSceneData;

  private mode: MixMode = 'idle';
  private pouring = false;
  private selectedId: string | null = null;
  private poured = new Map<string, number>();
  private pourOrder: string[] = [];
  private garnishes = new Set<string>();
  private mixSeconds = 0;
  private finished = false;

  private shake = new ShakeDetector();
  private stir = new StirDetector();

  private liquid!: Phaser.GameObjects.Graphics;
  private shaker!: Phaser.GameObjects.Container;
  private spoon!: Phaser.GameObjects.Container;
  private mlText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private checkTexts: Phaser.GameObjects.Text[] = [];
  private stockTexts = new Map<string, Phaser.GameObjects.Text>();
  private bottleBgs = new Map<string, Phaser.GameObjects.Rectangle>();
  private stirBtn!: Btn;
  private shakeBtn!: Btn;

  constructor() {
    super('Mix');
  }

  init(data: MixSceneData): void {
    this.sceneData = data;
    this.recipe = GameState.recipe(data.recipeId);
    this.mode = 'idle';
    this.pouring = false;
    this.selectedId = null;
    this.poured = new Map();
    this.pourOrder = [];
    this.garnishes = new Set();
    this.mixSeconds = 0;
    this.finished = false;
    this.shake = new ShakeDetector();
    this.stir = new StirDetector();
    this.checkTexts = [];
    this.stockTexts = new Map();
    this.bottleBgs = new Map();
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0d14);
    // 카운터 상판 (POV: 눈앞의 작업대)
    this.add.rectangle(W / 2, 1020, W, 520, COLORS.wood);
    this.add.rectangle(W / 2, 762, W, 16, COLORS.woodLight);

    this.drawHeader();
    this.drawShelf();
    this.drawGlassArea();
    this.drawChecklist();
    this.drawActions();

    this.stir.setCenter(GLASS_X, GLASS_Y);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'stir') this.stir.pointerMove(p.x, p.y, p.isDown);
      else if (this.mode === 'shake') this.shake.pointerMove(p.x, p.isDown);
    });
  }

  private drawHeader(): void {
    panel(this, W / 2, 70, W - 30, 110);
    const tip = this.sceneData.tipEligible ? '' : '  (메뉴에 없어 팁 없음)';
    txt(this, 40, 46, `주문: ${this.recipe.nameKo}${tip}`, 34, '#e8a33d', { fontStyle: 'bold' });
    txt(
      this,
      40,
      92,
      `${this.recipe.name} · ${this.methodLabel()} · ${this.glassLabel()} 글라스`,
      22,
      '#9a8a7a',
    );
    button(this, W - 90, 70, 130, 70, '돌아가기', () => this.cancel(), 0x7a5a3a);
  }

  private methodLabel(): string {
    return { build: '빌드', stir: '스터', shake: '셰이크' }[this.recipe.method];
  }

  private glassLabel(): string {
    return { highball: '하이볼', rocks: '락', coupe: '쿠페', martini: '마티니' }[this.recipe.glass];
  }

  private ownedPourables(): Ingredient[] {
    return GameState.ingredients.filter((i) => i.type !== 'garnish' && GameState.stockOf(i.id) > 0);
  }

  private drawShelf(): void {
    txt(this, 40, 142, '선반 — 보틀을 골라 잔에 따르세요', 20, '#9a8a7a');
    const items = this.ownedPourables();
    const cols = 4;
    const cellW = (W - 60) / cols;
    items.forEach((ing, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 30 + cellW * col + cellW / 2;
      const y = 235 + row * 118;

      const bg = this.add
        .rectangle(x, y, cellW - 12, 108, COLORS.panelLight)
        .setStrokeStyle(2, COLORS.accent, 0.25);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectBottle(ing.id));
      this.bottleBgs.set(ing.id, bg);

      const color = Phaser.Display.Color.HexStringToColor(ing.color).color;
      this.add.rectangle(x - cellW / 2 + 30, y, 24, 62, color).setStrokeStyle(2, 0x000000, 0.45);
      this.add.rectangle(x - cellW / 2 + 30, y - 38, 10, 16, 0x333333);
      txt(this, x - cellW / 2 + 52, y - 26, ing.nameKo, 21, '#f2e6d0');
      const stockText = txt(this, x - cellW / 2 + 52, y + 2, '', 19, '#9a8a7a');
      this.stockTexts.set(ing.id, stockText);
    });
  }

  private selectBottle(id: string): void {
    this.setMode('idle');
    this.selectedId = id;
    for (const [bid, bg] of this.bottleBgs) {
      bg.setStrokeStyle(bid === id ? 4 : 2, bid === id ? COLORS.accent : COLORS.accent, bid === id ? 1 : 0.25);
      bg.setFillStyle(bid === id ? 0x3e2a34 : COLORS.panelLight);
    }
  }

  private drawGlassArea(): void {
    // 잔 (글라스 타입별 실루엣)
    const g = this.add.graphics();
    g.lineStyle(5, 0xcfe0e8, 0.9);
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    if (this.recipe.glass === 'highball') {
      g.strokeRect(GLASS_X - 70, GLASS_Y - 150, 140, 210);
    } else if (this.recipe.glass === 'rocks') {
      g.strokeRect(GLASS_X - 85, GLASS_Y - 90, 170, 150);
    } else {
      // 쿠페/마티니: 브이 라인
      g.beginPath();
      g.moveTo(GLASS_X - 95, GLASS_Y - 130);
      g.lineTo(GLASS_X, GLASS_Y - 10);
      g.lineTo(GLASS_X + 95, GLASS_Y - 130);
      g.strokePath();
      g.lineBetween(GLASS_X, GLASS_Y - 10, GLASS_X, GLASS_Y + 55);
      g.lineBetween(GLASS_X - 50, GLASS_Y + 58, GLASS_X + 50, GLASS_Y + 58);
    }
    g.setDepth(3);

    this.liquid = this.add.graphics().setDepth(2);
    this.mlText = txt(this, GLASS_X, GLASS_Y + 92, `0ml / 최대 ${cap}ml`, 24, '#f2e6d0').setOrigin(0.5);
    this.modeText = txt(this, GLASS_X, GLASS_Y - 190, '', 24, '#e8a33d', { align: 'center' }).setOrigin(0.5);

    // 셰이커 (셰이크 모드에서 잔을 덮는 연출)
    const body = this.add.rectangle(0, 0, 150, 190, 0xb8c4cc).setStrokeStyle(3, 0x4a565e);
    const top = this.add.rectangle(0, -115, 100, 46, 0x9aa8b0).setStrokeStyle(3, 0x4a565e);
    const cip = this.add.rectangle(0, -148, 44, 24, 0x8a98a0).setStrokeStyle(3, 0x4a565e);
    this.shaker = this.add.container(GLASS_X, GLASS_Y - 40, [body, top, cip]).setDepth(4).setVisible(false);

    // 바 스푼 (스터 모드)
    const handle = this.add.rectangle(0, -60, 6, 150, 0xd8d8e0);
    const bowl = this.add.circle(0, 22, 13, 0xd8d8e0);
    this.spoon = this.add.container(GLASS_X + 40, GLASS_Y - 60, [handle, bowl]).setDepth(4).setVisible(false);
  }

  private drawChecklist(): void {
    const x = 470;
    let y = 690;
    txt(this, x, y, '레시피', 26, '#e8a33d', { fontStyle: 'bold' });
    y += 42;
    for (const step of this.recipe.steps) {
      let label = '';
      if (step.action === 'pour' && step.ingredient) {
        label = `${GameState.ingredient(step.ingredient).nameKo} ${step.amountMl}ml`;
      } else if (step.action === 'stir') {
        label = `스터 ${step.seconds}초`;
      } else if (step.action === 'shake') {
        label = `셰이크 ${step.seconds}초`;
      } else if (step.action === 'garnish' && step.ingredient) {
        label = `가니시: ${GameState.ingredient(step.ingredient).nameKo}`;
      }
      const t = txt(this, x, y, `· ${label}`, 23, '#f2e6d0');
      this.checkTexts.push(t);
      y += 36;
    }
  }

  private drawActions(): void {
    // 따르기: 누르는 동안 계속 따라진다
    const pourBtn = button(this, 110, 1130, 170, 84, '따르기 ⏬', () => {}, COLORS.accent);
    pourBtn.bg.on('pointerdown', () => {
      this.setMode('idle');
      this.pouring = true;
    });
    const stopPour = () => (this.pouring = false);
    pourBtn.bg.on('pointerup', stopPour);
    pourBtn.bg.on('pointerout', stopPour);

    this.stirBtn = button(this, 300, 1130, 170, 84, '스터 🥄', () => {
      this.setMode(this.mode === 'stir' ? 'idle' : 'stir');
    }, 0x5a7a9a);

    this.shakeBtn = button(this, 490, 1130, 170, 84, '셰이크 🍸', () => {
      this.setMode(this.mode === 'shake' ? 'idle' : 'shake');
    }, 0x9a5a7a);

    // 가니시 (보유 시)
    const mintStock = GameState.stockOf('mint');
    const mintBtn = button(this, 645, 1130, 120, 84, '민트 🌿', () => {
      if (GameState.stockOf('mint') < 1 || this.garnishes.has('mint')) return;
      GameState.consume('mint', 1);
      this.garnishes.add('mint');
      this.redrawLiquid();
    }, 0x48a848);
    if (mintStock < 1) mintBtn.setEnabled(false);

    button(this, 180, 1226, 200, 70, '버리기 🗑', () => this.discard(), 0x7a4a3a);
    button(this, 500, 1226, 380, 70, '서빙하기 ✅', () => this.serve(), COLORS.ok);
  }

  private setMode(mode: MixMode): void {
    if (this.finished) return;
    this.mode = mode;
    this.pouring = false;
    this.shaker.setVisible(mode === 'shake');
    this.spoon.setVisible(mode === 'stir');
    this.stirBtn.bg.setFillStyle(mode === 'stir' ? 0x7a9aba : 0x5a7a9a);
    this.shakeBtn.bg.setFillStyle(mode === 'shake' ? 0xba7a9a : 0x9a5a7a);
    if (mode === 'shake') {
      void this.shake.start(); // iOS 권한 요청은 유저 제스처(버튼 탭) 컨텍스트에서
      this.modeText.setText('휴대폰을 흔드세요!\n(데스크톱: 화면을 빠르게 문지르기)');
    } else if (mode === 'stir') {
      this.modeText.setText('잔 위에서 원을 그리며 저으세요');
    } else {
      this.modeText.setText(this.selectedId ? `${GameState.ingredient(this.selectedId).nameKo} 선택됨` : '');
    }
  }

  private totalMl(): number {
    let sum = 0;
    for (const v of this.poured.values()) sum += v;
    return sum;
  }

  override update(_time: number, deltaMs: number): void {
    if (this.finished) return;
    const dt = deltaMs / 1000;
    this.mixSeconds += dt;

    // 붓기
    if (this.pouring && this.selectedId) {
      const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
      const stock = GameState.stockOf(this.selectedId);
      const room = cap - this.totalMl();
      const amount = Math.min(POUR_RATE_MLPS * dt, stock, room);
      if (amount > 0) {
        if (!this.poured.has(this.selectedId)) this.pourOrder.push(this.selectedId);
        this.poured.set(this.selectedId, (this.poured.get(this.selectedId) ?? 0) + amount);
        GameState.consume(this.selectedId, amount);
        this.redrawLiquid();
      }
    }

    // 셰이킹
    if (this.mode === 'shake') {
      this.shake.update(deltaMs);
      if (this.shake.isShaking) {
        this.shaker.setPosition(
          GLASS_X + Phaser.Math.Between(-14, 14),
          GLASS_Y - 40 + Phaser.Math.Between(-18, 18),
        );
        this.shaker.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
      } else {
        this.shaker.setPosition(GLASS_X, GLASS_Y - 40).setRotation(0);
      }
      this.modeText.setText(
        `셰이킹 ${this.shake.activeSeconds.toFixed(1)}초` +
          (this.shake.isShaking ? ' 🔥' : '\n휴대폰을 흔드세요! (데스크톱: 화면 문지르기)'),
      );
    }

    // 스터링
    if (this.mode === 'stir') {
      this.spoon.setPosition(
        GLASS_X + Math.cos(this.stir.activeSeconds * 6) * 34,
        GLASS_Y - 60 + Math.sin(this.stir.activeSeconds * 6) * 12,
      );
      this.modeText.setText(`스터 ${this.stir.activeSeconds.toFixed(1)}초 — 원을 그리세요`);
    }

    this.refreshTexts();
  }

  private refreshTexts(): void {
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    this.mlText.setText(`${Math.round(this.totalMl())}ml / 최대 ${cap}ml`);

    for (const [id, t] of this.stockTexts) {
      const ing = GameState.ingredient(id);
      const unit = ing.type === 'garnish' ? '회' : 'ml';
      t.setText(`${Math.round(GameState.stockOf(id))}${unit}`);
    }

    // 체크리스트 진행 표시
    this.recipe.steps.forEach((step, i) => {
      const t = this.checkTexts[i];
      if (!t) return;
      let state: 'todo' | 'ok' | 'over' = 'todo';
      if (step.action === 'pour' && step.ingredient) {
        const target = step.amountMl ?? 0;
        const actual = this.poured.get(step.ingredient) ?? 0;
        if (actual > target * 1.2) state = 'over';
        else if (actual >= target * 0.9) state = 'ok';
      } else if (step.action === 'shake') {
        if (this.shake.activeSeconds >= (step.seconds ?? 0) * 0.75) state = 'ok';
      } else if (step.action === 'stir') {
        if (this.stir.activeSeconds >= (step.seconds ?? 0) * 0.75) state = 'ok';
      } else if (step.action === 'garnish' && step.ingredient) {
        if (this.garnishes.has(step.ingredient)) state = 'ok';
      }
      t.setColor(state === 'ok' ? '#5fbf67' : state === 'over' ? '#d84343' : '#f2e6d0');
      const base = t.text.replace(/^[·✓✗] /, '· ');
      t.setText((state === 'ok' ? '✓ ' : state === 'over' ? '✗ ' : '· ') + base.slice(2));
    });
  }

  private redrawLiquid(): void {
    this.liquid.clear();
    const total = this.totalMl();
    if (total <= 0) return;
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    const frac = Math.min(1, total / cap);

    // 부피 가중 평균 색
    let r = 0;
    let gr = 0;
    let b = 0;
    for (const [id, ml] of this.poured) {
      const c = Phaser.Display.Color.HexStringToColor(GameState.ingredient(id).color);
      r += c.red * ml;
      gr += c.green * ml;
      b += c.blue * ml;
    }
    const color = Phaser.Display.Color.GetColor(r / total, gr / total, b / total);
    this.liquid.fillStyle(color, 0.85);

    if (this.recipe.glass === 'highball') {
      const h = 200 * frac;
      this.liquid.fillRect(GLASS_X - 65, GLASS_Y + 55 - h, 130, h);
    } else if (this.recipe.glass === 'rocks') {
      const h = 140 * frac;
      this.liquid.fillRect(GLASS_X - 80, GLASS_Y + 55 - h, 160, h);
    } else {
      // V자 잔: 아래 꼭짓점 기준 삼각형
      const fullH = 115;
      const h = fullH * frac;
      const halfW = 92 * (h / fullH);
      this.liquid.fillTriangle(
        GLASS_X, GLASS_Y - 10,
        GLASS_X - halfW, GLASS_Y - 10 - h,
        GLASS_X + halfW, GLASS_Y - 10 - h,
      );
    }

    if (this.garnishes.has('mint')) {
      this.liquid.fillStyle(0x48a848, 1);
      this.liquid.fillCircle(GLASS_X + 30, GLASS_Y - 150, 12);
      this.liquid.fillCircle(GLASS_X + 44, GLASS_Y - 158, 9);
    }
  }

  private buildActions(): MixAction[] {
    const actions: MixAction[] = [];
    for (const id of this.pourOrder) {
      actions.push({ action: 'pour', ingredient: id, amountMl: this.poured.get(id) ?? 0 });
    }
    if (this.shake.activeSeconds > 0.2) actions.push({ action: 'shake', seconds: this.shake.activeSeconds });
    if (this.stir.activeSeconds > 0.2) actions.push({ action: 'stir', seconds: this.stir.activeSeconds });
    for (const g of this.garnishes) actions.push({ action: 'garnish', ingredient: g });
    return actions;
  }

  private discard(): void {
    // 이미 따른 재료는 소모된다 (버리는 것도 비용)
    this.poured = new Map();
    this.pourOrder = [];
    this.garnishes = new Set();
    this.shake.resetSession();
    this.stir.resetSession();
    this.setMode('idle');
    this.redrawLiquid();
    this.liquid.clear();
  }

  private cancel(): void {
    this.shake.stop();
    this.scene.wake('Bar', {
      seatIndex: this.sceneData.seatIndex,
      totalPaid: 0,
      tip: 0,
      scoreTotal: 0,
      cancelled: true,
    });
    this.scene.stop();
  }

  private serve(): void {
    if (this.finished) return;
    this.finished = true;
    this.shake.stop();

    const score = scoreMix(this.recipe, this.buildActions());
    // 조주에 오래 걸릴수록 손님 인내심 추가 하락
    const patience = this.sceneData.patience - this.mixSeconds / 150;
    const pay = settle(this.recipe, score, patience, this.sceneData.tipEligible);
    GameState.earn(pay.total);

    this.showResult(score.total, score.lines, pay.base, pay.tip);
  }

  private showResult(
    total: number,
    lines: { label: string; ratio: number; detail: string }[],
    base: number,
    tip: number,
  ): void {
    const overlay = this.add.container(0, 0).setDepth(100);
    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78).setInteractive());
    overlay.add(panel(this, W / 2, H / 2, 600, 240 + lines.length * 44));

    const startY = H / 2 - (240 + lines.length * 44) / 2 + 60;
    const grade = total >= 0.85 ? '완벽해요! 😍' : total >= 0.6 ? '좋아요 🙂' : total >= 0.35 ? '음… 그럭저럭 😐' : '이게 뭐죠? 🤢';
    overlay.add(
      txt(this, W / 2, startY, `${this.recipe.nameKo} — ${Math.round(total * 100)}점`, 38, '#e8a33d', {
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    overlay.add(txt(this, W / 2, startY + 48, grade, 28).setOrigin(0.5));

    lines.forEach((line, i) => {
      const y = startY + 100 + i * 44;
      const color = line.ratio >= 0.9 ? '#5fbf67' : line.ratio >= 0.5 ? '#e8a33d' : '#d84343';
      overlay.add(txt(this, W / 2 - 260, y, line.label, 24, color));
      overlay.add(txt(this, W / 2 + 260, y, line.detail, 24, color).setOrigin(1, 0));
    });

    const payY = startY + 110 + lines.length * 44;
    overlay.add(
      txt(this, W / 2, payY, `대금 ${formatMoney(base)}  +  팁 ${formatMoney(tip)}`, 30, '#5fbf67', {
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    const btn = button(this, W / 2, payY + 76, 300, 76, '확인', () => {
      this.scene.wake('Bar', {
        seatIndex: this.sceneData.seatIndex,
        totalPaid: base + tip,
        tip,
        scoreTotal: total,
      });
      this.scene.stop();
    });
    overlay.add(btn.container);
  }
}
