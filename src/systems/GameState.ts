import ingredientsJson from '../data/ingredients.json';
import recipesJson from '../data/recipes.json';
import type { Ingredient, Recipe } from './types';

const SAVE_PREFIX = 'cocktail-bar-save-v2-slot';
export const SLOT_COUNT = 3;

/**
 * 하루 영업 종료 시 차감되는 운영비 (임대료·공과금·잡비).
 * 시세 조사(docs/01-research.md): 실제 소형 1인 바는 일 9.6만~14.6만이지만
 * 게임은 하루 6~10잔 규모라 60~70% 수준으로 낮춰 밸런싱.
 */
export const DAILY_OPERATING_COST = 50000;

/** 보틀 1회 구매 시 채워지는 양 */
export function bottleSizeMl(ing: Ingredient): number {
  switch (ing.type) {
    case 'spirit':
    case 'liqueur':
      return 700;
    case 'mixer':
      return 1000;
    case 'garnish':
      return 10; // 가니시는 10회분 (1회 = 1 단위)
    default:
      return 700;
  }
}

interface SaveData {
  version: number;
  money: number;
  day: number;
  stockMl: Record<string, number>;
  menu: string[];
  dayRevenue: number;
}

export interface SlotInfo {
  day: number;
  money: number;
  menuCount: number;
}

/**
 * 전역 게임 상태 싱글턴. Phaser 비의존.
 * 저장은 3개 슬롯(localStorage) — BootScene에서 슬롯을 선택해 startSlot()으로 시작한다.
 */
class GameStateImpl {
  money = 0;
  day = 1;
  /** ingredientId -> 남은 ml (가니시는 남은 횟수) */
  stockMl: Record<string, number> = {};
  /** 메뉴에 등록된 레시피 id */
  menu: string[] = [];
  /** 오늘 벌어들인 매출 (영업 종료 정산용) */
  dayRevenue = 0;

  private currentSlot = 0;

  readonly ingredients: Ingredient[] = ingredientsJson.ingredients as Ingredient[];
  readonly recipes: Recipe[] = recipesJson.recipes as Recipe[];

  private ingredientById = new Map<string, Ingredient>();
  private recipeById = new Map<string, Recipe>();

  constructor() {
    for (const i of this.ingredients) this.ingredientById.set(i.id, i);
    for (const r of this.recipes) this.recipeById.set(r.id, r);
  }

  ingredient(id: string): Ingredient {
    const ing = this.ingredientById.get(id);
    if (!ing) throw new Error(`unknown ingredient: ${id}`);
    return ing;
  }

  recipe(id: string): Recipe {
    const r = this.recipeById.get(id);
    if (!r) throw new Error(`unknown recipe: ${id}`);
    return r;
  }

  /* ---------- 슬롯 관리 ---------- */

  slotInfo(slot: number): SlotInfo | null {
    const data = this.readSlot(slot);
    if (!data) return null;
    return { day: data.day, money: data.money, menuCount: data.menu.length };
  }

  /** 슬롯 선택 후 시작 — 저장이 있으면 이어하기, 없으면 새 게임 */
  startSlot(slot: number): void {
    this.currentSlot = slot;
    const data = this.readSlot(slot);
    if (data) {
      this.money = data.money;
      this.day = data.day;
      this.stockMl = data.stockMl;
      this.menu = data.menu.filter((id) => this.recipeById.has(id));
      this.dayRevenue = data.dayRevenue ?? 0;
    } else {
      this.reset();
    }
  }

  deleteSlot(slot: number): void {
    try {
      localStorage.removeItem(`${SAVE_PREFIX}${slot}`);
    } catch {
      /* ignore */
    }
  }

  private readSlot(slot: number): SaveData | null {
    try {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 2) return null;
      return data;
    } catch {
      return null;
    }
  }

  /* ---------- 게임 상태 ---------- */

  /** 새 게임: 한정된 초기 자금 + 최소 재고 + 스타터 메뉴 2종 */
  reset(): void {
    this.money = 100000;
    this.day = 1;
    this.dayRevenue = 0;
    this.stockMl = {};
    for (const id of ['gin', 'tonic', 'vodka', 'orange_juice']) {
      this.stockMl[id] = bottleSizeMl(this.ingredient(id));
    }
    this.menu = ['gin_tonic', 'screwdriver'];
    this.save();
  }

  stockOf(id: string): number {
    return this.stockMl[id] ?? 0;
  }

  /** 재고 기준으로 레시피 1잔을 만들 수 있는가 */
  canMake(recipe: Recipe): boolean {
    for (const step of recipe.steps) {
      if (!step.ingredient) continue;
      const need = step.action === 'garnish' ? 1 : (step.amountMl ?? 0);
      if (this.stockOf(step.ingredient) < need) return false;
    }
    return true;
  }

  /** 조주 중 실제 소모 (부은 만큼 차감) */
  consume(ingredientId: string, amount: number): void {
    this.stockMl[ingredientId] = Math.max(0, this.stockOf(ingredientId) - amount);
  }

  buyBottle(ingredientId: string): boolean {
    const ing = this.ingredient(ingredientId);
    if (this.money < ing.price) return false;
    this.money -= ing.price;
    this.stockMl[ingredientId] = this.stockOf(ingredientId) + bottleSizeMl(ing);
    this.save();
    return true;
  }

  isOnMenu(recipeId: string): boolean {
    return this.menu.includes(recipeId);
  }

  toggleMenu(recipeId: string): void {
    if (this.isOnMenu(recipeId)) {
      this.menu = this.menu.filter((id) => id !== recipeId);
    } else {
      this.menu.push(recipeId);
    }
    this.save();
  }

  earn(amount: number): void {
    const v = Math.round(amount);
    this.money += v;
    this.dayRevenue += v;
    this.save();
  }

  /** 영업 종료 정산: 운영비 차감. 반환값은 정산 내역 */
  closeDay(): { revenue: number; cost: number; net: number } {
    const revenue = this.dayRevenue;
    const cost = DAILY_OPERATING_COST;
    this.money = Math.max(0, this.money - cost);
    this.dayRevenue = 0;
    this.day += 1;
    this.save();
    return { revenue, cost, net: revenue - cost };
  }

  save(): void {
    const data: SaveData = {
      version: 2,
      money: this.money,
      day: this.day,
      stockMl: this.stockMl,
      menu: this.menu,
      dayRevenue: this.dayRevenue,
    };
    try {
      localStorage.setItem(`${SAVE_PREFIX}${this.currentSlot}`, JSON.stringify(data));
    } catch {
      /* storage 불가 환경에서는 무시 */
    }
  }
}

export const GameState = new GameStateImpl();
