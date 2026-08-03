import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { settle } from '../systems/OrderSystem';
import { scoreMix } from '../systems/RecipeSystem';
import { ShakeDetector } from '../systems/ShakeDetector';
import { StirDetector } from '../systems/StirDetector';
import type { Ingredient, MixAction, Recipe } from '../systems/types';
import {
  bottleTexture,
  counterTexture,
  glassTexture,
  glowTexture,
  shakerTexture,
  spoonTexture,
  vignetteTexture,
} from '../ui/art';
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

/** 잔 종류별 액체 지오메트리 (glassTexture와 1:1 정렬) */
const LIQUID_GEOM: Record<string, { kind: 'rect' | 'tri'; halfW: number; bottom: number; maxH: number }> = {
  highball: { kind: 'rect', halfW: 64, bottom: 62, maxH: 200 },
  rocks: { kind: 'rect', halfW: 78, bottom: 56, maxH: 140 },
  coupe: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
  martini: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
};

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
  private stream!: Phaser.GameObjects.Graphics;
  private pourBottle!: Phaser.GameObjects.Image;
  private shaker!: Phaser.GameObjects.Container;
  private spoon!: Phaser.GameObjects.Container;
  private mlText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private checkTexts: Phaser.GameObjects.Text[] = [];
  private stockTexts = new Map<string, Phaser.GameObjects.Text>();
  private bottleBgs = new Map<string, Phaser.GameObjects.Rectangle>();
  private bottleImgs = new Map<string, Phaser.GameObjects.Image>();
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
    this.bottleImgs = new Map();
  }

  create(): void {
    // 어두운 바 배경 + 온기
    this.add.rectangle(W / 2, H / 2, W, H, 0x160a10);
    this.add
      .image(W / 2, 420, glowTexture(this))
      .setScale(3.6, 2.2)
      .setTint(0x8a4a2a)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD);

    // 작업대 (POV 카운터)
    this.add.image(W / 2, 1024, counterTexture(this, 'mix_counter', W, 512)).setDisplaySize(W, 512);
    this.add.rectangle(W / 2, 764, W, 14, COLORS.woodLight).setStrokeStyle(2, 0x000000, 0.4);
    // 카운터 위 스포트라이트
    this.add
      .image(GLASS_X, GLASS_Y - 40, glowTexture(this))
      .setScale(2.6, 2.0)
      .setTint(0xffc878)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.drawHeader();
    this.drawShelf();
    this.drawGlassArea();
    this.drawChecklist();
    this.drawActions();

    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setDepth(60);

    this.stir.setCenter(GLASS_X, GLASS_Y);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'stir') this.stir.pointerMove(p.x, p.y, p.isDown);
      else if (this.mode === 'shake') this.shake.pointerMove(p.x, p.isDown);
    });
  }

  private drawHeader(): void {
    panel(this, W / 2, 70, W - 30, 110).setDepth(61);
    const tip = this.sceneData.tipEligible ? '' : '  (메뉴에 없어 팁 없음)';
    txt(this, 40, 46, `주문: ${this.recipe.nameKo}${tip}`, 34, '#e8a33d', { fontStyle: 'bold' }).setDepth(61);
    txt(
      this,
      40,
      92,
      `${this.recipe.name} · ${this.methodLabel()} · ${this.glassLabel()} 글라스`,
      22,
      '#b09070',
    ).setDepth(61);
    button(this, W - 90, 70, 130, 70, '돌아가기', () => this.cancel(), 0x8a5a2e).container.setDepth(61);
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
    txt(this, 40, 142, '선반 — 보틀을 골라 잔에 따르세요', 20, '#b09070');
    const items = this.ownedPourables();
    const cols = 4;
    const cellW = (W - 60) / cols;
    items.forEach((ing, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 30 + cellW * col + cellW / 2;
      const y = 235 + row * 118;

      const bg = this.add
        .rectangle(x, y, cellW - 12, 108, COLORS.panelLight, 0.9)
        .setStrokeStyle(2, COLORS.accent, 0.22);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectBottle(ing.id));
      this.bottleBgs.set(ing.id, bg);

      const bottleKey = bottleTexture(this, `bottle_${ing.id}`, ing.color, ing.type !== 'mixer');
      const img = this.add.image(x - cellW / 2 + 34, y + 2, bottleKey).setScale(0.62);
      this.bottleImgs.set(ing.id, img);

      txt(this, x - cellW / 2 + 62, y - 28, ing.nameKo, 20, '#f2e6d0');
      const stockText = txt(this, x - cellW / 2 + 62, y + 2, '', 18, '#b09070');
      this.stockTexts.set(ing.id, stockText);
    });
  }

  private selectBottle(id: string): void {
    this.setMode('idle');
    this.selectedId = id;
    for (const [bid, bg] of this.bottleBgs) {
      const sel = bid === id;
      bg.setStrokeStyle(sel ? 4 : 2, COLORS.accent, sel ? 1 : 0.22);
      bg.setFillStyle(sel ? 0x46283a : COLORS.panelLight, sel ? 1 : 0.9);
      const img = this.bottleImgs.get(bid);
      if (img) {
        this.tweens.killTweensOf(img);
        this.tweens.add({ targets: img, scale: sel ? 0.72 : 0.62, duration: 120 });
      }
    }
    this.pourBottle.setTexture(`bottle_${id}`);
    this.modeText.setText(`${GameState.ingredient(id).nameKo} 선택됨`);
  }

  private drawGlassArea(): void {
    this.liquid = this.add.graphics().setDepth(2);

    // 잔 텍스처 (액체 위에 유리 하이라이트가 겹치도록)
    const glassKey = glassTexture(this, this.recipe.glass);
    const gy = this.recipe.glass === 'rocks' ? GLASS_Y - 15 : GLASS_Y - 40;
    this.add.image(GLASS_X, gy, glassKey).setDepth(3);

    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    this.mlText = txt(this, GLASS_X, GLASS_Y + 96, `0ml / 최대 ${cap}ml`, 24, '#f2e6d0').setOrigin(0.5);
    this.modeText = txt(this, GLASS_X, GLASS_Y - 205, '', 24, '#ffd27a', { align: 'center' }).setOrigin(0.5).setDepth(6);

    // 따르는 병 + 물줄기
    this.stream = this.add.graphics().setDepth(4);
    this.pourBottle = this.add
      .image(GLASS_X + 130, GLASS_Y - 250, bottleTexture(this, 'bottle_gin', '#e8f4f0'))
      .setScale(1.1)
      .setRotation(-1.95)
      .setDepth(5)
      .setVisible(false);

    // 셰이커 / 바 스푼
    this.shaker = this.add
      .container(GLASS_X, GLASS_Y - 40, [this.add.image(0, 0, shakerTexture(this))])
      .setDepth(5)
      .setVisible(false);
    this.spoon = this.add
      .container(GLASS_X + 40, GLASS_Y - 90, [this.add.image(0, 0, spoonTexture(this))])
      .setDepth(5)
      .setVisible(false);
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
    pourBtn.container.setDepth(61);
    pourBtn.image.on('pointerdown', () => {
      this.setMode('idle');
      this.pouring = true;
    });
    const stopPour = () => (this.pouring = false);
    pourBtn.image.on('pointerup', stopPour);
    pourBtn.image.on('pointerout', stopPour);

    this.stirBtn = button(this, 300, 1130, 170, 84, '스터 🥄', () => {
      this.setMode(this.mode === 'stir' ? 'idle' : 'stir');
    }, 0x5a7a9a);
    this.stirBtn.container.setDepth(61);

    this.shakeBtn = button(this, 490, 1130, 170, 84, '셰이크 🍸', () => {
      this.setMode(this.mode === 'shake' ? 'idle' : 'shake');
    }, 0x9a5a7a);
    this.shakeBtn.container.setDepth(61);

    // 가니시 (보유 시)
    const mintStock = GameState.stockOf('mint');
    const mintBtn = button(this, 645, 1130, 120, 84, '민트 🌿', () => {
      if (GameState.stockOf('mint') < 1 || this.garnishes.has('mint')) return;
      GameState.consume('mint', 1);
      this.garnishes.add('mint');
      this.redrawLiquid();
    }, 0x48a848);
    mintBtn.container.setDepth(61);
    if (mintStock < 1) mintBtn.setEnabled(false);

    button(this, 180, 1226, 200, 70, '버리기 🗑', () => this.discard(), 0x8a4a3a).container.setDepth(61);
    button(this, 500, 1226, 380, 70, '서빙하기 ✅', () => this.serve(), COLORS.ok).container.setDepth(61);
  }

  private setMode(mode: MixMode): void {
    if (this.finished) return;
    this.mode = mode;
    this.pouring = false;
    this.shaker.setVisible(mode === 'shake');
    this.spoon.setVisible(mode === 'stir');
    this.stirBtn.setToggled(mode === 'stir');
    this.shakeBtn.setToggled(mode === 'shake');
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
    let pouredNow = false;
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
        pouredNow = true;
      }
    }
    this.updatePourVisual(pouredNow);

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
        GLASS_Y - 90 + Math.sin(this.stir.activeSeconds * 6) * 12,
      );
      this.modeText.setText(`스터 ${this.stir.activeSeconds.toFixed(1)}초 — 원을 그리세요`);
    }

    this.refreshTexts();
  }

  private updatePourVisual(active: boolean): void {
    this.stream.clear();
    if (!active || !this.selectedId) {
      this.pourBottle.setVisible(false);
      return;
    }
    this.pourBottle.setVisible(true);
    // 병 입구에서 잔 수면까지 물줄기
    const color = Phaser.Display.Color.HexStringToColor(GameState.ingredient(this.selectedId).color).color;
    const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    const frac = Math.min(1, this.totalMl() / cap);
    const surfaceY = GLASS_Y + geom.bottom - geom.maxH * frac;
    const mouthX = GLASS_X + 52;
    const mouthY = GLASS_Y - 215;
    this.stream.lineStyle(7, color, 0.85);
    this.stream.lineBetween(mouthX, mouthY, GLASS_X + 4, surfaceY);
    this.stream.fillStyle(color, 0.5);
    this.stream.fillCircle(GLASS_X + 4, surfaceY, 9);
    // 병 살짝 흔들림
    this.pourBottle.setRotation(-1.95 + Math.sin(this.mixSeconds * 10) * 0.03);
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
      t.setColor(state === 'ok' ? '#7fdc8a' : state === 'over' ? '#ff8a8a' : '#f2e6d0');
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
    const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;

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
    const base = Phaser.Display.Color.GetColor(r / total, gr / total, b / total);
    const lighter = Phaser.Display.Color.GetColor(
      Math.min(255, (r / total) * 1.25 + 20),
      Math.min(255, (gr / total) * 1.25 + 20),
      Math.min(255, (b / total) * 1.25 + 20),
    );

    const bottomY = GLASS_Y + geom.bottom;
    if (geom.kind === 'rect') {
      const h = geom.maxH * frac;
      this.liquid.fillStyle(base, 0.9);
      this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - h, geom.halfW * 2, h);
      // 표면 밝은 띠
      this.liquid.fillStyle(lighter, 0.9);
      this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - h, geom.halfW * 2, Math.min(10, h));
    } else {
      const h = geom.maxH * frac;
      const halfW = geom.halfW * (h / geom.maxH);
      this.liquid.fillStyle(base, 0.9);
      this.liquid.fillTriangle(GLASS_X, bottomY, GLASS_X - halfW, bottomY - h, GLASS_X + halfW, bottomY - h);
      this.liquid.fillStyle(lighter, 0.9);
      this.liquid.fillRect(GLASS_X - halfW, bottomY - h, halfW * 2, Math.min(8, h));
    }

    if (this.garnishes.has('mint')) {
      const topY = geom.kind === 'rect' ? bottomY - geom.maxH - 8 : bottomY - geom.maxH - 12;
      this.liquid.fillStyle(0x48a848, 1);
      this.liquid.fillCircle(GLASS_X + 30, topY, 12);
      this.liquid.fillCircle(GLASS_X + 44, topY - 8, 9);
      this.liquid.fillStyle(0x66c866, 1);
      this.liquid.fillCircle(GLASS_X + 36, topY - 4, 6);
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
    this.pouring = false;
    this.stream.clear();
    this.pourBottle.setVisible(false);
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
      const color = line.ratio >= 0.9 ? '#7fdc8a' : line.ratio >= 0.5 ? '#ffd27a' : '#ff8a8a';
      overlay.add(txt(this, W / 2 - 260, y, line.label, 24, color));
      overlay.add(txt(this, W / 2 + 260, y, line.detail, 24, color).setOrigin(1, 0));
    });

    const payY = startY + 110 + lines.length * 44;
    overlay.add(
      txt(this, W / 2, payY, `대금 ${formatMoney(base)}  +  팁 ${formatMoney(tip)}`, 30, '#7fdc8a', {
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
