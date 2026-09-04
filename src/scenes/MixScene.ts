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
  citrusBoardTexture,
  counterTexture,
  glassTexture,
  glowTexture,
  iceBucketTexture,
  mintPotTexture,
  shakerTexture,
  spoonTexture,
  toolJarTexture,
  towelTexture,
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

type MixMode = 'idle' | 'stir' | 'shake';

const GLASS_CAPACITY: Record<string, number> = {
  highball: 260,
  rocks: 200,
  coupe: 160,
  martini: 160,
  margarita: 200,
};
const SHAKER_CAPACITY = 260;
const MAX_POUR_RATE_MLPS = 80;
const GLASS_X = 240;
const GLASS_Y = 850;

const LIQUID_GEOM: Record<string, { kind: 'rect' | 'tri'; halfW: number; bottom: number; maxH: number }> = {
  highball: { kind: 'rect', halfW: 64, bottom: 62, maxH: 200 },
  rocks: { kind: 'rect', halfW: 78, bottom: 56, maxH: 140 },
  coupe: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
  martini: { kind: 'tri', halfW: 88, bottom: -16, maxH: 112 },
  margarita: { kind: 'tri', halfW: 84, bottom: -38, maxH: 96 },
};

const GARNISH_SHORT: Record<string, string> = {
  lemon_slice: '레몬',
  lime_wedge: '라임',
  orange_slice: '오렌지',
  cherry: '체리',
  olive: '올리브',
  mint: '민트',
};

interface CheckItem {
  t: Phaser.GameObjects.Text;
  base: string;
  state: () => 'todo' | 'ok' | 'over';
}

/**
 * POV 조주 씬 — 버튼 대신 카운터 위 도구를 직접 만진다:
 * 보틀 선택 후 꾹 누르면 붓기, 도구통(스푼) 탭 → 스터, 얼음통 탭 → 얼음,
 * 민트 화분 탭 → 가니시, 셰이커 짧게 탭 → 셰이킹.
 */
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
  private pressDownAt = 0;
  private pressOnShaker = false;

  private pour = new PourController();
  private shake = new ShakeDetector();
  private stir = new StirDetector();

  private liquid!: Phaser.GameObjects.Graphics;
  private stream!: Phaser.GameObjects.Graphics;
  private pourBottle!: Phaser.GameObjects.Image;
  private glassImg!: Phaser.GameObjects.Image;
  private shakerImg!: Phaser.GameObjects.Image;
  private miniShaker!: Phaser.GameObjects.Image;
  private toolJar!: Phaser.GameObjects.Image;
  private iceBucket!: Phaser.GameObjects.Image;
  private mintPot!: Phaser.GameObjects.Image;
  private spoon!: Phaser.GameObjects.Container;
  private mlText!: Phaser.GameObjects.Text;
  private checkItems: CheckItem[] = [];
  private stockTexts = new Map<string, Phaser.GameObjects.Text>();
  private bottleBgs = new Map<string, Phaser.GameObjects.Rectangle>();
  private bottleImgs = new Map<string, Phaser.GameObjects.Image>();
  private recipeOverlay!: Phaser.GameObjects.Container;
  private transferBtn: Btn | null = null;
  private props: Phaser.GameObjects.Image[] = [];
  private shakerLabel: Phaser.GameObjects.Text | null = null;
  private garnishPicker: Phaser.GameObjects.Container | null = null;
  private recipeViewed = false;

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
    this.props = [];
    this.shakerLabel = null;
    this.garnishPicker = null;
    this.recipeViewed = false;
  }

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
    this.drawProps();
    this.drawActions();
    this.buildRecipeOverlay();

    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setDepth(60);

    this.stir.setCenter(GLASS_X, GLASS_Y);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPressDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPressUp(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'stir') this.stir.pointerMove(p.x, p.y, p.isDown);
      else if (this.mode === 'shake') this.shake.pointerMove(p.x, p.isDown);
    });

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.shake.stop());
  }

  /* ---------- 입력: 프레스 = 붓기 / 짧은 탭 = 소품 ---------- */

  private inWorkspace(p: Phaser.Input.Pointer): boolean {
    return p.y > Math.max(600, this.shelfBottomY + 12) && p.y < 1150;
  }

  private overProp(p: Phaser.Input.Pointer): boolean {
    return this.props.some((im) => im.visible && im.getBounds().contains(p.x, p.y));
  }

  private onPressDown(p: Phaser.Input.Pointer): void {
    if (this.garnishPicker) return; // 픽커 열림 중에는 붓기 입력 무시
    if (this.finished || this.transferring || !this.inWorkspace(p) || this.overProp(p)) return;
    // 도구 모드 중에 빈 곳을 누르면 모드 해제
    if (this.mode !== 'idle') {
      if (this.mode === 'stir' && Math.hypot(p.x - GLASS_X, p.y - GLASS_Y) < 190) return; // 젓는 중
      if (this.mode === 'shake') return; // 문지르기 폴백 중
      this.setMode('idle');
      return;
    }
    this.pressDownAt = this.time.now;
    this.pressOnShaker =
      this.isShake && !this.transferred && this.shakerImg.getBounds().contains(p.x, p.y);
    if (this.selectedId) this.pour.pressing = true;
  }

  private onPressUp(p: Phaser.Input.Pointer): void {
    const wasPress = this.pour.pressing;
    this.pour.pressing = false;
    // 짧은 탭 + 거의 안 기울었으면: 셰이커 탭 → 셰이킹 모드
    if (
      wasPress &&
      this.pressOnShaker &&
      this.time.now - this.pressDownAt < 220 &&
      this.pour.angle < 14 &&
      this.shakerImg.getBounds().contains(p.x, p.y)
    ) {
      this.toggleShake();
    }
    this.pressOnShaker = false;
  }

  /* ---------- 상단 ---------- */

  private drawHeader(): void {
    panel(this, W / 2, 70, W - 30, 100).setDepth(61);
    txt(this, 40, 52, `주문: ${this.recipe.nameKo}`, 36, '#e8a33d', { fontStyle: 'bold' }).setDepth(61);
    button(this, W - 90, 70, 130, 66, '돌아가기', () => this.cancel(), 0x8a5a2e).container.setDepth(61);
  }

  private ownedPourables(): Ingredient[] {
    return GameState.ingredients.filter((i) => i.type !== 'garnish' && GameState.stockOf(i.id) > 0);
  }

  private drawShelf(): void {
    const items = this.ownedPourables();
    const cols = 4;
    const cellW = (W - 60) / cols;
    items.forEach((ing, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = 30 + cellW * col + cellW / 2;
      const y = 200 + row * 142;

      const bg = this.add
        .rectangle(x, y, cellW - 12, 132, COLORS.panelLight, 0.9)
        .setStrokeStyle(2, COLORS.accent, 0.22);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectBottle(ing.id));
      this.bottleBgs.set(ing.id, bg);

      const bottleKey = bottleTexture(this, `bottle_${ing.id}`, ing.color, ing.type !== 'mixer');
      const img = this.add.image(x - cellW / 2 + 36, y + 2, bottleKey).setScale(0.44);
      this.bottleImgs.set(ing.id, img);

      txt(this, x - cellW / 2 + 68, y - 32, ing.nameKo, 20, '#f2e6d0');
      const stockText = txt(this, x - cellW / 2 + 68, y - 2, '', 18, '#b09070');
      this.stockTexts.set(ing.id, stockText);
    });
    this.shelfBottomY = 200 + (Math.ceil(items.length / cols) - 1) * 142 + 66;
  }

  private selectBottle(id: string): void {
    this.selectedId = id;
    this.setMode('idle');
    for (const [bid, bg] of this.bottleBgs) {
      const sel = bid === id;
      bg.setStrokeStyle(sel ? 4 : 2, COLORS.accent, sel ? 1 : 0.22);
      bg.setFillStyle(sel ? 0x46283a : COLORS.panelLight, sel ? 1 : 0.9);
      const img = this.bottleImgs.get(bid);
      if (img) {
        this.tweens.killTweensOf(img);
        this.tweens.add({ targets: img, scale: sel ? 0.52 : 0.44, duration: 120 });
      }
    }
    this.pourBottle.setTexture(`bottle_${id}`);
    this.pourBottle.setVisible(true);
  }

  /* ---------- 작업대 ---------- */

  private drawGlassArea(): void {
    this.liquid = this.add.graphics().setDepth(2);

    const glassKey = glassTexture(this, this.recipe.glass);
    const gy = this.recipe.glass === 'rocks' ? GLASS_Y - 15 : GLASS_Y - 40;
    this.glassImg = this.add.image(GLASS_X, gy, glassKey).setDepth(3);

    this.shakerImg = this.add.image(GLASS_X, GLASS_Y - 40, shakerTexture(this)).setDepth(4);
    if (this.isShake) {
      this.glassImg.setPosition(600, GLASS_Y + 10).setScale(0.5).setAlpha(0.75);
    } else {
      this.shakerImg.setVisible(false);
    }

    this.mlText = txt(this, GLASS_X, GLASS_Y + 96, '', 24, '#f2e6d0').setOrigin(0.5);

    this.stream = this.add.graphics().setDepth(5);
    this.pourBottle = this.add
      .image(GLASS_X + 140, GLASS_Y - 245, bottleTexture(this, 'bottle_gin', '#e8f4f0'))
      .setScale(0.85)
      .setDepth(6)
      .setVisible(false);

    this.spoon = this.add
      .container(GLASS_X + 40, GLASS_Y - 90, [this.add.image(0, 0, spoonTexture(this))])
      .setDepth(6)
      .setVisible(false);
  }

  /** 카운터 위 도구·장식 소품 — 라벨은 레시피 문구와 같은 단어만 */
  private drawProps(): void {
    // 장식 (인터랙션 없음)
    this.add.image(120, 1030, citrusBoardTexture(this)).setDepth(2);
    this.add.image(655, 1065, towelTexture(this)).setDepth(2).setAngle(-4);

    const label = (x: number, y: number, word: string) =>
      txt(this, x, y, word, 18, '#b09070').setOrigin(0.5).setDepth(4);

    // 도구통 → 스터
    this.toolJar = this.add.image(505, 940, toolJarTexture(this)).setDepth(4);
    this.toolJar.setInteractive({ useHandCursor: true });
    this.toolJar.on('pointerdown', () => this.toggleStir());
    this.props.push(this.toolJar);
    label(505, 1022, '스터');

    // 얼음통 → 얼음
    this.iceBucket = this.add.image(615, 955, iceBucketTexture(this)).setDepth(4);
    this.iceBucket.setInteractive({ useHandCursor: true });
    this.iceBucket.on('pointerdown', () => this.addIce());
    this.props.push(this.iceBucket);
    label(615, 1022, '얼음');

    // 민트 화분 → 가니시 트레이 (레몬·라임·오렌지·체리·올리브·민트 픽커)
    this.mintPot = this.add.image(668, 862, mintPotTexture(this)).setDepth(4);
    this.mintPot.setInteractive({ useHandCursor: true });
    this.mintPot.on('pointerdown', () => this.toggleGarnishPicker());
    label(668, 798, '가니시');
    this.props.push(this.mintPot);

    // 미니 셰이커 (빌드/스터 레시피에서 실수로 흔들 수도 있게)
    this.miniShaker = this.add.image(88, 930, shakerTexture(this)).setScale(0.55).setDepth(4);
    this.miniShaker.setInteractive({ useHandCursor: true });
    this.miniShaker.on('pointerdown', () => this.toggleShake());
    if (this.isShake) {
      this.miniShaker.setVisible(false);
      this.shakerLabel = label(GLASS_X, GLASS_Y - 200, '셰이크');
    } else {
      label(88, 1018, '셰이크');
    }
    this.props.push(this.miniShaker);
  }

  private drawActions(): void {
    button(this, 95, 1210, 150, 76, '레시피 📖', () => {
      const show = !this.recipeOverlay.visible;
      if (show) this.recipeViewed = true; // 열람 시 점수 80% 보정
      this.recipeOverlay.setVisible(show);
    }, 0x5a7a9a).container.setDepth(61);

    button(this, 245, 1210, 130, 76, '버리기', () => this.discard(), 0x8a4a3a).container.setDepth(61);

    if (this.isShake) {
      this.transferBtn = button(this, 425, 1210, 200, 76, '잔에 따르기 🥂', () => this.transfer(), 0xb8863a);
      this.transferBtn.container.setDepth(61);
      button(this, 615, 1210, 170, 76, '서빙 ✅', () => this.serve(), COLORS.ok).container.setDepth(61);
    } else {
      button(this, 535, 1210, 340, 76, '서빙하기 ✅', () => this.serve(), COLORS.ok).container.setDepth(61);
    }
  }

  /* ---------- 도구 인터랙션 ---------- */

  private toggleStir(): void {
    if (this.finished || this.transferring) return;
    this.setMode(this.mode === 'stir' ? 'idle' : 'stir');
    this.pulse(this.toolJar);
  }

  private toggleShake(): void {
    if (this.finished || this.transferring) return;
    this.setMode(this.mode === 'shake' ? 'idle' : 'shake');
    if (this.mode === 'shake') void this.shake.start();
    this.pulse(this.isShake ? this.shakerImg : this.miniShaker);
  }

  private addIce(): void {
    if (this.transferring || this.finished) return;
    const v = this.vessel();
    if (this.icedVessels.has(v)) {
      this.shakeHead(this.iceBucket);
      return;
    }
    this.icedVessels.add(v);
    this.pulse(this.iceBucket);
    // 얼음이 용기로 날아가는 연출
    const cube = this.add.rectangle(615, 930, 30, 30, 0xdff2fa, 0.9).setStrokeStyle(2, 0xffffff, 0.7).setDepth(7);
    const targetX = v === 'shaker' ? GLASS_X : GLASS_X;
    const targetY = v === 'shaker' ? GLASS_Y - 150 : GLASS_Y - 40;
    this.tweens.add({
      targets: cube,
      x: targetX,
      y: targetY,
      angle: 220,
      duration: 380,
      ease: 'Quad.in',
      onComplete: () => {
        cube.destroy();
        this.redrawLiquid();
        const vesselImg = v === 'shaker' ? this.shakerImg : this.glassImg;
        this.tweens.add({ targets: vesselImg, y: vesselImg.y + 4, duration: 70, yoyo: true, repeat: 1 });
      },
    });
  }

  /** 가니시 픽커 열기/닫기 — 보유한 가니시를 골라 잔에 얹는다 */
  private toggleGarnishPicker(): void {
    if (this.finished || this.transferring) return;
    this.pulse(this.mintPot);
    if (this.garnishPicker) {
      this.closeGarnishPicker();
      return;
    }
    const items = GameState.ingredients.filter((i) => i.type === 'garnish');
    const c = this.add.container(0, 0).setDepth(30);

    // 뒤 배경 탭 → 닫기 (아래 소품/붓기 입력 차단)
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.25);
    backdrop.setInteractive();
    backdrop.on('pointerdown', () => this.closeGarnishPicker());
    c.add(backdrop);

    const cols = 3;
    const bw = 120;
    const bh = 66;
    const gap = 8;
    const x0 = W / 2 - ((bw + gap) * cols - gap) / 2;
    const y0 = 600;
    items.forEach((ing, i) => {
      const bx = x0 + (i % cols) * (bw + gap) + bw / 2;
      const by = y0 + Math.floor(i / cols) * (bh + gap);
      const stock = GameState.stockOf(ing.id);
      const usable = stock >= 1 && !this.garnishes.has(ing.id);

      const bg = this.add.rectangle(bx, by, bw, bh, 0x2a1620, 0.97).setStrokeStyle(2, COLORS.accent, usable ? 0.6 : 0.2);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.addGarnish(ing.id));
      const color = Phaser.Display.Color.HexStringToColor(ing.color).color;
      const dot = this.add.circle(bx - bw / 2 + 20, by, 11, color).setStrokeStyle(2, 0xffffff, 0.4);
      const name = txt(this, bx - bw / 2 + 38, by - 15, GARNISH_SHORT[ing.id] ?? ing.nameKo, 19, '#f2e6d0');
      const cnt = txt(this, bx - bw / 2 + 38, by + 8, `${Math.round(stock)}회`, 15, '#9a8a7a');
      if (!usable) [bg, dot, name, cnt].forEach((o) => o.setAlpha(0.35));
      c.add([bg, dot, name, cnt]);
    });
    this.garnishPicker = c;
  }

  private closeGarnishPicker(): void {
    this.garnishPicker?.destroy();
    this.garnishPicker = null;
  }

  private addGarnish(id: string): void {
    if (this.transferring || this.finished) return;
    if (GameState.stockOf(id) < 1 || this.garnishes.has(id)) {
      this.shakeHead(this.mintPot);
      return;
    }
    GameState.consume(id, 1);
    this.garnishes.add(id);
    this.closeGarnishPicker();
    const color = Phaser.Display.Color.HexStringToColor(GameState.ingredient(id).color).color;
    const dot = this.add.circle(668, 840, 10, color).setDepth(7);
    this.tweens.add({
      targets: dot,
      x: GLASS_X + 34,
      y: GLASS_Y - 150,
      duration: 420,
      ease: 'Quad.in',
      onComplete: () => {
        dot.destroy();
        this.redrawLiquid();
      },
    });
  }

  private pulse(im: Phaser.GameObjects.Image): void {
    this.tweens.killTweensOf(im);
    const s = im === this.miniShaker ? 0.55 : 1;
    im.setScale(s);
    this.tweens.add({ targets: im, scale: s * 1.12, duration: 90, yoyo: true });
  }

  private shakeHead(im: Phaser.GameObjects.Image): void {
    this.tweens.killTweensOf(im);
    const x = im.x;
    this.tweens.add({ targets: im, x: x + 5, duration: 50, yoyo: true, repeat: 3, onComplete: () => im.setX(x) });
  }

  /* ---------- 셰이커 → 잔 ---------- */

  private transfer(): void {
    if (!this.isShake || this.transferred || this.transferring || this.finished) return;
    if (this.totalMl() <= 0) {
      if (this.transferBtn) {
        const c = this.transferBtn.container;
        this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 3 });
      }
      return;
    }
    this.transferring = true;
    this.setMode('idle');
    this.shakerLabel?.setVisible(false);

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
        this.transferred = true;
        this.transferAnimT = 0;
        this.tweens.add({
          targets: this,
          transferAnimT: 1,
          duration: 1000,
          onUpdate: () => this.redrawLiquid(),
          onComplete: () => {
            this.transferring = false;
            this.stream.clear();
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
    this.toolJar.setTint(mode === 'stir' ? 0xffe0a0 : 0xffffff);
    const shakeTarget = this.isShake ? this.shakerImg : this.miniShaker;
    shakeTarget.setTint(mode === 'shake' ? 0xffe0a0 : 0xffffff);
    if (mode !== 'idle') this.stream.clear();
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
    if (this.mode === 'idle' && this.selectedId && !this.transferring) {
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
    }

    // 셰이킹
    if (this.mode === 'shake') {
      this.shake.update(deltaMs);
      const target = this.isShake && !this.transferred ? this.shakerImg : this.miniShaker;
      if (this.shake.isShaking) {
        const bx = this.isShake && !this.transferred ? GLASS_X : 88;
        const by = this.isShake && !this.transferred ? GLASS_Y - 40 : 930;
        target.setPosition(bx + Phaser.Math.Between(-12, 12), by + Phaser.Math.Between(-16, 16));
        target.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
      } else if (!this.transferring && !this.transferred) {
        if (this.isShake) this.shakerImg.setPosition(GLASS_X, GLASS_Y - 40).setRotation(0);
        else this.miniShaker.setPosition(88, 930).setRotation(0);
      }
    }

    // 스터링
    if (this.mode === 'stir') {
      this.spoon.setPosition(
        GLASS_X + Math.cos(this.stir.activeSeconds * 6) * 34,
        GLASS_Y - 90 + Math.sin(this.stir.activeSeconds * 6) * 12,
      );
    }

    this.refreshTexts();
  }

  /** 병 기울기 + 곡선 물줄기/물방울/스플래시 */
  private updatePourVisual(active: boolean): void {
    this.stream.clear();
    if (this.mode !== 'idle' || !this.selectedId) {
      return;
    }
    this.pourBottle.setVisible(true);

    const t = this.pour.angle / PourController.MAX_DEG;
    this.pourBottle.setRotation(-0.35 - t * 1.65);
    this.pourBottle.setPosition(GLASS_X + 140 - t * 46, GLASS_Y - 245 - t * 8);

    if (!active) return;

    const flow = this.pour.flow;
    const color = Phaser.Display.Color.HexStringToColor(GameState.ingredient(this.selectedId).color).color;

    const mx = GLASS_X + 84 - t * 52;
    const my = GLASS_Y - 255 + t * 34;
    const tx = GLASS_X;
    let ty: number;
    if (this.vessel() === 'shaker') {
      ty = GLASS_Y - 168;
    } else {
      const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;
      const cap = this.vesselCapacity();
      const frac = Math.min(1, this.totalMl() / cap);
      ty = GLASS_Y + geom.bottom - geom.maxH * frac;
    }

    const time = this.mixSeconds;
    const pts: Array<[number, number]> = [];
    const SEG = 14;
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const px = mx + (tx - mx) * (1 - (1 - s) * (1 - s));
      const py = my + (ty - my) * (s * s * 0.55 + s * 0.45);
      const wobble = Math.sin(time * 18 + s * 9) * 2.2 * s * flow;
      pts.push([px + wobble, py]);
    }
    for (let i = 0; i < SEG; i++) {
      const wStart = 3 + flow * 6;
      const wSeg = wStart * (1 - (i / SEG) * 0.45);
      this.stream.lineStyle(wSeg, color, 0.8);
      this.stream.lineBetween(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
    }
    this.stream.lineStyle(1.6, 0xffffff, 0.35);
    for (let i = 4; i < SEG; i++) {
      this.stream.lineBetween(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]);
    }
    for (let k = 0; k < 3; k++) {
      const p = (time * 1.4 + k * 0.37) % 1;
      const s = 0.55 + p * 0.45;
      const bx = mx + (tx - mx) * (1 - (1 - s) * (1 - s)) + Math.sin(time * 9 + k * 2.4) * (7 + k * 3);
      const by = my + (ty - my) * (s * s * 0.55 + s * 0.45);
      this.stream.fillStyle(color, 0.65 * (1 - p * 0.5));
      this.stream.fillCircle(bx, by, 2.4 - k * 0.4);
    }
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
    this.mlText.setText(`${vesselName} ${Math.round(this.totalMl())}/${cap}ml${ice}`);

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

  /* ---------- 레시피 오버레이 ---------- */

  private buildRecipeOverlay(): void {
    const entries: Array<{ base: string; state: () => 'todo' | 'ok' | 'over' }> = [];

    const iceExp = iceExpectation(this.recipe);
    if (iceExp !== 'none') {
      entries.push({
        base: `얼음 → ${iceExp === 'shaker' ? '셰이커' : '잔'}`,
        state: () => (this.icedVessels.has(iceExp) ? 'ok' : 'todo'),
      });
    }
    for (const step of this.recipe.steps) {
      if (step.action === 'pour' && step.ingredient) {
        const ing = step.ingredient;
        const target = step.amountMl ?? 0;
        entries.push({
          base: `${GameState.ingredient(ing).nameKo} ${target}ml`,
          state: () => {
            const actual = this.poured.get(ing) ?? 0;
            if (actual > target * 1.2) return 'over';
            if (actual >= target * 0.9) return 'ok';
            return 'todo';
          },
        });
      } else if (step.action === 'stir') {
        const target = step.seconds ?? 0;
        entries.push({ base: `스터 ${target}초`, state: () => (this.stir.activeSeconds >= target * 0.75 ? 'ok' : 'todo') });
      } else if (step.action === 'shake') {
        const target = step.seconds ?? 0;
        entries.push({ base: `셰이크 ${target}초`, state: () => (this.shake.activeSeconds >= target * 0.75 ? 'ok' : 'todo') });
      } else if (step.action === 'garnish' && step.ingredient) {
        const ing = step.ingredient;
        entries.push({
          base: `가니시: ${GameState.ingredient(ing).nameKo}`,
          state: () => (this.garnishes.has(ing) ? 'ok' : 'todo'),
        });
      }
    }
    if (this.isShake) {
      entries.push({ base: '잔에 따르기', state: () => (this.transferred ? 'ok' : 'todo') });
    }

    const hgt = 130 + entries.length * 38;
    const cx = 520;
    const cy = 640 + hgt / 2 - 40;
    this.recipeOverlay = this.add.container(0, 0).setDepth(62).setVisible(false);
    this.recipeOverlay.add(panel(this, cx, cy, 370, hgt));
    this.recipeOverlay.add(
      txt(this, cx, cy - hgt / 2 + 36, this.recipe.nameKo, 28, '#e8a33d', { fontStyle: 'bold' }).setOrigin(0.5),
    );
    this.recipeOverlay.add(
      txt(this, cx, cy - hgt / 2 + 68, `${this.recipe.name} · ${this.glassKo()} 글라스`, 19, '#b09070').setOrigin(0.5),
    );
    entries.forEach((e, i) => {
      const t = txt(this, cx - 160, cy - hgt / 2 + 96 + i * 38, `· ${e.base}`, 22, '#f2e6d0');
      this.recipeOverlay.add(t);
      this.checkItems.push({ t, base: e.base, state: e.state });
    });
  }

  private glassKo(): string {
    return { highball: '하이볼', rocks: '락', coupe: '쿠페', martini: '마티니', margarita: '마가리타' }[
      this.recipe.glass
    ];
  }

  /* ---------- 액체/얼음 렌더 ---------- */

  private redrawLiquid(): void {
    this.liquid.clear();
    const total = this.totalMl();
    const geom = LIQUID_GEOM[this.recipe.glass] ?? LIQUID_GEOM['rocks']!;
    const cap = GLASS_CAPACITY[this.recipe.glass] ?? 200;
    const bottomY = GLASS_Y + geom.bottom;

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
        const hh = geom.maxH * glassVisibleFrac;
        this.liquid.fillStyle(base, 0.9);
        this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - hh, geom.halfW * 2, hh);
        this.liquid.fillStyle(lighter, 0.9);
        this.liquid.fillRect(GLASS_X - geom.halfW, bottomY - hh, geom.halfW * 2, Math.min(10, hh));
      } else {
        const hh = geom.maxH * glassVisibleFrac;
        const halfW = geom.halfW * (hh / geom.maxH);
        this.liquid.fillStyle(base, 0.9);
        this.liquid.fillTriangle(GLASS_X, bottomY, GLASS_X - halfW, bottomY - hh, GLASS_X + halfW, bottomY - hh);
        this.liquid.fillStyle(lighter, 0.9);
        this.liquid.fillRect(GLASS_X - halfW, bottomY - hh, halfW * 2, Math.min(8, hh));
      }

      if (this.icedVessels.has('glass')) {
        // 수면에 뜨되, 액체가 얕으면 바닥 안착 위치 아래로는 내려가지 않게
        const hh = geom.maxH * glassVisibleFrac;
        const iy = bottomY - hh + 12;
        this.drawIceCube(GLASS_X - 38, Math.min(iy, bottomY - 38), 34);
        this.drawIceCube(GLASS_X + 4, Math.min(iy + 12, bottomY - 30), 28);
      }
    } else if (this.icedVessels.has('glass') && !this.isShake) {
      this.drawIceCube(GLASS_X - 38, bottomY - 38, 34);
      this.drawIceCube(GLASS_X + 2, bottomY - 30, 28);
    }

    if (this.garnishes.size > 0) {
      const topY = bottomY - geom.maxH - 6;
      // 첫 가니시는 림 오른쪽, 둘째는 왼쪽 (조주기능사식 슬라이스+체리 조합 대응)
      const slots = [GLASS_X + geom.halfW - 8, GLASS_X - geom.halfW + 8, GLASS_X];
      let i = 0;
      for (const g of this.garnishes) {
        this.drawGarnish(g, slots[Math.min(i, 2)]!, topY);
        i++;
      }
    }

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
        this.drawIceCube(gx - 8, gy - gh / 2 - 32, 26);
      }
    }
  }

  /** 가니시 종류별 렌더 (잔 림 기준 좌표) */
  private drawGarnish(id: string, x: number, y: number): void {
    const g = this.liquid;
    if (id === 'lemon_slice' || id === 'orange_slice' || id === 'lime_wedge') {
      const rind = { lemon_slice: 0xd8b820, orange_slice: 0xd87818, lime_wedge: 0x5a9830 }[id]!;
      const flesh = { lemon_slice: 0xf8e048, orange_slice: 0xf8a030, lime_wedge: 0x8cc848 }[id]!;
      const light = { lemon_slice: 0xfdf2b0, orange_slice: 0xffd090, lime_wedge: 0xc8e8a0 }[id]!;
      g.fillStyle(rind, 1);
      g.fillCircle(x, y - 8, 16);
      g.fillStyle(flesh, 1);
      g.fillCircle(x, y - 8, 13);
      // 과육 세그먼트
      g.lineStyle(1.6, light, 0.9);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI;
        g.lineBetween(x - Math.cos(a) * 11, y - 8 - Math.sin(a) * 11, x + Math.cos(a) * 11, y - 8 + Math.sin(a) * 11);
      }
      g.fillStyle(light, 0.9);
      g.fillCircle(x, y - 8, 3);
      // 림에 꽂힌 홈
      g.fillStyle(0x170d12, 0.55);
      g.fillRect(x - 1.5, y - 2, 3, 8);
    } else if (id === 'cherry') {
      g.lineStyle(2, 0x7a4a20, 1);
      g.lineBetween(x, y - 26, x + 6, y - 10);
      g.fillStyle(0xd02040, 1);
      g.fillCircle(x + 6, y - 6, 9);
      g.fillStyle(0xf87090, 0.9);
      g.fillCircle(x + 3, y - 9, 3);
    } else if (id === 'olive') {
      // 픽에 꽂힌 올리브
      g.lineStyle(2, 0xe8e0d0, 1);
      g.lineBetween(x - 10, y - 30, x + 8, y - 2);
      g.fillStyle(0x7a9a40, 1);
      g.fillEllipse(x, y - 14, 20, 15);
      g.fillStyle(0xa8c060, 0.8);
      g.fillEllipse(x - 3, y - 17, 7, 5);
      g.fillStyle(0xc84030, 1);
      g.fillCircle(x + 5, y - 12, 3);
    } else if (id === 'mint') {
      g.fillStyle(0x48a848, 1);
      g.fillCircle(x - 4, y - 10, 12);
      g.fillCircle(x + 10, y - 18, 9);
      g.fillStyle(0x66c866, 1);
      g.fillCircle(x + 2, y - 14, 6);
    }
  }

  private drawIceCube(x: number, y: number, size: number): void {
    this.liquid.fillStyle(0xdff2fa, 0.55);
    this.liquid.fillRoundedRect(x, y, size, size, 6);
    this.liquid.lineStyle(2, 0xffffff, 0.6);
    this.liquid.strokeRoundedRect(x, y, size, size, 6);
    this.liquid.fillStyle(0xffffff, 0.5);
    this.liquid.fillRect(x + 4, y + 4, size * 0.35, 3);
  }

  /* ---------- 마무리 ---------- */

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
      this.shakerLabel?.setVisible(true);
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

  private serve(): void {
    if (this.finished || this.transferring) return;
    this.finished = true;

    const raw = scoreMix(this.recipe, this.buildActions());
    // 레시피를 보지 않고 만들어야 만점 — 열람 시 80% 보정
    const score = this.recipeViewed ? { ...raw, total: raw.total * 0.8 } : raw;
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
      recipePeeked: this.recipeViewed,
    });
    this.scene.stop();
  }
}
