export type IngredientType = 'spirit' | 'liqueur' | 'mixer' | 'garnish' | 'other';

export interface Ingredient {
  id: string;
  name: string;
  nameKo: string;
  type: IngredientType;
  price: number;
  color: string;
}

export type StepAction = 'pour' | 'stir' | 'shake' | 'garnish';

export interface RecipeStep {
  action: StepAction;
  ingredient?: string;
  amountMl?: number;
  seconds?: number;
}

export type GlassType = 'highball' | 'rocks' | 'coupe' | 'martini';

export interface Recipe {
  id: string;
  name: string;
  nameKo: string;
  tier: number;
  basePrice: number;
  glass: GlassType;
  method: 'build' | 'stir' | 'shake';
  steps: RecipeStep[];
}

/** 플레이어가 조주 중 실제로 수행한 행동 로그 */
export interface MixAction {
  action: StepAction;
  ingredient?: string;
  amountMl?: number;
  seconds?: number;
}

export interface ScoreLine {
  label: string;
  ratio: number; // 0~1
  detail: string;
}

export interface MixScore {
  total: number; // 0~1
  lines: ScoreLine[];
}

export interface Order {
  /** 손님이 원래 원했던 칵테일 */
  desiredId: string;
  /** 실제 주문 (메뉴에 없으면 메뉴 내 대체 주문) */
  orderedId: string;
  /** 원하는 술이 메뉴에 있어 팁 대상인지 */
  tipEligible: boolean;
}
