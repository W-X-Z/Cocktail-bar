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

export type GlassType = 'highball' | 'rocks' | 'coupe' | 'martini' | 'margarita';

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

/** 조주 용기 */
export type Vessel = 'glass' | 'shaker';

/** 플레이어 행동 종류 — 레시피 스텝 + 얼음/스트레인 */
export type MixActionKind = StepAction | 'ice' | 'strain';

/** 플레이어가 조주 중 실제로 수행한 행동 로그 */
export interface MixAction {
  action: MixActionKind;
  ingredient?: string;
  amountMl?: number;
  seconds?: number;
  vessel?: Vessel;
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
/** 체형 — 좌석 웨이스트샷의 어깨/허리 폭을 결정 */
export type BodyBuild = 'slim' | 'average' | 'broad' | 'heavy';

/** 픽셀 초상화 생성 파라미터 (ui/portraits.ts) */
export interface PersonaLook {
  skin: string;
  hair: string;
  eyes: string;
  hairStyle: HairStyle;
  outfit: string;
  collar: CollarStyle;
  /** 체형 (기본 average) */
  build?: BodyBuild;
  /** 단신 (앉은 키가 낮아 보임) */
  petite?: boolean;
  glasses?: boolean;
  lashes?: boolean;
  lipstick?: string;
  blush?: boolean;
  earrings?: boolean;
}

/** 대화 상호작용 버튼 종류 */
export type TalkKind = 'sympathize' | 'advise' | 'silence';

export interface TalkOption {
  kind: TalkKind;
  /** 선택 시 손님의 답변 */
  reply: string;
  /** 호감도 증감 (-1 / 0 / +1) */
  affinity: number;
}

/** 서빙 후 손님이 건네는 이야기 한 세트 */
export interface Talk {
  text: string;
  options: TalkOption[];
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
  /** 대화 상호작용 세트 (없으면 상호작용 미발생) */
  talks?: Talk[];
}

/** 단골 호감도 상태 (세이브에 저장) */
export interface Relationship {
  /** 방문 횟수 */
  visits: number;
  /** 호감도 포인트 (서빙 품질로 증감) */
  affinity: number;
}
