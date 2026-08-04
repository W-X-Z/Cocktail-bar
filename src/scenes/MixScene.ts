import Phaser from 'phaser';
import { GameState } from '../systems/GameState';
import { settle } from '../systems/OrderSystem';
import { iceExpectation, scoreMix } from '../systems/RecipeSystem';
import { PourController } from '../systems/PourController';
import { ShakeDetector } from '../systems/ShakeDetector';
import { StirDetector } from '../systems/StirDetector';
import type { Ingredient, MixAction, Recipe, Vessel } from '../systems/types';
import {
  bottleTexture,
  counterTexture,
  glassTexture,
  glowTexture,
  shakerTexture,
  spoonTexture,
  vignetteTexture,
} from '../ui/art';
import { button, COLORS, H, panel, txt, W, type Btn } from '../ui/theme';

interface MixSceneData {
  recipeId: string;
  tipEligible: boolean;
  patience: number;
  seatIndex: number;
  tipMul: number;
}

type MixMode = 'idle' | 'pour' | 'stir' | 'shake';

const GLASS_CAPACITY: Record<string, number> = {
  highball: 260,
  rocks: 200,
  coupe: 160,
  martini: 160,
  margarita: 200,
};
const SHAKER_CAPACITY = 260;

/** 최대 기울기에서의 유량 (ml/s) */
const MAX_POUR_RATE_MLPS = 80;
const GLASS_X = 240;
const GLASS_Y = 850;

/** 잔 종류별 액체 지오메트리 (glassTexture와 1:1 정렬) */
const LIQUID_GEOM: Record<string, { kind: 'rect' | 'tri'; halfW: number; bottom: number; maxH: number }> = {
  highball: { kind: 'rect', halfW: 64, bottom: 62, maxH: 200 },
  rocks: { kind: 'rect', halfW: 78, bottom: 56, maxH: 140 },
  coupe: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
  martini: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
  margarita: { kind: 'tri', halfW: 84, bottom: -38, maxH: 96 },
};

interface CheckItem {
  t: Phaser.GameObjects.Text;
  base: string;
  state: () => 'todo' | 'ok' | 'over';
}

/** POV 조주 씬 — 레시피에 따라 셰이커 조리 → 잔에 따르기, 얼음, 잔 선택이 달라진다 */
export class MixScene extends Phaser.Scene {
  private recipe!: Recipe;
  private sceneData!: MixSceneData;

  private mode: MixMode = 'idle';
  private selectedId: string | null = null;
  private poured = new Map<string, number>();
  private pourOrder: string[] = [];
  private garnishes = new Set<string>();
  private icedVessels = new Set<Vessel>();
  private transferred = false;
  private transferAnimT = 1;
  private transferring = false;
  private mixSeconds = 0;
  private finished = false;
  private isShake = false;
  private shelfBottomY = 400;

  private pour = new PourController();
  private shake = new ShakeDetector();
  private stir = new StirDetector();

  private liquid!: Phaser.GameObjects.Graphics;
  private stream!: Phaser.GameObjects.Graphics;
  private pourBottle!: Phaser.GameObjects.Image;
  private glassImg!: Phaser.GameObjects.Image;
  private shakerImg!: Phaser.GameObjects.Image;
  private spoon!: Phaser.GameObjects.Container;
  private mlText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private checkItems: CheckItem[] = [];
  private stockTexts = new Map<string, Phaser.GameObjects.Text>();
  private bottleBgs = new Map<string, Phaser.GameObjects.Rectangle>();
  private bottleImgs = new Map<string, Phaser.GameObjects.Image>();
  private pourBtn!: Btn;
  private stirBtn!: Btn;
  private shakeBtn!: Btn;
  private iceBtn!: Btn;
  private transferBtn: Btn | null = null;

  constructor() {
    super('Mix');
  }

  init(data: MixSceneData): void {
    this.sceneData = data;
    this.recipe = GameState.recipe(data.recipeId);
    this.isShake = this.recipe.method === 'shake';
    this.mode = 'idle';
    this.selectedId = null;
    this.poured = new Map();
    this.pourOrder = [];
    this.garnishes = new Set();
    this.icedVessels = new Set();
    this.transferred = false;
    this.transferAnimT = 1;
    this.transferring = false;
    this.mixSeconds = 0;
    this.finished = false;
    this.pour = new PourController();
    this.shake = new ShakeDetector();
    this.stir = new StirDetector();
    this.checkItems = [];
    this.stockTexts = new Map();
    this.bottleBgs = new Map();
    this.bottleImgs = new Map();
    this.transferBtn = null;
  }

  /** 현재 붓는 대상 용기 */
  private vessel(): Vessel {
    return this.isShake && !this.transferred ? 'shaker' : 'glass';
  }

  private vesselCapacity(): number {
    return this.vessel() === 'shaker' ? SHAKER_CAPACITY : GLASS_CAPACITY[this.recipe.glass] ?? 200;
  }

  create(): void {
    this.add.rectangle(W / 2, H / 2, W, H, 0x160a10);
    this.add
      .image(W / 2, 420, glowTexture(this))
      .setScale(3.6, 2.2)
      .setTint(0x8a4a2a)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.add.image(W / 2, 1024, counterTexture(this, 'mix_counter', W, 512)).setDisplaySize(W, 512);
    this.add.rectangle(W / 2, 764, W, 14, COLORS.woodLight).setStrokeStyle(2, 0x000000, 0.4);
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

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (
        this.mode === 'pour' &&
        !this.transferring &&
        p.y > Math.max(620, this.shelfBottomY + 12) &&
        p.y < 1080
      ) {
        this.pour.pressing = true;
      }
    });
    this.input.on('pointerup', () => (this.pour.pressing = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'stir') this.stir.pointerMove(p.x, p.y, p.isDown);
      else if (this.mode === 'shake') this.shake.pointerMove(p.x, p.isDown);
    });

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shake.stop();
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
      `${this.recipe.name} · ${this.methodLabel()} · ${this.glassLabel()} 글라스${this.isShake ? ' · 셰이커 조리' : ''}`,
      22,
      '#b09070',
    ).setDepth(61);
    button(this, W - 90, 70, 130, 70, '돌아가기', () => this.cancel(), 0x8a5a2e).container.setDepth(61);
  }

  private methodLabel(): string {
    return { build: '빌드', stir: '스터', shake: '셰이크' }[this.recipe.method];
  }

  private glassLabel(): string {
    return { highball: '하이볼', rocks: '락', coupe: '쿠페', martini: '마티니', margarita: '마가리타' }[
      this.recipe.glass
    ];
  }

  private ownedPourables(): Ingredient[] {
    return GameState.ingredients.filter((i) => i.type !== 'garnish' && GameState.stockOf(i.id) > 0);
  }

  private drawShelf(): void {
    txt(this, 40, 142, '선반 — 보틀 선택 후 [따르기]를 켜고 병을 꾹 누르세요', 20, '#b09070');
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
    this.shelfBottomY = 235 + (Math.ceil(items.length / cols) - 1) * 118 + 54;
  }

  private selectBottle(id: string): void {
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
    if (this.mode !== 'pour') this.setMode('idle');
    this.modeText.setText(`${GameState.ingredient(id).nameKo} 선택됨`);
  }

  private drawGlassArea(): void {
    this.liquid = this.add.graphics().setDepth(2);

    const glassKey = glassTexture(this, this.recipe.glass);
    const gy = this.recipe.glass === 'rocks' ? GLASS_Y - 15 : GLASS_Y - 40;
    this.glassImg = this.add.image(GLASS_X, gy, glassKey).setDepth(3);

    // 셰이크 레시피: 셰이커가 메인 용기, 잔은 따르기 전까지 옆에 대기
    this.shakerImg = this.add.image(GLASS_X, GLASS_Y - 40, shakerTexture(this)).setDepth(4);
    if (this.isShake) {
      this.glassImg.setPosition(600, GLASS_Y + 10).setScale(0.5).setAlpha(0.75);
    } else {
      this.shakerImg.setVisible(false);
    }

    this.mlText = txt(this, GLASS_X, GLASS_Y + 96, '', 24, '#f2e6d0').setOrigin(0.5);
    this.modeText = txt(this, GLASS_X, GLASS_Y - 215, '', 24, '#ffd27a', { align: 'center' }).setOrigin(0.5).setDepth(6);

    this.stream = this.add.graphics().setDepth(5);
    this.pourBottle = this.add
      .image(GLASS_X + 140, GLASS_Y - 245, bottleTexture(this, 'bottle_gin', '#e8f4f0'))
      .setScale(1.1)
      .setDepth(6)
      .setVisible(false);

    this.spoon = this.add
      .container(GLASS_X + 40, GLASS_Y - 90, [this.add.image(0, 0, spoonTexture(this))])
      .setDepth(6)
      .setVisible(false);
  }

  private drawChecklist(): void {
    const x = 460;
    let y = 660;
    txt(this, x, y, '레시피', 26, '#e8a33d', { fontStyle: 'bold' });
    y += 40;

    const addItem = (base: string, state: () => 'todo' | 'ok' | 'over') => {
      const t = txt(this, x, y, `· ${base}`, 22, '#f2e6d0');
      this.checkItems.push({ t, base, state });
      y += 34;
    };

    // 얼음 (레시피 파생)
    const iceExp = iceExpectation(this.recipe);
    if (iceExp !== 'none') {
      addItem(`얼음 → ${iceExp === 'shaker' ? '셰이커' : '잔'}`, () =>
        this.icedVessels.has(iceExp) ? 'ok' : 'todo',
      );
    }

    for (const step of this.recipe.steps) {
      if (step.action === 'pour' && step.ingredient) {
        const ing = step.ingredient;
        const target = step.amountMl ?? 0;
        addItem(`${GameState.ingredient(ing).nameKo} ${target}ml`, () => {
          const actual = this.poured.get(ing) ?? 0;
          if (actual > target * 1.2) return 'over';
          if (actual >= target * 0.9) return 'ok';
          return 'todo';
        });
      } else if (step.action === 'stir') {
        const target = step.seconds ?? 0;
        addItem(`스터 ${target}초`, () => (this.stir.activeSeconds >= target * 0.75 ? 'ok' : 'todo'));
      } else if (step.action === 'shake') {
        const target = step.seconds ?? 0;
        addItem(`셰이크 ${target}초`, () => (this.shake.activeSeconds >= target * 0.75 ? 'ok' : 'todo'));
      } else if (step.action === 'garnish' && step.ingredient) {
        const ing = step.ingredient;
        addItem(`가니시: ${GameState.ingredient(ing).nameKo}`, () => (this.garnishes.has(ing) ? 'ok' : 'todo'));
      }
    }

    if (this.isShake) {
      addItem('잔에 따르기', () => (this.transferred ? 'ok' : 'todo'));
    }
  }

  private drawActions(): void {
    this.pourBtn = button(this, 95, 1130, 150, 84, '따르기 🫗', () => {
      this.setMode(this.mode === 'pour' ? 'idle' : 'pour');
    }, COLORS.accent);
    this.pourBtn.container.setDepth(61);

    this.iceBtn = button(this, 235, 1130, 110, 84, '얼음 🧊', () => this.addIce(), 0x6a9ab8);
    this.iceBtn.container.setDepth(61);

    this.stirBtn = button(this, 365, 1130, 130, 84, '스터 🥄', () => {
      this.setMode(this.mode === 'stir' ? 'idle' : 'stir');
    }, 0x5a7a9a);
    this.stirBtn.container.setDepth(61);

    this.shakeBtn = button(this, 515, 1130, 150, 84, '셰이크 🍸', () => {
      this.setMode(this.mode === 'shake' ? 'idle' : 'shake');
    }, 0x9a5a7a);
    this.shakeBtn.container.setDepth(61);

    const mintStock = GameState.stockOf('mint');
    const mintBtn = button(this, 650, 1130, 100, 84, '🌿', () => {
      if (GameState.stockOf('mint') < 1 || this.garnishes.has('mint')) return;
      GameState.consume('mint', 1);
      this.garnishes.add('mint');
      this.redrawLiquid();
    }, 0x48a848);
    mintBtn.container.setDepth(61);
    if (mintStock < 1) mintBtn.setEnabled(false);

    button(this, 90, 1226, 140, 70, '버리기', () => this.discard(), 0x8a4a3a).container.setDepth(61);
    if (this.isShake) {
      this.transferBtn = button(this, 305, 1226, 210, 70, '잔에 따르기 🥂', () => this.transfer(), 0xb8863a);
      this.transferBtn.container.setDepth(61);
    }
    button(this, this.isShake ? 575 : 470, 1226, this.isShake ? 250 : 380, 70, '서빙하기 ✅', () => this.serve(), COLORS.ok)
      .container.setDepth(61);
  }

  private addIce(): void {
    if (this.transferring || this.finished) return;
    const v = this.vessel();
    if (this.icedVessels.has(v)) {
      this.modeText.setText('얼음은 이미 넣었어요');
      return;
    }
    this.icedVessels.add(v);
    this.modeText.setText(v === 'shaker' ? '셰이커에 얼음 추가!' : '잔에 얼음 추가!');
    this.redrawLiquid();
    // 얼음 떨어지는 잔출렁 연출
    const target = v === 'shaker' ? this.shakerImg : this.glassImg;
    this.tweens.add({ targets: target, y: target.y + 4, duration: 70, yoyo: true, repeat: 1 });
  }

  /** 셰이커 → 잔으로 옮겨 붓기 (스트레인) */
  private transfer(): void {
    if (!this.isShake || this.transferred || this.transferring || this.finished) return;
    if (this.totalMl() <= 0) {
      this.modeText.setText('셰이커가 비어 있어요');
      return;
    }
    this.transferring = true;
    this.setMode('idle');
    this.modeText.setText('잔에 따르는 중…');

    // 잔이 중앙으로, 셰이커는 좌측 위에서 기울인다
    this.tweens.add({
      targets: this.glassImg,
      x: GLASS_X,
      y: this.recipe.glass === 'rocks' ? GLASS_Y - 15 : GLASS_Y - 40,
      scale: 1,
      alpha: 1,
      duration: 350,
    });
    this.tweens.add({
      targets: this.shakerImg,
      x: 130,
      y: 610,
      rotation: -1.9,
      duration: 380,
      onComplete: () => {
        this.transferred = true; // 이후 잔이 대상 용기
        this.transferAnimT = 0;
        this.tweens.add({
          targets: this,
          transferAnimT: 1,
          duration: 1000,
          onUpdate: () => this.redrawLiquid(),
          onComplete: () => {
            this.transferring = false;
            this.stream.clear();
            this.modeText.setText('완성까지 조금 더!');
            this.tweens.add({ targets: this.shakerImg, alpha: 0.3, scale: 0.8, x: 90, y: 660, rotation: -0.4, duration: 400 });
          },
        });
      },
    });
  }

  private setMode(mode: MixMode): void {
    if (this.finished || this.transferring) return;
    this.mode = mode;
    this.pour.pressing = false;
    this.spoon.setVisible(mode === 'stir');
    this.pourBottle.setVisible(mode === 'pour' && !!this.selectedId);
    this.pourBtn.setToggled(mode === 'pour');
    this.stirBtn.setToggled(mode === 'stir');
    this.shakeBtn.setToggled(mode === 'shake');
    if (mode !== 'pour') this.stream.clear();
    if (mode === 'pour') {
      this.modeText.setText(
        this.selectedId
          ? '병을 꾹~ 누르면 기울어져요\n떼도 잠깐 더 나오니 미리 놓으세요!'
          : '먼저 선반에서 보틀을 고르세요',
      );
    } else if (mode === 'shake') {
      void this.shake.start();
      this.modeText.setText(
        this.vessel() === 'shaker'
          ? '휴대폰을 흔드세요!\n(데스크톱: 화면을 빠르게 문지르기)'
          : '휴대폰을 흔드세요!',
      );
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

    // 프레스&홀드 붓기 (+관성)
    if (this.mode === 'pour' && this.selectedId && !this.transferring) {
      this.pour.update(dt);
      const flow = this.pour.flow;
      let pouredNow = false;
      if (flow > 0) {
        const stock = GameState.stockOf(this.selectedId);
        const room = this.vesselCapacity() - this.totalMl();
        const amount = Math.min(MAX_POUR_RATE_MLPS * flow * dt, stock, room);
        if (amount > 0) {
          if (!this.poured.has(this.selectedId)) this.pourOrder.push(this.selectedId);
          this.poured.set(this.selectedId, (this.poured.get(this.selectedId) ?? 0) + amount);
          GameState.consume(this.selectedId, amount);
          this.redrawLiquid();
          pouredNow = true;
        }
      }
      this.updatePourVisual(pouredNow);
      const deg = Math.round(this.pour.angle);
      if (this.pour.pressing || this.pour.angle > 0) {
        this.modeText.setText(flow > 0 ? `따르는 중! ${deg}°` : `기울이는 중… ${deg}°`);
      }
    } else if (this.mode !== 'pour') {
      // 붓기 모드가 아니면 병 각도 초기화
      if (this.pour.angle > 0) this.pour.update(dt);
    }

    // 셰이킹 (셰이커/잔 위에서)
    if (this.mode === 'shake') {
      this.shake.update(deltaMs);
      const target = this.isShake && !this.transferred ? this.shakerImg : this.shakerImg;
      if (!this.isShake) this.shakerImg.setVisible(true).setDepth(5);
      if (this.shake.isShaking) {
        target.setPosition(GLASS_X + Phaser.Math.Between(-14, 14), GLASS_Y - 40 + Phaser.Math.Between(-18, 18));
        target.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
      } else if (!this.transferring && !this.transferred) {
        target.setPosition(GLASS_X, GLASS_Y - 40).setRotation(0);
      }
      this.modeText.setText(
        `셰이킹 ${this.shake.activeSeconds.toFixed(1)}초` +
          (this.shake.isShaking ? ' 🔥' : '\n휴대폰을 흔드세요! (데스크톱: 화면 문지르기)'),
      );
    } else if (!this.isShake) {
      this.shakerImg.setVisible(false);
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

  /** 병 기울기 + 곡선 물줄기/물방울/스플래시 */
  private updatePourVisual(active: boolean): void {
    this.stream.clear();
    if (this.mode !== 'pour' || !this.selectedId) {
      this.pourBottle.setVisible(false);
      return;
    }
    this.pourBottle.setVisible(true);

    const t = this.pour.angle / PourController.MAX_DEG;
    this.pourBottle.setRotation(-0.35 - t * 1.65);
    // 기울수록 병이 잔 쪽으로 당겨진다
    this.pourBottle.setPosition(GLASS_X + 140 - t * 46, GLASS_Y - 245 - t * 8);

    if (!active) return;

    const flow = this.pour.flow;
    const color = Phaser.Display.Color.HexStringToColor(GameState.ingredient(this.selectedId).color).color;

    // 병 입구 위치 (회전 근사)
    const mx = GLASS_X + 84 - t * 52;
    const my = GLASS_Y - 255 + t * 34;
    // 착지점: 현재 용기의 수면
    let tx = GLASS_X;
    let ty: number;
    if (this.vessel() === 'shaker') {
      ty = GLASS_Y - 168; // 셰이커 입구
    } else {
      const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;
      const cap = this.vesselCapacity();
      const frac = Math.min(1, this.totalMl() / cap);
      ty = GLASS_Y + geom.bottom - geom.maxH * frac;
    }

    // 곡선 물줄기: 포물선 + 흔들림
    const time = this.mixSeconds;
    const pts: Array<[number, number]> = [];
    const SEG = 14;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      // 수평 성분은 초반에 빨리 소진, 수직 낙하 가속 (포물선 느낌)
      const px = mx + (tx - mx) * (1 - (1 - s) * (1 - s));
      const py = my + (ty - my) * (s * s * 0.55 + s * 0.45);
      const wobble = Math.sin(time * 18 + s * 9) * 2.2 * s * flow;
      pts.push([px + wobble, py]);
    }
    for (let i = 0; i < SEG; i++) {
      const wStart = 3 + flow * 6;
      const w = wStart * (1 - (i / SEG) * 0.45);
      this.stream.lineStyle(w, color, 0.8);
      this.stream.lineBetween(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
    }
    // 중심 광택
    this.stream.lineStyle(1.6, 0xffffff, 0.35);
    for (let i = 4; i < SEG; i++) {
      this.stream.lineBetween(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
    }
    // 물방울 (줄기 주변으로 떨어지는 파편)
    for (let k = 0; k < 3; k++) {
      const p = (time * 1.4 + k * 0.37) % 1;
      const s = 0.55 + p * 0.45;
      const bx = mx + (tx - mx) * (1 - (1 - s) * (1 - s)) + Math.sin(time * 9 + k * 2.4) * (7 + k * 3);
      const by = my + (ty - my) * (s * s * 0.55 + s * 0.45);
      this.stream.fillStyle(color, 0.65 * (1 - p * 0.5));
      this.stream.fillCircle(bx, by, 2.4 - k * 0.4);
    }
    // 착지 스플래시 (링 + 튀는 방울)
    const pulse = (time * 5) % 1;
    this.stream.lineStyle(2, color, 0.5 * (1 - pulse));
    this.stream.strokeEllipse(tx + 3, ty, 14 + pulse * 22, 5 + pulse * 6);
    this.stream.fillStyle(color, 0.7);
    for (let k = 0; k < 2; k++) {
      const a = time * 13 + k * 2.8;
      this.stream.fillCircle(tx + 3 + Math.cos(a) * 11, ty - 4 - Math.abs(Math.sin(a)) * 7, 1.8);
    }
  }

  private refreshTexts(): void {
    const cap = this.vesselCapacity();
    const vesselName = this.vessel() === 'shaker' ? '셰이커' : '잔';
    const ice = this.icedVessels.has(this.vessel()) ? ' · 🧊' : '';
    this.mlText.setText(`${vesselName}: ${Math.round(this.totalMl())}ml / ${cap}ml${ice}`);

    for (const [id, tObj] of this.stockTexts) {
      const ing = GameState.ingredient(id);
      const unit = ing.type === 'garnish' ? '회' : 'ml';
      tObj.setText(`${Math.round(GameState.stockOf(id))}${unit}`);
    }

    for (const item of this.checkItems) {
      const st = item.state();
      item.t.setColor(st === 'ok' ? '#7fdc8a' : st === 'over' ? '#ff8a8a' : '#f2e6d0');
      item.t.setText((st === 'ok' ? '✓ ' : st === 'over' ? '✗ ' : '· ') + item.base);
    }
  }

  private redrawLiquid(): void {
    this.liquid.clear();
    const total = this.totalMl();
    const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    const bottomY = GLASS_Y + geom.bottom;

    // 잔 속 액체는 (빌드/스터) 항상, (셰이크) 옮겨 붓기 후에만 보인다
    const glassVisibleFrac = this.isShake
      ? this.transferred
        ? Math.min(1, total / cap) * this.transferAnimT
        : 0
      : Math.min(1, total / cap);

    if (glassVisibleFrac > 0 && total > 0) {
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

      if (geom.kind === 'rect') {
        const h = geom.maxH * glassVisibleFrac;
        this.liquid.fillStyle(base, 0.9);
        this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - h, geom.halfW * 2, h);
        this.liquid.fillStyle(lighter, 0.9);
        this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - h, geom.halfW * 2, Math.min(10, h));
      } else {
        const h = geom.maxH * glassVisibleFrac;
        const halfW = geom.halfW * (h / geom.maxH);
        this.liquid.fillStyle(base, 0.9);
        this.liquid.fillTriangle(GLASS_X, bottomY, GLASS_X - halfW, bottomY - h, GLASS_X + halfW, bottomY - h);
        this.liquid.fillStyle(lighter, 0.9);
        this.liquid.fillRect(GLASS_X - halfW, bottomY - h, halfW * 2, Math.min(8, h));
      }

      // 잔 속 얼음
      if (this.icedVessels.has('glass')) {
        const h = geom.maxH * glassVisibleFrac;
        const iy = bottomY - h + 12;
        this.drawIceCube(GLASS_X - 26, iy, 20);
        this.drawIceCube(GLASS_X + 8, iy + 8, 17);
      }
    } else if (this.icedVessels.has('glass') && !this.isShake) {
      // 빈 잔에 얼음만
      this.drawIceCube(GLASS_X - 22, bottomY - 22, 20);
      this.drawIceCube(GLASS_X + 4, bottomY - 16, 17);
    }

    if (this.garnishes.has('mint')) {
      const topY = bottomY - geom.maxH - 10;
      this.liquid.fillStyle(0x48a848, 1);
      this.liquid.fillCircle(GLASS_X + 30, topY, 12);
      this.liquid.fillCircle(GLASS_X + 44, topY - 8, 9);
      this.liquid.fillStyle(0x66c866, 1);
      this.liquid.fillCircle(GLASS_X + 36, topY - 4, 6);
    }

    // 셰이커 게이지 (내용물이 안 보이므로)
    if (this.isShake && !this.transferred) {
      const gx = GLASS_X + 120;
      const gy = GLASS_Y - 60;
      const gh = 150;
      this.liquid.fillStyle(0x000000, 0.35);
      this.liquid.fillRoundedRect(gx, gy - gh / 2, 16, gh, 5);
      const frac = Math.min(1, total / SHAKER_CAPACITY);
      if (frac > 0) {
        this.liquid.fillStyle(0xc8dce8, 0.9);
        this.liquid.fillRoundedRect(gx + 3, gy + gh / 2 - gh * frac + 3, 10, Math.max(4, gh * frac - 6), 3);
      }
      if (this.icedVessels.has('shaker')) {
        this.drawIceCube(gx - 4, gy - gh / 2 - 22, 16);
      }
    }
  }

  private drawIceCube(x: number, y: number, size: number): void {
    this.liquid.fillStyle(0xdff2fa, 0.55);
    this.liquid.fillRoundedRect(x, y, size, size, 4);
    this.liquid.lineStyle(1.5, 0xffffff, 0.6);
    this.liquid.strokeRoundedRect(x, y, size, size, 4);
    this.liquid.fillStyle(0xffffff, 0.5);
    this.liquid.fillRect(x + 3, y + 3, size * 0.3, 2);
  }

  private buildActions(): MixAction[] {
    const actions: MixAction[] = [];
    for (const id of this.pourOrder) {
      actions.push({ action: 'pour', ingredient: id, amountMl: this.poured.get(id) ?? 0 });
    }
    if (this.shake.activeSeconds > 0.2) actions.push({ action: 'shake', seconds: this.shake.activeSeconds });
    if (this.stir.activeSeconds > 0.2) actions.push({ action: 'stir', seconds: this.stir.activeSeconds });
    for (const g of this.garnishes) actions.push({ action: 'garnish', ingredient: g });
    for (const v of this.icedVessels) actions.push({ action: 'ice', vessel: v });
    if (this.transferred) actions.push({ action: 'strain' });
    return actions;
  }

  private discard(): void {
    if (this.transferring) return;
    // 이미 따른 재료는 소모된다 (버리는 것도 비용)
    this.poured = new Map();
    this.pourOrder = [];
    this.garnishes = new Set();
    this.icedVessels = new Set();
    this.shake.resetSession();
    this.stir.resetSession();
    this.pour.reset();
    if (this.isShake) {
      this.transferred = false;
      this.transferAnimT = 1;
      this.tweens.killTweensOf([this.shakerImg, this.glassImg]);
      this.shakerImg.setPosition(GLASS_X, GLASS_Y - 40).setRotation(0).setAlpha(1).setScale(1);
      this.glassImg.setPosition(600, GLASS_Y + 10).setScale(0.5).setAlpha(0.75);
    }
    this.setMode('idle');
    this.liquid.clear();
    this.redrawLiquid();
  }

  private cancel(): void {
    this.scene.wake('Bar', {
      seatIndex: this.sceneData.seatIndex,
      totalPaid: 0,
      tip: 0,
      scoreTotal: 0,
      cancelled: true,
    });
    this.scene.stop();
  }

  /** 서빙 → 채점 후 바로 메인 씬으로 (반응은 BarScene에서 연출) */
  private serve(): void {
    if (this.finished || this.transferring) return;
    this.finished = true;

    const score = scoreMix(this.recipe, this.buildActions());
    const patience = this.sceneData.patience - this.mixSeconds / 150;
    const pay = settle(this.recipe, score, patience, this.sceneData.tipEligible, this.sceneData.tipMul ?? 1);
    GameState.earn(pay.total);

    const worstLines = [...score.lines].sort((a, b) => a.ratio - b.ratio).slice(0, 3);

    this.scene.wake('Bar', {
      seatIndex: this.sceneData.seatIndex,
      totalPaid: pay.total,
      tip: pay.tip,
      scoreTotal: score.total,
      recipeName: this.recipe.nameKo,
      worstLines,
    });
    this.scene.stop();
  }
}
