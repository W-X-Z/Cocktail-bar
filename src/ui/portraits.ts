import Phaser from 'phaser';
import { shade } from './art';
import type { BodyBuild, PersonaLook } from '../systems/types';

/**
 * 픽셀아트 초상화 생성기.
 * - portraitTexture: 40×48 바스트샷 (대화 카드용 얼굴 클로즈업)
 * - seatedTexture: 52×76 웨이스트샷 (좌석용 — 체형·앉은 키 반영, 팔은 카운터에 올림)
 * 도트를 코드로 찍고 NEAREST 필터로 확대한다.
 */

type Px = (x: number, y: number, w?: number, h?: number, alpha?: number) => void;

/** 오프셋이 적용된 픽셀 페인터 팩토리 */
function makePx(ctx: CanvasRenderingContext2D, ox = 0, oy = 0): (color: string) => Px {
  return (color: string) =>
    (x: number, y: number, w = 1, h = 1, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x + ox, y + oy, w, h);
      ctx.globalAlpha = 1;
    };
}

interface Palette {
  skin: Px;
  skinShade: Px;
  skinDark: Px;
  skinLight: Px;
  hairBase: Px;
  hairDark: Px;
  hairLight: Px;
  outfit: Px;
  outfitDark: Px;
  outfitLight: Px;
  line: Px;
  white: Px;
}

function makePalette(ctx: CanvasRenderingContext2D, look: PersonaLook, ox = 0, oy = 0): Palette {
  const P = makePx(ctx, ox, oy);
  return {
    skin: P(look.skin),
    skinShade: P(shade(look.skin, -0.18)),
    skinDark: P(shade(look.skin, -0.38)),
    skinLight: P(shade(look.skin, 0.14)),
    hairBase: P(look.hair),
    hairDark: P(shade(look.hair, -0.35)),
    hairLight: P(shade(look.hair, 0.3)),
    outfit: P(look.outfit),
    outfitDark: P(shade(look.outfit, -0.3)),
    outfitLight: P(shade(look.outfit, 0.2)),
    line: P('#241a14'),
    white: P('#f8f4ee'),
  };
}

/** 행별 얼굴 좌우 경계 (헤드 로컬 좌표: 폭 40 기준, x0~x1 inclusive) */
function faceSpan(row: number): [number, number] | null {
  if (row < 8 || row > 37) return null;
  if (row === 8) return [14, 25];
  if (row === 9) return [12, 27];
  if (row === 10) return [11, 28];
  if (row === 11) return [10, 29];
  if (row <= 30) return [9, 30];
  if (row <= 32) return [10, 29];
  if (row === 33) return [11, 28];
  if (row === 34) return [12, 27];
  if (row === 35) return [13, 26];
  if (row === 36) return [15, 24];
  return [17, 22];
}

/** 뒷머리 (몸통보다 먼저 그림). bottomRow까지 흘러내린다 */
function drawBackHair(pal: Palette, look: PersonaLook, bottomRow: number): void {
  const style = look.hairStyle;
  if (style === 'long') {
    for (let r = 9; r <= bottomRow; r++) {
      pal.hairBase(4, r, 5);
      pal.hairBase(31, r, 5);
    }
    pal.hairBase(5, bottomRow + 1, 3);
    pal.hairBase(32, bottomRow + 1, 3);
    for (let r = 12; r <= bottomRow - 2; r += 4) {
      pal.hairDark(5 + (r % 8 < 4 ? 0 : 1), r, 1, 2);
      pal.hairDark(33 - (r % 8 < 4 ? 1 : 0), r + 2, 1, 2);
    }
    for (let r = 14; r <= bottomRow - 4; r += 7) {
      pal.hairLight(7, r, 1, 3);
      pal.hairLight(31, r + 3, 1, 3);
    }
  } else if (style === 'bob') {
    for (let r = 10; r <= 31; r++) {
      pal.hairBase(5, r, 4);
      pal.hairBase(31, r, 4);
    }
    pal.hairBase(6, 32, 4);
    pal.hairBase(30, 32, 4);
    pal.hairDark(5, 30, 3);
    pal.hairDark(32, 30, 3);
  } else if (style === 'ponytail') {
    const tail = Math.min(bottomRow, 40);
    for (let r = 8; r <= tail; r++) {
      const sway = Math.floor(Math.sin(r * 0.45) * 2);
      pal.hairBase(32 + sway, r, 4);
      if (r % 4 === 0) pal.hairDark(33 + sway, r, 2);
      if (r % 5 === 2) pal.hairLight(32 + sway, r, 1);
    }
    pal.outfitLight(31, 11, 3, 2); // 머리끈
  } else if (style === 'bun') {
    pal.hairBase(15, 2, 10, 2);
    pal.hairBase(14, 3, 12, 3);
    pal.hairBase(15, 6, 10, 1);
    pal.hairDark(15, 5, 3);
    pal.hairLight(20, 3, 3, 1);
  }
}

/** 얼굴 + 이목구비 + 앞머리 + 안경/귀걸이 (헤드 로컬 좌표) */
function drawHeadUnit(pal: PaletteExt, look: PersonaLook): void {
  // 목은 몸통 쪽에서 그림 — 여기선 얼굴부터
  for (let r = 8; r <= 37; r++) {
    const span = faceSpan(r);
    if (!span) continue;
    const [x0, x1] = span;
    pal.skin(x0, r, x1 - x0 + 1);
    pal.skinShade(x1, r);
    pal.skinDark(x0, r, 1, 1, 0.35);
  }
  pal.skinLight(13, 12, 8, 3);
  pal.skinShade(15, 37, 8, 1);
  pal.skin(7, 22, 2, 5); // 귀
  pal.skin(31, 22, 2, 5);
  pal.skinShade(7, 24, 1, 2);
  pal.skinShade(32, 24, 1, 2);

  const lash = look.lashes;
  const fringeHidesBrow = look.hairStyle === 'bob';
  if (!fringeHidesBrow) {
    pal.hairDark(12, 18, 5, 1, 0.75);
    pal.hairDark(23, 18, 5, 1, 0.75);
    pal.hairDark(13, 17, 3, 1, 0.4);
    pal.hairDark(24, 17, 3, 1, 0.4);
  }
  pal.line(12, 21, 5);
  pal.line(23, 21, 5);
  if (lash) {
    pal.line(11, 21);
    pal.line(28, 21);
    pal.line(10, 20);
    pal.line(29, 20);
  }
  const eyeH = lash ? 3 : 2;
  pal.white(12, 22, 5, eyeH);
  pal.white(23, 22, 5, eyeH);
  pal.eye!(13, 22, 3, eyeH);
  pal.eye!(24, 22, 3, eyeH);
  pal.line(14, 22 + (eyeH - 1), 1, 1);
  pal.line(25, 22 + (eyeH - 1), 1, 1);
  pal.white(13, 22, 1, 1);
  pal.white(24, 22, 1, 1);
  if (lash) {
    pal.skinShade(12, 22 + eyeH, 2);
    pal.skinShade(26, 22 + eyeH, 2);
  }

  pal.skinShade(20, 27, 1, 2);
  pal.skinDark(19, 28, 1, 1, 0.5);

  if (look.lipstick) {
    const lip = pal.lip!;
    const lipLight = pal.lipLight!;
    lip(17, 31, 6);
    lip(18, 32, 4);
    lipLight(18, 31, 2);
    pal.line(16, 31, 1, 1);
    pal.line(23, 31, 1, 1);
  } else {
    pal.line(18, 31, 5, 1);
    pal.skinShade(19, 32, 3);
    pal.skinDark(17, 30, 1, 1, 0.4);
    pal.skinDark(23, 30, 1, 1, 0.4);
  }

  if (look.blush) {
    pal.blush!(11, 27, 3, 2, 0.4);
    pal.blush!(26, 27, 3, 2, 0.4);
  }

  drawFrontHair(pal, look);

  if (look.glasses) {
    const frame = pal.frame!;
    frame(11, 20, 7, 1);
    frame(11, 25, 7, 1);
    frame(11, 20, 1, 6);
    frame(17, 20, 1, 6);
    frame(22, 20, 7, 1);
    frame(22, 25, 7, 1);
    frame(22, 20, 1, 6);
    frame(28, 20, 1, 6);
    frame(18, 22, 4, 1);
    frame(9, 21, 2, 1);
    frame(29, 21, 2, 1);
  }
  if (look.earrings) {
    const gold = pal.gold!;
    gold(7, 27, 1, 2);
    gold(32, 27, 1, 2);
    gold(7, 29, 1, 1, 0.7);
    gold(32, 29, 1, 1, 0.7);
  }
}

/* 확장 팔레트 — 이목구비/액세서리용 추가 색 */
interface PaletteExt extends Palette {
  eye?: Px;
  lip?: Px;
  lipLight?: Px;
  blush?: Px;
  frame?: Px;
  gold?: Px;
  tie?: Px;
  tieDark?: Px;
}

function extendPalette(ctx: CanvasRenderingContext2D, look: PersonaLook, ox = 0, oy = 0): PaletteExt {
  const base = makePalette(ctx, look, ox, oy) as PaletteExt;
  const P = makePx(ctx, ox, oy);
  base.eye = P(look.eyes);
  base.lip = look.lipstick ? P(look.lipstick) : undefined;
  base.lipLight = look.lipstick ? P(shade(look.lipstick, 0.3)) : undefined;
  base.blush = P('#e87a8a');
  base.frame = P('#2c2420');
  base.gold = P('#e8c05a');
  base.tie = P('#7a2432');
  base.tieDark = P(shade('#7a2432', -0.3));
  return base;
}

/** 앞머리 (헤드 로컬 좌표) */
function drawFrontHair(pal: Palette, look: PersonaLook): void {
  const style = look.hairStyle;
  const topFill = (fromRow: number, toRow: number) => {
    for (let r = fromRow; r <= toRow; r++) {
      const span = faceSpan(Math.max(r, 8)) ?? [10, 29];
      pal.hairBase(span[0] - 1, r, span[1] - span[0] + 3);
    }
  };
  if (style === 'short') {
    topFill(5, 12);
    pal.hairBase(9, 13, 4);
    pal.hairBase(27, 13, 4);
    pal.hairBase(9, 14, 2);
    pal.hairBase(29, 14, 2);
    pal.hairBase(9, 15, 1, 6);
    pal.hairBase(30, 15, 1, 6);
    pal.hairLight(13, 7, 8, 1);
    pal.hairDark(9, 12, 3);
  } else if (style === 'slick') {
    topFill(4, 11);
    pal.hairBase(9, 12, 3);
    pal.hairBase(28, 12, 3);
    pal.hairBase(9, 13, 1, 6);
    pal.hairBase(30, 13, 1, 6);
    for (const x of [13, 17, 21, 25]) pal.hairLight(x, 5, 1, 5);
  } else if (style === 'bob') {
    topFill(4, 11);
    pal.hairBase(9, 12, 22, 5);
    for (let x = 9; x <= 30; x += 3) pal.hairDark(x, 16, 1);
    pal.hairBase(9, 17, 2, 14);
    pal.hairBase(29, 17, 2, 14);
    pal.hairLight(12, 8, 9, 1);
    pal.hairLight(11, 13, 4, 1);
  } else if (style === 'long') {
    topFill(4, 11);
    for (let i = 0; i < 6; i++) {
      pal.hairBase(9, 12 + i, 8 - i);
      pal.hairBase(23 + i, 12 + i, 8 - i);
    }
    pal.hairBase(9, 18, 2, 16);
    pal.hairBase(29, 18, 2, 16);
    pal.hairLight(12, 7, 7, 1);
    pal.hairDark(19, 5, 2, 6);
  } else if (style === 'ponytail') {
    topFill(5, 11);
    pal.hairBase(9, 12, 17);
    pal.hairBase(9, 13, 11);
    pal.hairBase(9, 14, 6);
    pal.hairBase(9, 15, 2, 6);
    pal.hairBase(30, 12, 1, 4);
    pal.hairLight(11, 7, 9, 1);
  } else if (style === 'bun') {
    topFill(5, 11);
    pal.hairBase(9, 12, 3);
    pal.hairBase(28, 12, 3);
    pal.hairBase(9, 13, 1, 4);
    pal.hairBase(30, 13, 1, 4);
    for (const x of [12, 16, 20, 24, 27]) pal.hairDark(x, 6, 1, 4, 0.5);
    pal.hairLight(14, 5, 6, 1);
  } else if (style === 'curly') {
    for (let x = 8; x <= 31; x++) {
      const top = 4 + ((x * 7) % 3);
      pal.hairBase(x, top, 1, 12 - ((x * 5) % 3));
    }
    pal.hairBase(8, 10, 2, 8);
    pal.hairBase(30, 10, 2, 8);
    for (const [dx, dy] of [[11, 6], [15, 9], [19, 5], [23, 8], [27, 6], [10, 12], [29, 11]] as const) {
      pal.hairDark(dx, dy, 1);
    }
    pal.hairLight(14, 5, 3, 1);
    pal.hairLight(22, 7, 3, 1);
  }
}

/* ---------- 바스트샷 (대화 카드용) ---------- */

export function portraitTexture(scene: Phaser.Scene, key: string, look: PersonaLook): string {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, 40, 48);
  if (!canvas) return key;
  const ctx = canvas.context;
  const pal = extendPalette(ctx, look);

  drawBackHair(pal, look, 45);

  // 어깨 (바스트: 화면 하단까지)
  const rows: Array<[number, number, number]> = [
    [41, 14, 25],
    [42, 11, 28],
    [43, 9, 30],
    [44, 7, 32],
    [45, 6, 33],
    [46, 5, 34],
    [47, 5, 34],
  ];
  for (const [r, x0, x1] of rows) pal.outfit(x0, r, x1 - x0 + 1);
  pal.outfitDark(14, 41, 12);
  pal.outfitLight(8, 44, 4);

  pal.skin(16, 34, 8, 8); // 목
  pal.skinShade(16, 39, 8, 2);

  drawHeadUnit(pal, look);
  drawCollar(pal, look, { neckX: 16, collarTop: 39, chestHalf: 13, cx: 20 });

  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** 칼라/넥라인 디테일 (양쪽 샷 공용, 지오메트리 파라미터화) */
function drawCollar(
  pal: PaletteExt,
  look: PersonaLook,
  g: { neckX: number; collarTop: number; chestHalf: number; cx: number },
): void {
  const { collarTop, cx } = g;
  if (look.collar === 'shirt' || look.collar === 'tie') {
    const shirt = pal.white;
    shirt(cx - 5, collarTop + 2, 4, 1);
    shirt(cx + 1, collarTop + 2, 4, 1);
    shirt(cx - 6, collarTop + 3, 4, 1);
    shirt(cx + 2, collarTop + 3, 4, 1);
    shirt(cx - 7, collarTop + 4, 3, 1);
    shirt(cx + 4, collarTop + 4, 3, 1);
    if (look.collar === 'tie') {
      pal.tie!(cx - 2, collarTop + 2, 4, 2);
      pal.tie!(cx - 1, collarTop + 4, 2, 5);
      pal.tieDark!(cx, collarTop + 4, 1, 5);
    }
  } else if (look.collar === 'scoop') {
    pal.skin(cx - 7, collarTop + 2, 14, 2);
    pal.skin(cx - 5, collarTop + 4, 10, 1);
    pal.skinShade(cx - 7, collarTop + 3, 14, 1, 0.4);
    pal.gold!(cx - 4, collarTop + 3, 1);
    pal.gold!(cx + 3, collarTop + 3, 1);
    pal.gold!(cx - 3, collarTop + 4, 6, 1);
    pal.gold!(cx - 1, collarTop + 5, 2, 1);
  } else if (look.collar === 'turtle') {
    pal.outfit(cx - 5, collarTop - 3, 10, 6);
    pal.outfitDark(cx - 5, collarTop - 3, 10, 1);
    pal.outfitLight(cx - 4, collarTop - 1, 2, 3);
  }
}

/* ---------- 웨이스트샷 (좌석용 — 체형 반영) ---------- */

/** 체형별 (어깨 반폭, 허리 반폭) */
const BUILD_WIDTHS: Record<BodyBuild, [number, number]> = {
  slim: [15, 12],
  average: [18, 16],
  broad: [22, 19],
  heavy: [19, 23],
};

const SW = 52;
const SH = 76;

export function seatedTexture(scene: Phaser.Scene, key: string, look: PersonaLook): string {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, SW, SH);
  if (!canvas) return key;
  const ctx = canvas.context;

  const ox = 6; // 헤드(40폭)를 52폭 중앙에
  const oy = look.petite ? 6 : 0; // 단신은 앉은 키가 낮다
  const cx = 26; // 캔버스 절대 중심
  const pal = extendPalette(ctx, look, ox, oy);
  const abs = extendPalette(ctx, look, 0, 0); // 몸통은 절대 좌표

  const build = look.build ?? 'average';
  const [shoulderHalf, waistHalfBase] = BUILD_WIDTHS[build];
  // 스쿱 드레스 + slim = 모래시계 실루엣
  const hourglass = look.collar === 'scoop' && build === 'slim';

  drawBackHair(pal, look, 52);

  /* 몸통: torsoTop(어깨선)부터 캔버스 바닥까지 */
  const torsoTop = 38 + oy;
  const bottom = SH - 1;
  for (let r = torsoTop; r <= bottom; r++) {
    const t = (r - torsoTop) / (bottom - torsoTop); // 0=어깨, 1=허리
    let half: number;
    if (r < torsoTop + 3) {
      // 어깨 경사
      half = Math.round(shoulderHalf * (0.5 + 0.17 * (r - torsoTop)));
    } else if (hourglass) {
      // 잘록한 허리 → 힙 라인
      const pinch = t < 0.6 ? shoulderHalf - (shoulderHalf - 10) * (t / 0.6) : 10 + (waistHalfBase - 10) * ((t - 0.6) / 0.4) + 2;
      half = Math.round(pinch);
    } else {
      half = Math.round(shoulderHalf + (waistHalfBase - shoulderHalf) * t);
    }
    abs.outfit(cx - half, r, half * 2 + 1);
    abs.outfitDark(cx + half - 1, r, 2); // 오른쪽 음영
    if (r === torsoTop) abs.outfitDark(cx - half, r, half * 2 + 1);
  }
  // 배 하이라이트 (heavy는 봉긋하게)
  if (build === 'heavy') {
    abs.outfitLight(cx - 6, 58 + oy, 12, 10, 0.35);
  } else {
    abs.outfitLight(cx - shoulderHalf + 2, 46 + oy, 3, 12, 0.5);
  }

  /* 팔 — 카운터에 팔을 올린 자세 (소매 + 손) */
  const armY = 64 + Math.floor(oy / 2);
  const armHalf = shoulderHalf + (build === 'heavy' ? 1 : 2);
  // 위팔 (몸통 옆)
  abs.outfitDark(cx - armHalf, torsoTop + 4, 3, armY - torsoTop - 4);
  abs.outfitDark(cx + armHalf - 2, torsoTop + 4, 3, armY - torsoTop - 4);
  // 팔뚝 (수평으로 앞에 올림)
  abs.outfit(cx - armHalf, armY, armHalf * 2, 6);
  abs.outfitDark(cx - armHalf, armY, armHalf * 2, 1);
  abs.outfitLight(cx - armHalf + 2, armY + 2, 4, 1);
  // 손 (중앙에 모아 쥠)
  abs.skin(cx - 6, armY + 2, 5, 4);
  abs.skin(cx + 1, armY + 2, 5, 4);
  abs.skinShade(cx - 6, armY + 5, 5, 1);
  abs.skinShade(cx + 1, armY + 5, 5, 1);

  /* 목 + 헤드 */
  pal.skin(16, 34, 8, 6);
  pal.skinShade(16, 38, 8, 2);
  drawHeadUnit(pal, look);
  drawCollar(pal, look, { neckX: 16 + ox, collarTop: 39 + oy, chestHalf: shoulderHalf - 3, cx });

  // 셔츠 단추 라인
  if (look.collar === 'shirt' || look.collar === 'tie') {
    for (let r = torsoTop + 8; r < armY - 2; r += 4) abs.line(cx, r, 1, 1, 0.4);
  }

  // 긴 머리는 가슴 위로 앞머리 가닥이 흘러내림
  if (look.hairStyle === 'long') {
    abs.hairBase(cx - shoulderHalf + 1, torsoTop, 3, 16);
    abs.hairBase(cx + shoulderHalf - 4, torsoTop, 3, 14);
    abs.hairDark(cx - shoulderHalf + 2, torsoTop + 6, 1, 4);
    abs.hairDark(cx + shoulderHalf - 3, torsoTop + 5, 1, 4);
  }

  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
