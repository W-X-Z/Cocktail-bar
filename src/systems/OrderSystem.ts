import type { MixScore, Order, Recipe } from './types';
import { GameState } from './GameState';

/**
 * 손님 주문 생성.
 * - 70%: 메뉴에 있는 칵테일을 원함 → 그대로 주문 (팁 대상)
 * - 30%: 전체 레시피 중 하나를 원함 → 메뉴에 없으면 메뉴 내 대체 주문 (팁 없음, 발주 힌트)
 */
export function createOrder(rng: () => number = Math.random): Order | null {
  const menu = GameState.menu.filter((id) => GameState.canMake(GameState.recipe(id)));
  if (menu.length === 0) return null; // 만들 수 있는 메뉴가 없으면 손님을 받을 수 없음

  const pick = (ids: string[]) => ids[Math.floor(rng() * ids.length)]!;

  if (rng() < 0.7) {
    const id = pick(menu);
    return { desiredId: id, orderedId: id, tipEligible: true };
  }

  // 낮은 티어일수록 자주 요구되도록 가중치
  const weighted: string[] = [];
  for (const r of GameState.recipes) {
    const w = Math.max(1, 4 - r.tier);
    for (let i = 0; i < w; i++) weighted.push(r.id);
  }
  const desired = pick(weighted);
  if (menu.includes(desired)) {
    return { desiredId: desired, orderedId: desired, tipEligible: true };
  }
  return { desiredId: desired, orderedId: pick(menu), tipEligible: false };
}

export interface Payment {
  base: number;
  tip: number;
  total: number;
}

/**
 * 결제 계산.
 * 정확도가 낮으면 기본가도 일부 깎이고(최저 40%),
 * 팁 = 기본가 × 30% × 정확도 × 인내심 배율 (팁 대상 손님만)
 */
export function settle(recipe: Recipe, score: MixScore, patience: number, tipEligible: boolean): Payment {
  const base = Math.round(recipe.basePrice * (0.4 + 0.6 * score.total));
  const patienceMul = Math.max(0.2, Math.min(1, patience));
  const tip = tipEligible ? Math.round(recipe.basePrice * 0.3 * score.total * patienceMul) : 0;
  return { base, tip, total: base + tip };
}
