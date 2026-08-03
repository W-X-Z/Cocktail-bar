import Phaser from 'phaser';
import { bottleSizeMl, GameState } from '../systems/GameState';
import { hasAllIngredientTypes } from '../systems/RecipeSystem';
import { bottleTexture, vignetteTexture } from '../ui/art';
import { button, COLORS, formatMoney, H, panel, txt, W } from '../ui/theme';

type Tab = 'order' | 'menu';

const LIST_TOP = 330;
const LIST_BOTTOM = 1150;
const ROW_H = 96;

/** 발주(보틀 구매) + 메뉴 등록 씬 */
export class ShopScene extends Phaser.Scene {
  private tab: Tab = 'order';
  private moneyText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private contentHeight = 0;

  constructor() {
    super('Shop');
  }

  create(): void {
    this.tab = 'order';
    this.scrollY = 0;

    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    this.add.image(W / 2, H / 2, vignetteTexture(this, W, H)).setAlpha(0.6);
    panel(this, W / 2, 80, W - 30, 120);
    txt(this, 40, 52, '발주 & 메뉴 관리', 38, '#e8a33d', { fontStyle: 'bold' });
    this.moneyText = txt(this, 40, 102, '', 28, '#5fbf67', { fontStyle: 'bold' });

    button(this, W - 130, 80, 200, 80, '영업 시작 ▶', () => this.scene.start('Bar'), COLORS.ok);

    // 탭
    button(this, 190, 210, 300, 76, '📦 발주', () => this.switchTab('order'));
    button(this, 530, 210, 300, 76, '📖 메뉴 등록', () => this.switchTab('menu'), 0x5a7a9a);

    // 리스트 영역 (마스크 + 드래그 스크롤)
    this.listContainer = this.add.container(0, LIST_TOP);
    const maskShape = this.make.graphics().fillRect(0, LIST_TOP, W, LIST_BOTTOM - LIST_TOP);
    this.listContainer.setMask(maskShape.createGeometryMask());

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.scrollY = Phaser.Math.Clamp(
        this.scrollY + (p.y - p.prevPosition.y),
        Math.min(0, LIST_BOTTOM - LIST_TOP - this.contentHeight),
        0,
      );
      this.listContainer.y = LIST_TOP + this.scrollY;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(
        this.scrollY - dy * 0.5,
        Math.min(0, LIST_BOTTOM - LIST_TOP - this.contentHeight),
        0,
      );
      this.listContainer.y = LIST_TOP + this.scrollY;
    });

    txt(this, W / 2, 1210, '드래그로 스크롤 · 메뉴에 있는 술만 손님이 팁을 줍니다', 22, '#9a8a7a').setOrigin(0.5);

    this.rebuildList();
  }

  private switchTab(tab: Tab): void {
    this.tab = tab;
    this.scrollY = 0;
    this.listContainer.y = LIST_TOP;
    this.rebuildList();
  }

  private rebuildList(): void {
    this.listContainer.removeAll(true);
    if (this.tab === 'order') this.buildOrderList();
    else this.buildMenuList();
  }

  private buildOrderList(): void {
    const items = [...GameState.ingredients].sort((a, b) => a.price - b.price);
    items.forEach((ing, i) => {
      const y = i * ROW_H + ROW_H / 2;
      const row = this.add.container(0, y);
      row.add(this.add.rectangle(W / 2, 0, W - 40, ROW_H - 10, COLORS.panelLight).setStrokeStyle(1, COLORS.accent, 0.2));

      const bottleKey = bottleTexture(this, `bottle_${ing.id}`, ing.color, ing.type !== 'mixer');
      row.add(this.add.image(70, 0, bottleKey).setScale(0.55));

      const typeLabel = { spirit: '기주', liqueur: '리큐르', mixer: '믹서', garnish: '가니시', other: '기타' }[ing.type];
      row.add(txt(this, 110, -32, `${ing.nameKo}`, 26, '#f2e6d0', { fontStyle: 'bold' }));
      const unit = ing.type === 'garnish' ? '회' : 'ml';
      row.add(
        txt(this, 110, 4, `${typeLabel} · 재고 ${Math.round(GameState.stockOf(ing.id))}${unit} · 1병 ${bottleSizeMl(ing)}${unit}`, 20, '#9a8a7a'),
      );

      const affordable = GameState.money >= ing.price;
      const buy = button(
        this,
        W - 130,
        0,
        180,
        64,
        formatMoney(ing.price),
        () => {
          if (GameState.buyBottle(ing.id)) this.rebuildList();
        },
        affordable ? COLORS.accent : 0x555555,
      );
      buy.setEnabled(affordable);
      row.add(buy.container);

      this.listContainer.add(row);
    });
    this.contentHeight = items.length * ROW_H;
  }

  private buildMenuList(): void {
    const items = [...GameState.recipes].sort((a, b) => a.tier - b.tier || a.basePrice - b.basePrice);
    items.forEach((recipe, i) => {
      const y = i * (ROW_H + 14) + ROW_H / 2;
      const row = this.add.container(0, y);
      const onMenu = GameState.isOnMenu(recipe.id);
      const craftable = hasAllIngredientTypes(recipe);

      row.add(
        this.add
          .rectangle(W / 2, 0, W - 40, ROW_H + 2, onMenu ? 0x2a3a2a : COLORS.panelLight)
          .setStrokeStyle(2, onMenu ? COLORS.ok : COLORS.accent, onMenu ? 0.8 : 0.2),
      );

      row.add(txt(this, 60, -36, `${'★'.repeat(recipe.tier)} ${recipe.nameKo}`, 26, '#f2e6d0', { fontStyle: 'bold' }));

      // 필요 재료: 보유 여부 색상 표시
      const parts = recipe.steps
        .filter((s) => s.ingredient)
        .map((s) => {
          const owned = GameState.stockOf(s.ingredient!) > 0;
          return `${owned ? '✓' : '✗'}${GameState.ingredient(s.ingredient!).nameKo}`;
        });
      row.add(txt(this, 60, 0, parts.join('  '), 18, craftable ? '#9a8a7a' : '#d84343'));
      row.add(txt(this, 60, 28, `판매가 ${formatMoney(recipe.basePrice)}`, 18, '#9a8a7a'));

      const btn = button(
        this,
        W - 120,
        0,
        160,
        64,
        onMenu ? '내리기' : '등록',
        () => {
          GameState.toggleMenu(recipe.id);
          this.rebuildList();
        },
        onMenu ? 0x7a5a3a : COLORS.ok,
      );
      if (!onMenu && !craftable) btn.setEnabled(false);
      row.add(btn.container);

      this.listContainer.add(row);
    });
    this.contentHeight = items.length * (ROW_H + 14);
  }

  override update(): void {
    this.moneyText.setText(`보유 자금 ${formatMoney(GameState.money)}  ·  Day ${GameState.day}`);
  }
}
