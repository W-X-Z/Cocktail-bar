import ingredientsJson from '../data/ingredients.json';
import recipesJson from '../data/recipes.json';
import type { Ingredient, Recipe } from './types';

const SAVE_KEY = 'cocktail-bar-save-v1';

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
}

/**
 * 전역 게임 상태 싱글턴. Phaser 비의존.
 * 씬은 이 객체를 통해서만 영속 상태를 읽고 쓴다.
 */
class GameStateImpl {
  money = 0;
  day = 1;
  /** ingredientId -> 남은 ml (가니시는 남은 횟수) */
  stockMl: Record<string, number> = {};
  /** 메뉴에 등록된 레시피 id */
  menu: string[] = [];

  readonly ingredients: Ingredient[] = ingredientsJson.ingredients as Ingredient[];
  readonly recipes: Recipe[] = recipesJson.recipes as Recipe[];

  private ingredientById = new Map<string, Ingredient>();
  private recipeById = new Map<string, Recipe>();

  constructor() {
    for (const i of this.ingredients) this.ingredientById.set(i.id, i);
    for (const r of this.recipes) this.recipeById.set(r.id, r);
    if (!this.load()) this.reset();
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

  /** 새 게임: 한정된 초기 자금 + 최소 재고 + 스타터 메뉴 2종 */
  reset(): void {
    this.money = 50000;
    this.day = 1;
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
    this.money += Math.round(amount);
    this.save();
  }

  nextDay(): void {
    this.day += 1;
    this.save();
  }

  save(): void {
    const data: SaveData = {
      version: 1,
      money: this.money,
      day: this.day,
      stockMl: this.stockMl,
      menu: this.menu,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* storage 불가 환경(사파리 시크릿 등)에서는 무시 */
    }
  }

  private load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return false;
      this.money = data.money;
      this.day = data.day;
      this.stockMl = data.stockMl;
      this.menu = data.menu.filter((id) => this.recipeById.has(id));
      return true;
    } catch {
      return false;
    }
  }
}

export const GameState = new GameStateImpl();
