import Phaser from 'phaser';
import { shade } from './art';
import type { PersonaLook } from '../systems/types';

/**
 * 픽셀아트 초상화 생성기.
 * 40×48 도트 버스트(머리+어깨)를 코드로 찍고 NEAREST 필터로 확대한다.
 * 페르소나 look 파라미터(피부/눈/헤어스타일/의상/액세서리)로 조합형 초상화를 만든다.
 */

const PW = 40;
const PH = 48;

type Px = (x: number, y: number, w?: number, h?: number, alpha?: number) => void;

function makePx(ctx: CanvasRenderingContext2D): (color: string) => Px {
  return (color: string) =>
    (x: number, y: number, w = 1, h = 1, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    };
}

/** 행별 얼굴 좌우 경계 (x0, x1 inclusive) */
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

export function portraitTexture(scene: Phaser.Scene, key: string, look: PersonaLook): string {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, PW, PH);
  if (!canvas) return key;
  const ctx = canvas.context;
  const P = makePx(ctx);

  const skin = P(look.skin);
  const skinShade = P(shade(look.skin, -0.18));
  const skinDark = P(shade(look.skin, -0.38));
  const skinLight = P(shade(look.skin, 0.14));
  const hairBase = P(look.hair);
  const hairDark = P(shade(look.hair, -0.35));
  const hairLight = P(shade(look.hair, 0.3));
  const outfit = P(look.outfit);
  const outfitDark = P(shade(look.outfit, -0.3));
  const outfitLight = P(shade(look.outfit, 0.2));
  const line = P('#241a14');
  const white = P('#f8f4ee');

  /* ---------- 1. 뒷머리 (긴 머리는 어깨 뒤로) ---------- */
  const style = look.hairStyle;
  if (style === 'long') {
    // 매끈한 생머리 — 통짜 기둥 + 안쪽 웨이브 음영
    for (let r = 9; r <= 45; r++) {
      hairBase(4, r, 5);
      hairBase(31, r, 5);
    }
    hairBase(5, 46, 3);
    hairBase(32, 46, 3);
    for (let r = 12; r <= 44; r += 4) {
      hairDark(5 + (r % 8 < 4 ? 0 : 1), r, 1, 2);
      hairDark(33 - (r % 8 < 4 ? 1 : 0), r + 2, 1, 2);
    }
    for (let r = 14; r <= 40; r += 7) {
      hairLight(7, r, 1, 3);
      hairLight(31, r + 3, 1, 3);
    }
  } else if (style === 'bob') {
    for (let r = 10; r <= 31; r++) {
      hairBase(5, r, 4);
      hairBase(31, r, 4);
    }
    hairBase(6, 32, 4);
    hairBase(30, 32, 4);
    hairDark(5, 30, 3);
    hairDark(32, 30, 3);
  } else if (style === 'ponytail') {
    for (let r = 8; r <= 32; r++) {
      const sway = Math.floor(Math.sin(r * 0.45) * 2);
      hairBase(32 + sway, r, 4);
      if (r % 4 === 0) hairDark(33 + sway, r, 2);
      if (r % 5 === 2) hairLight(32 + sway, r, 1);
    }
    P(shade(look.outfit, 0.1))(31, 11, 3, 2); // 머리끈
  } else if (style === 'bun') {
    // 올림머리 (덩어리)
    hairBase(15, 2, 10, 2);
    hairBase(14, 3, 12, 3);
    hairBase(15, 6, 10, 1);
    hairDark(15, 5, 3);
    hairLight(20, 3, 3, 1);
  }

  /* ---------- 2. 어깨/의상 ---------- */
  const shoulderRows: Array<[number, number, number]> = [
    [41, 14, 25],
    [42, 11, 28],
    [43, 9, 30],
    [44, 7, 32],
    [45, 6, 33],
    [46, 5, 34],
    [47, 5, 34],
  ];
  for (const [r, x0, x1] of shoulderRows) {
    outfit(x0, r, x1 - x0 + 1);
  }
  outfitDark(14, 41, 12);
  outfitLight(8, 44, 4);

  /* ---------- 3. 목 ---------- */
  skin(16, 34, 8, 8);
  skinShade(16, 39, 8, 2); // 턱 그림자

  /* ---------- 4. 얼굴 ---------- */
  for (let r = 8; r <= 37; r++) {
    const span = faceSpan(r);
    if (!span) continue;
    const [x0, x1] = span;
    skin(x0, r, x1 - x0 + 1);
    skinShade(x1, r); // 오른쪽 음영
    skinDark(x0, r, 1, 1, 0.35); // 왼쪽 윤곽
  }
  skinLight(13, 12, 8, 3); // 이마 하이라이트
  skinShade(15, 37, 8, 1);
  // 귀
  skin(7, 22, 2, 5);
  skin(31, 22, 2, 5);
  skinShade(7, 24, 1, 2);
  skinShade(32, 24, 1, 2);

  /* ---------- 5. 이목구비 ---------- */
  const eye = P(look.eyes);
  const lash = look.lashes;
  const browColor = P(shade(look.hair, -0.2));
  const fringeHidesBrow = style === 'bob';

  // 눈썹
  if (!fringeHidesBrow) {
    browColor(12, 18, 5);
    browColor(23, 18, 5);
    browColor(13, 17, 3, 1, 0.5);
    browColor(24, 17, 3, 1, 0.5);
  }
  // 속눈썹 라인 (여성형은 굵고 바깥 삐침)
  line(12, 21, 5);
  line(23, 21, 5);
  if (lash) {
    line(11, 21);
    line(28, 21);
    line(10, 20);
    line(29, 20);
  }
  // 흰자 + 홍채
  const eyeH = lash ? 3 : 2;
  white(12, 22, 5, eyeH);
  white(23, 22, 5, eyeH);
  eye(13, 22, 3, eyeH);
  eye(24, 22, 3, eyeH);
  line(14, 22 + (eyeH - 1), 1, 1); // 동공
  line(25, 22 + (eyeH - 1), 1, 1);
  white(13, 22, 1, 1); // 눈 하이라이트
  white(24, 22, 1, 1);
  if (lash) {
    skinShade(12, 22 + eyeH, 2); // 애교살
    skinShade(26, 22 + eyeH, 2);
  }

  // 코
  skinShade(20, 27, 1, 2);
  skinDark(19, 28, 1, 1, 0.5);

  // 입
  if (look.lipstick) {
    const lip = P(look.lipstick);
    const lipLight = P(shade(look.lipstick, 0.3));
    lip(17, 31, 6);
    lip(18, 32, 4);
    lipLight(18, 31, 2);
    line(16, 31, 1, 1);
    line(23, 31, 1, 1);
  } else {
    line(18, 31, 5, 1);
    skinShade(19, 32, 3);
    skinDark(17, 30, 1, 1, 0.4);
    skinDark(23, 30, 1, 1, 0.4);
  }

  // 볼터치
  if (look.blush) {
    const blushP = P('#e87a8a');
    blushP(11, 27, 3, 2, 0.4);
    blushP(26, 27, 3, 2, 0.4);
  }

  /* ---------- 6. 앞머리 ---------- */
  const topFill = (fromRow: number, toRow: number) => {
    for (let r = fromRow; r <= toRow; r++) {
      const span = faceSpan(Math.max(r, 8)) ?? [10, 29];
      hairBase(span[0] - 1, r, span[1] - span[0] + 3);
    }
  };
  if (style === 'short') {
    topFill(5, 12);
    hairBase(9, 13, 4);
    hairBase(27, 13, 4);
    hairBase(9, 14, 2);
    hairBase(29, 14, 2);
    hairBase(9, 15, 1, 6); // 구레나룻
    hairBase(30, 15, 1, 6);
    hairLight(13, 7, 8, 1);
    hairDark(9, 12, 3);
  } else if (style === 'slick') {
    topFill(4, 11);
    hairBase(9, 12, 3);
    hairBase(28, 12, 3);
    hairBase(9, 13, 1, 6);
    hairBase(30, 13, 1, 6);
    for (const x of [13, 17, 21, 25]) hairLight(x, 5, 1, 5);
  } else if (style === 'bob') {
    topFill(4, 11);
    // 일자 앞머리 (눈썹 덮음)
    hairBase(9, 12, 22, 5);
    for (let x = 9; x <= 30; x += 3) hairDark(x, 16, 1); // 앞머리 끝 지그재그
    hairBase(9, 17, 2, 14); // 사이드 커튼
    hairBase(29, 17, 2, 14);
    hairLight(12, 8, 9, 1);
    hairLight(11, 13, 4, 1);
  } else if (style === 'long') {
    topFill(4, 11);
    // 가운데 가르마 커튼
    for (let i = 0; i < 6; i++) {
      hairBase(9, 12 + i, 8 - i);
      hairBase(23 + i, 12 + i, 8 - i);
    }
    hairBase(9, 18, 2, 16);
    hairBase(29, 18, 2, 16);
    hairLight(12, 7, 7, 1);
    hairDark(19, 5, 2, 6); // 가르마 라인
  } else if (style === 'ponytail') {
    topFill(5, 11);
    // 옆으로 넘긴 앞머리
    hairBase(9, 12, 17);
    hairBase(9, 13, 11);
    hairBase(9, 14, 6);
    hairBase(9, 15, 2, 6);
    hairBase(30, 12, 1, 4);
    hairLight(11, 7, 9, 1);
  } else if (style === 'bun') {
    topFill(5, 11);
    hairBase(9, 12, 3);
    hairBase(28, 12, 3);
    hairBase(9, 13, 1, 4);
    hairBase(30, 13, 1, 4);
    for (const x of [12, 16, 20, 24, 27]) hairDark(x, 6, 1, 4, 0.5); // 당겨 묶은 결
    hairLight(14, 5, 6, 1);
  } else if (style === 'curly') {
    for (let x = 8; x <= 31; x++) {
      const top = 4 + ((x * 7) % 3);
      hairBase(x, top, 1, 12 - ((x * 5) % 3));
    }
    hairBase(8, 10, 2, 8);
    hairBase(30, 10, 2, 8);
    for (const [dx, dy] of [[11, 6], [15, 9], [19, 5], [23, 8], [27, 6], [10, 12], [29, 11]] as const) {
      hairDark(dx, dy, 1);
    }
    hairLight(14, 5, 3, 1);
    hairLight(22, 7, 3, 1);
  }

  /* ---------- 7. 의상 디테일 (칼라) ---------- */
  if (look.collar === 'shirt' || look.collar === 'tie') {
    const shirt = P('#e8e4da');
    shirt(15, 41, 4, 1);
    shirt(21, 41, 4, 1);
    shirt(14, 42, 4, 1);
    shirt(22, 42, 4, 1);
    shirt(13, 43, 3, 1);
    shirt(24, 43, 3, 1);
    if (look.collar === 'tie') {
      const tie = P('#7a2432');
      tie(18, 41, 4, 2);
      tie(19, 43, 2, 5);
      P(shade('#7a2432', -0.3))(20, 43, 1, 5);
    }
  } else if (look.collar === 'scoop') {
    // 드레스 스쿱넥 — 데콜테 노출 + 목걸이
    skin(13, 41, 14, 2);
    skin(15, 43, 10, 1);
    skinShade(13, 42, 14, 1, 0.4);
    outfit(7, 41, 4, 3); // 어깨 스트랩
    outfit(29, 41, 4, 3);
    const gold = P('#e8c05a');
    gold(16, 42, 1);
    gold(23, 42, 1);
    gold(17, 43, 6, 1);
    gold(19, 44, 2, 1); // 펜던트
  } else if (look.collar === 'turtle') {
    outfit(15, 36, 10, 6);
    outfitDark(15, 36, 10, 1);
    outfitLight(16, 38, 2, 3);
  }

  /* ---------- 8. 안경 / 귀걸이 ---------- */
  if (look.glasses) {
    const frame = P('#2c2420');
    frame(11, 20, 7, 1);
    frame(11, 25, 7, 1);
    frame(11, 20, 1, 6);
    frame(17, 20, 1, 6);
    frame(22, 20, 7, 1);
    frame(22, 25, 7, 1);
    frame(22, 20, 1, 6);
    frame(28, 20, 1, 6);
    frame(18, 22, 4, 1); // 브릿지
    frame(9, 21, 2, 1); // 다리
    frame(29, 21, 2, 1);
  }
  if (look.earrings) {
    const gold = P('#e8c05a');
    gold(7, 27, 1, 2);
    gold(32, 27, 1, 2);
    gold(7, 29, 1, 1, 0.7);
    gold(32, 29, 1, 1, 0.7);
  }

  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
