import type { MixAction, MixScore, Recipe, ScoreLine, Vessel } from './types';
import { GameState } from './GameState';

/**
 * 레시피별 얼음 요구 위치 (게임 단순화 규칙):
 * - 셰이크 레시피 → 셰이커에 얼음
 * - 빌드/스터 + 하이볼·락 글라스 → 잔에 얼음
 * - 쿠페·마티니·마가리타 글라스(스트레이트 업) → 얼음 없음 (칠링 가정)
 */
export function iceExpectation(recipe: Recipe): Vessel | 'none' {
  if (recipe.method === 'shake') return 'shaker';
  if (recipe.glass === 'highball' || recipe.glass === 'rocks') return 'glass';
  return 'none';
}

/** 계량 오차 허용: ±10%까지 무감점, 60% 이상 어긋나면 0점 */
function pourRatio(target: number, actual: number): number {
  if (target <= 0) return 1;
  const err = Math.abs(actual - target) / target;
  if (err <= 0.1) return 1;
  if (err >= 0.6) return 0;
  return 1 - (err - 0.1) / 0.5;
}

/** 기법(셰이크/스터) 시간 오차: ±25% 무감점, 100% 어긋나면 0점 */
function timeRatio(target: number, actual: number): number {
  if (target <= 0) return 1;
  const err = Math.abs(actual - target) / target;
  if (err <= 0.25) return 1;
  if (err >= 1) return 0;
  return 1 - (err - 0.25) / 0.75;
}

/**
 * 레시피 스펙과 플레이어 행동 로그를 비교해 부분 점수제로 채점한다.
 * - 재료별 계량 오차 (가중치 55%)
 * - 기법: 셰이크/스터 시간 + 셰이크 레시피의 잔에 따르기(스트레인) (25%)
 * - 얼음 위치 (10%)
 * - 가니시 (10%, 레시피에 있을 때만)
 * - 레시피 밖 재료/기법/얼음은 감점
 */
export function scoreMix(recipe: Recipe, actions: MixAction[]): MixScore {
  const lines: ScoreLine[] = [];

  const pouredBy = new Map<string, number>();
  let shakeSec = 0;
  let stirSec = 0;
  const garnished = new Set<string>();
  const icedVessels = new Set<Vessel>();
  let strained = false;

  for (const a of actions) {
    if (a.action === 'pour' && a.ingredient) {
      pouredBy.set(a.ingredient, (pouredBy.get(a.ingredient) ?? 0) + (a.amountMl ?? 0));
    } else if (a.action === 'shake') {
      shakeSec += a.seconds ?? 0;
    } else if (a.action === 'stir') {
      stirSec += a.seconds ?? 0;
    } else if (a.action === 'garnish' && a.ingredient) {
      garnished.add(a.ingredient);
    } else if (a.action === 'ice' && a.vessel) {
      icedVessels.add(a.vessel);
    } else if (a.action === 'strain') {
      strained = true;
    }
  }

  // 1) 계량
  const pourScores: number[] = [];
  const expectedIds = new Set<string>();
  for (const step of recipe.steps) {
    if (step.action !== 'pour' || !step.ingredient) continue;
    expectedIds.add(step.ingredient);
    const target = step.amountMl ?? 0;
    const actual = pouredBy.get(step.ingredient) ?? 0;
    const ratio = pourRatio(target, actual);
    pourScores.push(ratio);
    const name = GameState.ingredient(step.ingredient).nameKo;
    lines.push({
      label: name,
      ratio,
      detail: actual <= 0 ? `누락! (${target}ml 필요)` : `${Math.round(actual)}ml / ${target}ml`,
    });
  }

  // 2) 레시피 밖 재료
  let extraPenalty = 0;
  for (const [id, ml] of pouredBy) {
    if (!expectedIds.has(id) && ml > 2) {
      extraPenalty += 0.25;
      lines.push({
        label: GameState.ingredient(id).nameKo,
        ratio: 0,
        detail: `불필요한 재료 (${Math.round(ml)}ml)`,
      });
    }
  }

  // 3) 기법
  const techScores: number[] = [];
  for (const step of recipe.steps) {
    if (step.action === 'shake') {
      const ratio = stirSec > shakeSec && shakeSec === 0 ? 0 : timeRatio(step.seconds ?? 0, shakeSec);
      techScores.push(ratio);
      lines.push({
        label: '셰이킹',
        ratio,
        detail: shakeSec === 0 ? '셰이킹 안 함!' : `${shakeSec.toFixed(1)}초 / ${step.seconds}초`,
      });
    } else if (step.action === 'stir') {
      const ratio = timeRatio(step.seconds ?? 0, stirSec);
      techScores.push(ratio);
      lines.push({
        label: '스터',
        ratio,
        detail: stirSec === 0 ? '젓지 않음!' : `${stirSec.toFixed(1)}초 / ${step.seconds}초`,
      });
    }
  }
  // 요구하지 않은 기법 사용 (셰이크 레시피를 젓기만 하는 등은 위에서 0점 처리됨)
  const needsShake = recipe.steps.some((s) => s.action === 'shake');
  if (!needsShake && shakeSec > 1) {
    extraPenalty += 0.15;
    lines.push({ label: '셰이킹', ratio: 0, detail: '이 레시피는 흔들지 않아요' });
  }

  // 3-1) 셰이크 레시피: 셰이커 → 잔에 따르기(스트레인)
  if (recipe.method === 'shake') {
    techScores.push(strained ? 1 : 0);
    lines.push({
      label: '잔에 따르기',
      ratio: strained ? 1 : 0,
      detail: strained ? 'OK' : '셰이커에 담긴 채 서빙!',
    });
  }

  // 4) 얼음
  const iceExp = iceExpectation(recipe);
  const iceScores: number[] = [];
  if (iceExp !== 'none') {
    const ok = icedVessels.has(iceExp);
    iceScores.push(ok ? 1 : 0);
    lines.push({
      label: `얼음(${iceExp === 'shaker' ? '셰이커' : '잔'})`,
      ratio: ok ? 1 : 0,
      detail: ok ? 'OK' : '빠짐',
    });
  }
  if (iceExp !== 'glass' && icedVessels.has('glass')) {
    extraPenalty += 0.15;
    lines.push({ label: '얼음', ratio: 0, detail: '이 잔에는 얼음을 넣지 않아요' });
  }

  // 5) 가니시
  const garnishScores: number[] = [];
  for (const step of recipe.steps) {
    if (step.action !== 'garnish' || !step.ingredient) continue;
    const ok = garnished.has(step.ingredient);
    garnishScores.push(ok ? 1 : 0);
    lines.push({
      label: `가니시(${GameState.ingredient(step.ingredient).nameKo})`,
      ratio: ok ? 1 : 0,
      detail: ok ? 'OK' : '빠짐',
    });
  }

  // 5-1) 레시피에 없는 가니시 (소폭 감점)
  const expectedGarnish = new Set(
    recipe.steps.filter((s) => s.action === 'garnish' && s.ingredient).map((s) => s.ingredient!),
  );
  for (const g of garnished) {
    if (!expectedGarnish.has(g)) {
      extraPenalty += 0.05;
      lines.push({
        label: `가니시(${GameState.ingredient(g).nameKo})`,
        ratio: 0,
        detail: '불필요한 가니시',
      });
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  let total =
    avg(pourScores) * 0.55 +
    avg(techScores) * 0.25 +
    avg(iceScores) * 0.1 +
    avg(garnishScores) * 0.1;
  total = Math.max(0, Math.min(1, total - extraPenalty));

  return { total, lines };
}

/** 재료를 보유 중이라 메뉴 등록이 가능한 레시피인지 (재고량 무관, 종류 보유 기준) */
export function hasAllIngredientTypes(recipe: Recipe): boolean {
  return recipe.steps.every((s) => !s.ingredient || GameState.stockOf(s.ingredient) > 0);
}
