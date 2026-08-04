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

/** 대화 상황 키 — personas.json의 dialogue 필드와 1:1 */
export type DialogueKey =
  | 'greet'
  | 'order'
  | 'orderFallback'
  | 'serveGood'
  | 'serveOk'
  | 'serveBad'
  | 'angry'
  | 'regular';

export type HairStyle = 'short' | 'slick' | 'bob' | 'long' | 'ponytail' | 'bun' | 'curly';
export type CollarStyle = 'plain' | 'shirt' | 'tie' | 'scoop' | 'turtle';

/** 픽셀 초상화 생성 파라미터 (ui/portraits.ts) */
export interface PersonaLook {
  skin: string;
  hair: string;
  eyes: string;
  hairStyle: HairStyle;
  outfit: string;
  collar: CollarStyle;
  glasses?: boolean;
  lashes?: boolean;
  lipstick?: string;
  blush?: boolean;
  earrings?: boolean;
}

export interface Persona {
  id: string;
  name: string;
  job: string;
  look: PersonaLook;
  favorites: string[];
  dislikes: string[];
  patienceMul: number;
  tipMul: number;
  visitWeight: number;
  dialogue: Record<DialogueKey, string[]>;
}

/** 단골 호감도 상태 (세이브에 저장) */
export interface Relationship {
  /** 방문 횟수 */
  visits: number;
  /** 호감도 포인트 (서빙 품질로 증감) */
  affinity: number;
}
