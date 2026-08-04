import type { MixScore, Order, Persona, Recipe } from './types';
import { GameState } from './GameState';

/**
 * 손님 주문 생성. 페르소나가 있으면 취향이 반영된다:
 * - favorites는 가중치 4배, dislikes는 절대 주문하지 않음
 * - 70%: 메뉴에 있는 칵테일을 원함 → 그대로 주문 (팁 대상)
 * - 30%: 전체 레시피 중 하나를 원함 → 메뉴에 없으면 메뉴 내 대체 주문 (팁 없음, 발주 힌트)
 */
export function createOrder(personaArg?: Persona, rng: () => number = Math.random): Order | null {
  const menu = GameState.menu.filter((id) => GameState.canMake(GameState.recipe(id)));
  if (menu.length === 0) return null; // 만들 수 있는 메뉴가 없으면 손님을 받을 수 없음

  const favorites = new Set(personaArg?.favorites ?? []);
  const dislikes = new Set(personaArg?.dislikes ?? []);

  const pickWeighted = (ids: string[], baseWeight: (id: string) => number): string => {
    const pool = ids.filter((id) => !dislikes.has(id));
    const usable = pool.length > 0 ? pool : ids;
    const weights = usable.map((id) => baseWeight(id) * (favorites.has(id) ? 4 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    for (let i = 0; i < usable.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return usable[i]!;
    }
    return usable[usable.length - 1]!;
  };

  if (rng() < 0.7) {
    const id = pickWeighted(menu, () => 1);
    return { desiredId: id, orderedId: id, tipEligible: true };
  }

  // 낮은 티어일수록 자주 요구되도록 가중치 + 페르소나 취향
  const desired = pickWeighted(
    GameState.recipes.map((r) => r.id),
    (id) => Math.max(1, 4 - GameState.recipe(id).tier),
  );
  if (menu.includes(desired)) {
    return { desiredId: desired, orderedId: desired, tipEligible: true };
  }
  return { desiredId: desired, orderedId: pickWeighted(menu, () => 1), tipEligible: false };
}

export interface Payment {
  base: number;
  tip: number;
  total: number;
}

/**
 * 결제 계산.
 * 정확도가 낮으면 기본가도 일부 깎이고(최저 40%),
 * 팁 = 기본가 × 30% × 정확도 × 인내심 배율 × 손님 팁 배율(페르소나 × 단골 보너스)
 */
export function settle(
  recipe: Recipe,
  score: MixScore,
  patience: number,
  tipEligible: boolean,
  tipMul = 1,
): Payment {
  const base = Math.round(recipe.basePrice * (0.4 + 0.6 * score.total));
  const patienceMul = Math.max(0.2, Math.min(1, patience));
  const tip = tipEligible ? Math.round(recipe.basePrice * 0.3 * score.total * patienceMul * tipMul) : 0;
  return { base, tip, total: base + tip };
}
