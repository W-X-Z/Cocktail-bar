import personasJson from '../data/personas.json';
import type { DialogueKey, Persona } from './types';
import { GameState } from './GameState';

/**
 * 손님 페르소나 · 대화 · 단골 시스템. Phaser 비의존.
 *
 * - 페르소나: personas.json 데이터 주도 — 추가는 JSON에 항목만 넣으면 됨
 * - 대화: 상황 키별 라인 풀에서 랜덤 선택 + {drink}/{desired} 치환
 * - 단골: 호감도(affinity)를 세이브에 누적, 레벨에 따라 인내심/팁/방문 빈도 보정
 */

export const personas: Persona[] = personasJson.personas as Persona[];
const personaById = new Map(personas.map((p) => [p.id, p]));

export function persona(id: string): Persona {
  const p = personaById.get(id);
  if (!p) throw new Error(`unknown persona: ${id}`);
  return p;
}

/* ---------- 단골 레벨 ---------- */

export interface RegularLevel {
  level: number;
  label: string;
  minAffinity: number;
  /** 인내심 보정 (배율에 더해짐) */
  patienceBonus: number;
  /** 팁 보정 (배율에 더해짐) */
  tipBonus: number;
  /** 방문 가중치 보정 (배율) */
  visitBonus: number;
}

export const REGULAR_LEVELS: RegularLevel[] = [
  { level: 0, label: '뜨내기', minAffinity: 0, patienceBonus: 0, tipBonus: 0, visitBonus: 1.0 },
  { level: 1, label: '아는 손님', minAffinity: 4, patienceBonus: 0.1, tipBonus: 0.1, visitBonus: 1.3 },
  { level: 2, label: '단골', minAffinity: 10, patienceBonus: 0.2, tipBonus: 0.25, visitBonus: 1.6 },
  { level: 3, label: 'VIP', minAffinity: 20, patienceBonus: 0.3, tipBonus: 0.5, visitBonus: 2.0 },
];

export function regularLevel(personaId: string): RegularLevel {
  const rel = GameState.relationship(personaId);
  let best = REGULAR_LEVELS[0]!;
  for (const lv of REGULAR_LEVELS) {
    if (rel.affinity >= lv.minAffinity) best = lv;
  }
  return best;
}

/** 서빙 품질 → 호감도 증감. 반환값: 레벨이 올랐으면 새 레벨 */
export function recordServe(personaId: string, scoreTotal: number): RegularLevel | null {
  const before = regularLevel(personaId).level;
  const delta = scoreTotal >= 0.85 ? 2 : scoreTotal >= 0.6 ? 1 : scoreTotal >= 0.35 ? 0 : -1;
  GameState.addAffinity(personaId, delta);
  const after = regularLevel(personaId);
  return after.level > before ? after : null;
}

/** 화나서 떠남 → 호감도 하락 */
export function recordAngryLeave(personaId: string): void {
  GameState.addAffinity(personaId, -2);
}

/* ---------- 등장 선택 ---------- */

/** 현재 자리에 없는 페르소나 중에서 가중치 추첨 (단골일수록 자주 옴) */
export function pickPersona(activeIds: string[], rng: () => number = Math.random): Persona {
  const pool = personas.filter((p) => !activeIds.includes(p.id));
  const candidates = pool.length > 0 ? pool : personas;
  const weights = candidates.map((p) => p.visitWeight * regularLevel(p.id).visitBonus);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}

/* ---------- 대화 ---------- */

/** 상황 키에 맞는 대사를 랜덤 선택. 단골(레벨 2+)은 greet 대신 regular 대사가 섞임 */
export function line(
  p: Persona,
  key: DialogueKey,
  vars: Record<string, string> = {},
  rng: () => number = Math.random,
): string {
  let effectiveKey = key;
  if (key === 'greet' && regularLevel(p.id).level >= 2 && rng() < 0.6) {
    effectiveKey = 'regular';
  }
  const pool = p.dialogue[effectiveKey] ?? p.dialogue[key] ?? ['…'];
  let text = pool[Math.floor(rng() * pool.length)] ?? '…';
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, v);
  }
  return text;
}

/** 서빙 점수 → 반응 대사 키 */
export function reactionKey(scoreTotal: number): DialogueKey {
  return scoreTotal >= 0.7 ? 'serveGood' : scoreTotal >= 0.4 ? 'serveOk' : 'serveBad';
}
