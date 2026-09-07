import Phaser from 'phaser';

/**
 * 절차 생성 아트 레이어.
 * 캔버스 2D로 그라데이션/질감/광원을 그려 Phaser 텍스처로 등록한다.
 * 추후 실제 스프라이트로 교체할 때는 같은 텍스처 키로 이미지를 로드하면 된다.
 */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function ensureTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  painter: Painter,
): string {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return key;
  painter(canvas.context, w, h);
  canvas.refresh();
  return key;
}

/** #rrggbb를 pct(-1~1)만큼 어둡게/밝게 */
export function shade(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (c: number) =>
    Math.max(0, Math.min(255, Math.round(pct < 0 ? c * (1 + pct) : c + (255 - c) * pct)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 공용 텍스처 ---------- */

/** 부드러운 원형 글로우 (틴트해서 조명/네온으로 사용) */
export function glowTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'fx_glow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** 바닥 그림자 */
export function shadowTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'fx_shadow', 128, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 2);
    ctx.restore();
  });
}

/** 화면 가장자리를 어둡게 (분위기) */
export function vignetteTexture(scene: Phaser.Scene, w: number, h: number): string {
  return ensureTexture(scene, 'fx_vignette', w, h, (ctx) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,2,6,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/* ---------- 나무/가구 ---------- */

function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  const lines = Math.floor(h / 9);
  for (let i = 0; i < lines; i++) {
    const ly = y + 5 + i * 9 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    for (let px = x; px <= x + w; px += 26) {
      ctx.quadraticCurveTo(px + 13, ly + (rnd() - 0.5) * 5, px + 26, ly + (rnd() - 0.5) * 2);
    }
    ctx.stroke();
    if (rnd() < 0.16) {
      const kx = x + rnd() * w;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(kx, ly + 2, 3.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 탑다운 마루 타일 (tileSprite용) */
export function floorTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'wood_floor', 240, 160, (ctx, w, h) => {
    const base = '#2a161c';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 2; row++) {
      const y = row * 80;
      const off = row % 2 === 0 ? 0 : 120;
      for (let i = -1; i < 2; i++) {
        const x = off + i * 240;
        const g = ctx.createLinearGradient(0, y, 0, y + 80);
        g.addColorStop(0, shade(base, 0.09));
        g.addColorStop(0.5, base);
        g.addColorStop(1, shade(base, -0.22));
        ctx.fillStyle = g;
        ctx.fillRect(x + 2, y + 2, 236, 76);
        grain(ctx, x + 2, y + 2, 236, 76, 7 + row * 31 + i * 13);
      }
    }
  });
}

/** 카운터 상판 (가로 판재 + 결) */
export function counterTexture(scene: Phaser.Scene, key: string, w: number, h: number, base = '#59331d'): string {
  return ensureTexture(scene, key, w, h, (ctx) => {
    const g0 = ctx.createLinearGradient(0, 0, 0, h);
    g0.addColorStop(0, shade(base, 0.18));
    g0.addColorStop(0.12, shade(base, 0.05));
    g0.addColorStop(1, shade(base, -0.35));
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, w, h);
    const planks = Math.max(2, Math.round(h / 56));
    for (let i = 0; i < planks; i++) {
      const py = (h / planks) * i;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, py, w, 2);
      grain(ctx, 0, py, w, h / planks, 101 + i * 17);
    }
    // 상단 하이라이트 (조명 반사)
    const hi = ctx.createLinearGradient(0, 0, 0, 26);
    hi.addColorStop(0, 'rgba(255,220,160,0.35)');
    hi.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, w, 26);
  });
}

/** 탑다운 스툴 (가죽 방석) */
export function stoolTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'stool', 110, 110, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    // 나무 링
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = '#2d1a0e';
    ctx.fill();
    // 가죽 쿠션
    const g = ctx.createRadialGradient(cx - 14, cy - 14, 6, cx, cy, 46);
    g.addColorStop(0, '#8c3a30');
    g.addColorStop(0.55, '#6e2a22');
    g.addColorStop(1, '#471a14');
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // 스티치
    ctx.strokeStyle = 'rgba(255,214,170,0.35)';
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 단추
    ctx.fillStyle = 'rgba(40,10,8,0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- 사람 (탑다운) ---------- */

export function personTexture(scene: Phaser.Scene, key: string, body: string, hair: string, skin = '#e8b890'): string {
  return ensureTexture(scene, key, 96, 96, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    // 어깨
    const bg = ctx.createLinearGradient(cx - 40, cy - 20, cx + 30, cy + 34);
    bg.addColorStop(0, shade(body, 0.25));
    bg.addColorStop(1, shade(body, -0.3));
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 40, 30, 0, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 팔
    ctx.fillStyle = shade(body, -0.15);
    ctx.beginPath();
    ctx.ellipse(cx - 36, cy + 12, 9, 14, -0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + 36, cy + 12, 9, 14, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // 머리
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    // 헤어 (정수리)
    const hg = ctx.createRadialGradient(cx - 8, cy - 14, 2, cx, cy - 8, 22);
    hg.addColorStop(0, shade(hair, 0.35));
    hg.addColorStop(1, shade(hair, -0.2));
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 19, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();
    // 광
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 12, 11, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  });
}

/** 정면 인물 (바텐더 POV에서 마주 보는 손님) */
export function personFrontTexture(
  scene: Phaser.Scene,
  key: string,
  body: string,
  hair: string,
  skin = '#e8b890',
  glasses = false,
): string {
  return ensureTexture(scene, key, 110, 130, (ctx, w, h) => {
    const cx = w / 2;
    // 어깨/상체
    const bg = ctx.createLinearGradient(cx - 50, h - 55, cx + 50, h);
    bg.addColorStop(0, shade(body, 0.2));
    bg.addColorStop(1, shade(body, -0.3));
    ctx.beginPath();
    ctx.moveTo(cx - 52, h);
    ctx.quadraticCurveTo(cx - 50, h - 48, cx - 26, h - 52);
    ctx.lineTo(cx + 26, h - 52);
    ctx.quadraticCurveTo(cx + 50, h - 48, cx + 52, h);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 목
    ctx.fillStyle = shade(skin, -0.1);
    ctx.fillRect(cx - 9, h - 62, 18, 14);
    // 머리
    ctx.beginPath();
    ctx.arc(cx, 52, 32, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 헤어 (앞머리 캡)
    const hg = ctx.createLinearGradient(cx, 12, cx, 52);
    hg.addColorStop(0, shade(hair, 0.3));
    hg.addColorStop(1, shade(hair, -0.15));
    ctx.beginPath();
    ctx.arc(cx, 52, 33, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(cx + 20, 38, cx, 40);
    ctx.quadraticCurveTo(cx - 20, 38, cx - 32.5, 57);
    ctx.closePath();
    ctx.fillStyle = hg;
    ctx.fill();
    // 눈
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath();
    ctx.arc(cx - 12, 58, 3.6, 0, Math.PI * 2);
    ctx.arc(cx + 12, 58, 3.6, 0, Math.PI * 2);
    ctx.fill();
    // 볼터치
    ctx.fillStyle = 'rgba(220,120,100,0.25)';
    ctx.beginPath();
    ctx.arc(cx - 19, 68, 5, 0, Math.PI * 2);
    ctx.arc(cx + 19, 68, 5, 0, Math.PI * 2);
    ctx.fill();
    // 입 (옅은 미소)
    ctx.strokeStyle = '#7a4a3a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, 70, 8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // 안경
    if (glasses) {
      ctx.strokeStyle = 'rgba(30,25,20,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx - 12, 58, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 12, 58, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, 58);
      ctx.lineTo(cx + 3.5, 58);
      ctx.stroke();
    }
  });
}

/* ---------- 보틀 / 잔 ---------- */

export function bottleTexture(scene: Phaser.Scene, key: string, liquid: string, tall = true): string {
  // 2× 해상도로 렌더 (크게 표시해도 선명) — 표시 크기는 씬에서 setScale로 조절
  const W = 112;
  const H = tall ? 300 : 240;
  return ensureTexture(scene, key, W, H, (ctx) => {
    ctx.scale(2, 2);
    const w = W / 2;
    const h = H / 2;
    const cx = w / 2;
    const bodyW = 19;
    const neckW = 7;
    const capTop = 4;
    const neckTop = 18;
    const shoulderY = h * 0.34;
    const bodyTop = h * 0.44;
    const bottom = h - 6;

    const silhouette = () => {
      ctx.beginPath();
      ctx.moveTo(cx - neckW, neckTop);
      ctx.lineTo(cx - neckW, shoulderY);
      ctx.bezierCurveTo(cx - neckW, bodyTop, cx - bodyW, bodyTop - 8, cx - bodyW, bodyTop + 6);
      ctx.lineTo(cx - bodyW, bottom - 8);
      ctx.quadraticCurveTo(cx - bodyW, bottom, cx - bodyW + 8, bottom);
      ctx.lineTo(cx + bodyW - 8, bottom);
      ctx.quadraticCurveTo(cx + bodyW, bottom, cx + bodyW, bottom - 8);
      ctx.lineTo(cx + bodyW, bodyTop + 6);
      ctx.bezierCurveTo(cx + bodyW, bodyTop - 8, cx + neckW, bodyTop, cx + neckW, shoulderY);
      ctx.lineTo(cx + neckW, neckTop);
      ctx.closePath();
    };

    // 1) 빈 유리 (목 부분은 액체 위 헤드스페이스)
    silhouette();
    const glassG = ctx.createLinearGradient(cx - bodyW, 0, cx + bodyW, 0);
    glassG.addColorStop(0, 'rgba(210,225,225,0.5)');
    glassG.addColorStop(0.5, 'rgba(235,245,245,0.35)');
    glassG.addColorStop(1, 'rgba(150,170,175,0.55)');
    ctx.fillStyle = glassG;
    ctx.fill();

    // 2) 액체 (어깨 아래부터 — 병 안에 담긴 느낌)
    ctx.save();
    silhouette();
    ctx.clip();
    const fillTop = shoulderY - 4;
    const g = ctx.createLinearGradient(cx - bodyW, 0, cx + bodyW, 0);
    g.addColorStop(0, shade(liquid, 0.3));
    g.addColorStop(0.45, liquid);
    g.addColorStop(1, shade(liquid, -0.42));
    ctx.fillStyle = g;
    ctx.fillRect(cx - bodyW, fillTop, bodyW * 2, bottom - fillTop);
    // 액체 표면 라인
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - neckW - 1, fillTop, neckW * 2 + 2, 1.6);
    // 바닥 유리 두께
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(cx - bodyW, bottom - 4, bodyW * 2, 4);
    ctx.restore();

    // 3) 외곽선
    silhouette();
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 4) 유리 반사 (좌측 세로 + 어깨 곡면)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rounded(ctx, cx - bodyW + 5, bodyTop + 4, 5, bottom - bodyTop - 16, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx - 6, bodyTop - 1, 7, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 5) 라벨 (테두리 + 문양 줄 + 액체색 포인트 밴드)
    ctx.fillStyle = 'rgba(244,236,216,0.94)';
    rounded(ctx, cx - bodyW + 4, h * 0.56, bodyW * 2 - 8, h * 0.2, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.55)';
    ctx.lineWidth = 1.2;
    rounded(ctx, cx - bodyW + 6.5, h * 0.56 + 3, bodyW * 2 - 13, h * 0.2 - 6, 2);
    ctx.stroke();
    ctx.fillStyle = shade(liquid, -0.25);
    ctx.fillRect(cx - bodyW + 7, h * 0.56 + 5, bodyW * 2 - 14, 4);
    ctx.fillStyle = 'rgba(90,60,30,0.6)';
    ctx.fillRect(cx - bodyW + 9, h * 0.56 + h * 0.075, bodyW * 2 - 18, 2.5);
    ctx.fillRect(cx - bodyW + 12, h * 0.56 + h * 0.075 + 5.5, bodyW * 2 - 24, 1.8);
    ctx.fillRect(cx - bodyW + 14, h * 0.56 + h * 0.075 + 10, bodyW * 2 - 28, 1.4);

    // 6) 넥 라벨 (작은 리본)
    ctx.fillStyle = shade(liquid, -0.3);
    ctx.fillRect(cx - neckW - 0.5, shoulderY - 12, neckW * 2 + 1, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(cx - neckW - 0.5, shoulderY - 12, neckW * 2 + 1, 1.4);

    // 7) 캡 + 캡슐 링
    ctx.fillStyle = '#2c2c34';
    rounded(ctx, cx - neckW - 1.5, capTop, neckW * 2 + 3, neckTop - capTop + 4, 2.5);
    ctx.fill();
    ctx.fillStyle = '#1a1a20';
    ctx.fillRect(cx - neckW - 1.5, neckTop - 1, neckW * 2 + 3, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(cx - neckW + 1, capTop + 2, 3, neckTop - capTop);
  });
}

/** 리밍 접시 (소금·설탕) */
export function rimDishTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_rim_dish', 120, 74, (ctx, w, h) => {
    const cx = w / 2;
    // 접시
    ctx.fillStyle = '#8a97a2';
    ctx.beginPath();
    ctx.ellipse(cx, h - 22, 54, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#b8c4ce';
    ctx.beginPath();
    ctx.ellipse(cx, h - 25, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 소금 무더기 (왼쪽 흰색) + 설탕 무더기 (오른쪽 미색)
    ctx.fillStyle = '#f7f7f7';
    ctx.beginPath();
    ctx.ellipse(cx - 20, h - 30, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe3cc';
    ctx.beginPath();
    ctx.ellipse(cx + 20, h - 28, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // 알갱이
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.9)' : 'rgba(220,205,175,0.9)';
      ctx.fillRect(cx - 20 + (i % 2 ? 40 : 0) + Math.cos(a) * 14 * r, h - 30 + Math.sin(a) * 6 * r, 2, 2);
    }
  });
}

/** POV 유리잔. 내부 좌표계는 씬의 잔 지오메트리와 1:1 (액체는 씬에서 별도로 그림) */
export function glassTexture(scene: Phaser.Scene, glass: string): string {
  const specs: Record<string, { w: number; h: number }> = {
    highball: { w: 170, h: 240 },
    rocks: { w: 200, h: 180 },
    coupe: { w: 220, h: 220 },
    martini: { w: 220, h: 220 },
    margarita: { w: 230, h: 220 },
    liqueur: { w: 100, h: 160 },
    sour: { w: 150, h: 215 },
    pilsner: { w: 180, h: 250 },
    collins: { w: 150, h: 260 },
    wine: { w: 180, h: 225 },
  };
  const { w: TW, h: TH } = specs[glass] ?? specs['rocks']!;
  return ensureTexture(scene, `glass_${glass}`, TW, TH, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(235,245,250,0.85)';
    ctx.lineWidth = 4.5;
    ctx.fillStyle = 'rgba(210,235,245,0.07)';
    const cx = w / 2;
    if (glass === 'highball') {
      rounded(ctx, cx - 70, 10, 140, h - 22, 8);
      ctx.fill();
      ctx.stroke();
      // 하단 두께
      ctx.fillStyle = 'rgba(235,245,250,0.3)';
      rounded(ctx, cx - 66, h - 22, 132, 8, 4);
      ctx.fill();
    } else if (glass === 'rocks') {
      rounded(ctx, cx - 85, 10, 170, h - 24, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,245,250,0.3)';
      rounded(ctx, cx - 80, h - 26, 160, 10, 5);
      ctx.fill();
    } else if (glass === 'margarita') {
      // 마가리타: 넓은 림 → 잘록한 허리 → 작은 아랫보울 (2단)
      ctx.beginPath();
      ctx.moveTo(cx - 100, 14);
      ctx.lineTo(cx - 30, 62);
      ctx.lineTo(cx - 40, 80);
      ctx.quadraticCurveTo(cx - 36, 108, cx, 112);
      ctx.quadraticCurveTo(cx + 36, 108, cx + 40, 80);
      ctx.lineTo(cx + 30, 62);
      ctx.lineTo(cx + 100, 14);
      ctx.fill();
      ctx.stroke();
      // 스템 + 베이스
      ctx.beginPath();
      ctx.moveTo(cx, 112);
      ctx.lineTo(cx, 190);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 52, 198);
      ctx.lineTo(cx + 52, 198);
      ctx.stroke();
      // 소금 리밍 느낌의 림 하이라이트
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(cx - 100, 12, 200, 3);
    } else if (glass === 'collins') {
      // 톨 콜린스
      rounded(ctx, cx - 55, 8, 110, h - 20, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,245,250,0.3)';
      rounded(ctx, cx - 51, h - 22, 102, 8, 4);
      ctx.fill();
    } else if (glass === 'liqueur') {
      // 리큐르/셰리 글라스 (푸스카페·B-52)
      ctx.beginPath();
      ctx.moveTo(cx - 28, 8);
      ctx.lineTo(cx - 22, 92);
      ctx.lineTo(cx + 22, 92);
      ctx.lineTo(cx + 28, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 92);
      ctx.lineTo(cx, h - 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 26, h - 8);
      ctx.lineTo(cx + 26, h - 8);
      ctx.stroke();
    } else if (glass === 'sour') {
      // 사워 글라스: 튤립 보울 + 스템
      ctx.beginPath();
      ctx.moveTo(cx - 45, 10);
      ctx.bezierCurveTo(cx - 52, 70, cx - 30, 120, cx, 124);
      ctx.bezierCurveTo(cx + 30, 120, cx + 52, 70, cx + 45, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 124);
      ctx.lineTo(cx, h - 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 40, h - 10);
      ctx.lineTo(cx + 40, h - 10);
      ctx.stroke();
    } else if (glass === 'pilsner') {
      // 풋티드 필스너 (싱가폴 슬링·선라이즈)
      ctx.beginPath();
      ctx.moveTo(cx - 70, 8);
      ctx.lineTo(cx - 20, 196);
      ctx.lineTo(cx + 20, 196);
      ctx.lineTo(cx + 70, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 196);
      ctx.lineTo(cx, h - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 45, h - 8);
      ctx.lineTo(cx + 45, h - 8);
      ctx.stroke();
    } else if (glass === 'wine') {
      // 화이트와인 글라스 (키르)
      ctx.beginPath();
      ctx.moveTo(cx - 48, 10);
      ctx.bezierCurveTo(cx - 56, 80, cx - 34, 118, cx, 122);
      ctx.bezierCurveTo(cx + 34, 118, cx + 56, 80, cx + 48, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, 122);
      ctx.lineTo(cx, h - 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 44, h - 10);
      ctx.lineTo(cx + 44, h - 10);
      ctx.stroke();
    } else {
      // V형 (쿠페/마티니)
      ctx.beginPath();
      ctx.moveTo(cx - 95, 14);
      ctx.lineTo(cx, 134);
      ctx.lineTo(cx + 95, 14);
      if (glass === 'coupe') {
        // 쿠페는 곡선 보울
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      // 스템 + 베이스
      ctx.beginPath();
      ctx.moveTo(cx, 134);
      ctx.lineTo(cx, 196);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 52, 202);
      ctx.lineTo(cx + 52, 202);
      ctx.stroke();
    }
    // 사선 하이라이트
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (glass === 'highball' || glass === 'collins') {
      ctx.moveTo(cx - 38, 26);
      ctx.lineTo(cx - 38, h - 40);
    } else if (glass === 'rocks') {
      ctx.moveTo(cx - 62, 26);
      ctx.lineTo(cx - 62, h - 44);
    } else {
      ctx.moveTo(cx - 62, 30);
      ctx.lineTo(cx - 18, 108);
    }
    ctx.stroke();
  });
}

/** 셰이커 (금속) */
export function shakerTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'shaker', 170, 260, (ctx, w, h) => {
    const cx = w / 2;
    const metal = (x0: number, x1: number) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#6f7d86');
      g.addColorStop(0.25, '#dfe9ef');
      g.addColorStop(0.5, '#aab8c2');
      g.addColorStop(0.75, '#e8f1f6');
      g.addColorStop(1, '#5d6a73');
      return g;
    };
    // 본체 (아래로 살짝 좁아짐)
    ctx.beginPath();
    ctx.moveTo(cx - 72, 96);
    ctx.lineTo(cx - 58, h - 12);
    ctx.quadraticCurveTo(cx, h, cx + 58, h - 12);
    ctx.lineTo(cx + 72, 96);
    ctx.closePath();
    ctx.fillStyle = metal(cx - 72, cx + 72);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,48,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 탑
    ctx.beginPath();
    ctx.moveTo(cx - 66, 96);
    ctx.lineTo(cx - 46, 40);
    ctx.lineTo(cx + 46, 40);
    ctx.lineTo(cx + 66, 96);
    ctx.closePath();
    ctx.fillStyle = metal(cx - 66, cx + 66);
    ctx.fill();
    ctx.stroke();
    // 캡
    rounded(ctx, cx - 26, 8, 52, 34, 8);
    ctx.fillStyle = metal(cx - 26, cx + 26);
    ctx.fill();
    ctx.stroke();
  });
}

/** 바 스푼 */
export function spoonTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'spoon', 28, 190, (ctx, w, h) => {
    const cx = w / 2;
    const g = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
    g.addColorStop(0, '#9aa4ae');
    g.addColorStop(0.5, '#eef4f8');
    g.addColorStop(1, '#7a848e');
    // 트위스트 핸들
    ctx.strokeStyle = '#c8d2da';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let y = 8; y < h - 40; y += 4) {
      const x = cx + Math.sin(y * 0.35) * 2.2;
      if (y === 8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 보울
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, h - 22, 11, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,58,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/* ---------- 바 소품 ---------- */

/** 얼음통 (금속 버킷 + 얼음 + 집게) */
export function iceBucketTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_ice_bucket', 110, 104, (ctx, w) => {
    const cx = w / 2;
    // 버킷 몸통
    const g = ctx.createLinearGradient(cx - 40, 0, cx + 40, 0);
    g.addColorStop(0, '#6f7d86');
    g.addColorStop(0.3, '#dfe9ef');
    g.addColorStop(0.6, '#aab8c2');
    g.addColorStop(1, '#5d6a73');
    ctx.beginPath();
    ctx.moveTo(cx - 42, 38);
    ctx.lineTo(cx - 32, 96);
    ctx.quadraticCurveTo(cx, 104, cx + 32, 96);
    ctx.lineTo(cx + 42, 38);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,48,0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 림
    ctx.fillStyle = '#c8d4dc';
    rounded(ctx, cx - 46, 32, 92, 10, 5);
    ctx.fill();
    ctx.stroke();
    // 얼음 큐브들
    const cube = (x: number, y: number, s: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(223,242,250,0.9)';
      rounded(ctx, -s / 2, -s / 2, s, s, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-s / 2 + 3, -s / 2 + 3, s * 0.3, 2);
      ctx.restore();
    };
    cube(cx - 22, 26, 20, -0.2);
    cube(cx + 4, 20, 22, 0.15);
    cube(cx + 28, 28, 18, 0.4);
    cube(cx - 2, 34, 16, -0.3);
    // 집게
    ctx.strokeStyle = '#e8c05a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 34, 6);
    ctx.lineTo(cx + 22, 26);
    ctx.moveTo(cx + 40, 8);
    ctx.lineTo(cx + 34, 26);
    ctx.stroke();
  });
}

/** 도구 통 (바스푼 + 지거 꽂힌 유리컵) */
export function toolJarTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_tool_jar', 90, 132, (ctx, w, h) => {
    const cx = w / 2;
    // 바스푼 (트위스트 핸들)
    ctx.strokeStyle = '#c8d2da';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let y = 4; y < 74; y += 3) {
      const x = cx - 14 + Math.sin(y * 0.4) * 2;
      if (y === 4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 지거 (모래시계 모양)
    ctx.fillStyle = '#aab8c2';
    ctx.beginPath();
    ctx.moveTo(cx + 6, 22);
    ctx.lineTo(cx + 26, 22);
    ctx.lineTo(cx + 16, 44);
    ctx.lineTo(cx + 24, 66);
    ctx.lineTo(cx + 8, 66);
    ctx.lineTo(cx + 16, 44);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,48,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 유리컵
    ctx.fillStyle = 'rgba(210,235,245,0.15)';
    ctx.strokeStyle = 'rgba(235,245,250,0.8)';
    ctx.lineWidth = 3;
    rounded(ctx, cx - 30, 60, 60, h - 66, 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 20, 68);
    ctx.lineTo(cx - 20, h - 14);
    ctx.stroke();
  });
}

/** 민트 화분 (가니시) */
export function mintPotTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_mint_pot', 84, 92, (ctx, w, h) => {
    const cx = w / 2;
    // 화분
    const g = ctx.createLinearGradient(cx - 26, 0, cx + 26, 0);
    g.addColorStop(0, '#a86a3a');
    g.addColorStop(0.5, '#c88a4a');
    g.addColorStop(1, '#8a5228');
    ctx.beginPath();
    ctx.moveTo(cx - 28, 54);
    ctx.lineTo(cx - 20, h - 4);
    ctx.lineTo(cx + 20, h - 4);
    ctx.lineTo(cx + 28, 54);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,10,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#b87a3e';
    rounded(ctx, cx - 31, 48, 62, 10, 4);
    ctx.fill();
    ctx.stroke();
    // 민트 잎
    const leaf = (x: number, y: number, s: number, rot: number, col: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,60,20,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.restore();
    };
    leaf(cx - 14, 34, 13, -0.7, '#3e9a3e');
    leaf(cx + 12, 30, 14, 0.6, '#48a848');
    leaf(cx, 20, 15, -0.1, '#54b854');
    leaf(cx - 22, 22, 11, -1.1, '#48a848');
    leaf(cx + 24, 20, 11, 1.0, '#3e9a3e');
  });
}

/** 커팅보드 + 라임 (장식) */
export function citrusBoardTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_citrus_board', 150, 74, (ctx, w, h) => {
    // 보드
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b8834a');
    g.addColorStop(1, '#8a5c2e');
    rounded(ctx, 4, 22, w - 8, h - 28, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,10,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    grain(ctx, 8, 24, w - 16, h - 32, 42);
    // 라임 반쪽 (단면)
    const lime = (x: number, y: number, r: number) => {
      ctx.fillStyle = '#3e8a2e';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8e878';
      ctx.beginPath();
      ctx.arc(x, y, r - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,140,40,0.7)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        const a = (i / 6) * Math.PI * 2 + 0.3;
        ctx.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
        ctx.stroke();
      }
    };
    lime(40, 34, 17);
    lime(76, 28, 14);
    // 웨지
    ctx.fillStyle = '#c8e878';
    ctx.beginPath();
    ctx.moveTo(104, 40);
    ctx.lineTo(134, 28);
    ctx.lineTo(134, 46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3e8a2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(104, 40);
    ctx.lineTo(134, 28);
    ctx.stroke();
  });
}

/** 접힌 바 타월 (장식) */
export function towelTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_towel', 96, 40, (ctx, w, h) => {
    rounded(ctx, 2, 6, w - 4, h - 10, 6);
    ctx.fillStyle = '#e8e4da';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,90,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#b84a4a';
    ctx.fillRect(6, 12, w - 12, 4);
    ctx.fillRect(6, 24, w - 12, 4);
    ctx.strokeStyle = 'rgba(120,110,90,0.35)';
    ctx.beginPath();
    ctx.moveTo(4, h / 2 + 2);
    ctx.lineTo(w - 4, h / 2 + 2);
    ctx.stroke();
  });
}

/** 핀볼 오락기 (바 씬 장식 + 진입 버튼) */
export function arcadeTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_arcade', 104, 170, (ctx, w, h) => {
    const cx = w / 2;
    // 캐비닛
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#4a2a5a');
    g.addColorStop(0.5, '#6a3a7e');
    g.addColorStop(1, '#3a2048');
    rounded(ctx, 8, 26, w - 16, h - 30, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 마퀴 (상단 간판)
    rounded(ctx, 4, 4, w - 8, 26, 6);
    ctx.fillStyle = '#ff4f9e';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe8f4';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PINBALL', cx, 22);
    // 스크린
    rounded(ctx, 16, 38, w - 32, 56, 5);
    ctx.fillStyle = '#120a1e';
    ctx.fill();
    ctx.stroke();
    // 스크린 위 반짝이 (공/범퍼 느낌)
    ctx.fillStyle = '#ffd75a';
    ctx.beginPath();
    ctx.arc(34, 58, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5ad7ff';
    ctx.beginPath();
    ctx.arc(62, 70, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5a8a';
    ctx.beginPath();
    ctx.arc(50, 50, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // 컨트롤 패널
    rounded(ctx, 14, 102, w - 28, 22, 4);
    ctx.fillStyle = '#2a1636';
    ctx.fill();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.arc(30, 113, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5aff8a';
    ctx.beginPath();
    ctx.arc(w - 30, 113, 6, 0, Math.PI * 2);
    ctx.fill();
    // 하단 몸통 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 132);
    ctx.lineTo(w - 14, 132);
    ctx.stroke();
  });
}

/** 두더지 팡 오락기 (청록 캐비닛) */
export function moleArcadeTexture(scene: Phaser.Scene): string {
  return ensureTexture(scene, 'prop_arcade_mole', 104, 170, (ctx, w, h) => {
    const cx = w / 2;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#1c4a56');
    g.addColorStop(0.5, '#2a6a7a');
    g.addColorStop(1, '#143a44');
    rounded(ctx, 8, 26, w - 16, h - 30, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 마퀴
    rounded(ctx, 4, 4, w - 8, 26, 6);
    ctx.fillStyle = '#5ad7ff';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#08303c';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOLE!', cx, 22);
    // 스크린 (풀밭 + 두더지)
    rounded(ctx, 16, 38, w - 32, 56, 5);
    ctx.fillStyle = '#173a1e';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0c2410';
    ctx.beginPath();
    ctx.ellipse(36, 82, 12, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(66, 74, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 두더지 얼굴
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath();
    ctx.arc(36, 70, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.fillRect(32, 67, 2.5, 2.5);
    ctx.fillRect(39, 67, 2.5, 2.5);
    ctx.fillStyle = '#e8a0a0';
    ctx.beginPath();
    ctx.arc(36, 73, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // 컨트롤 패널 (망치 버튼)
    rounded(ctx, 14, 102, w - 28, 22, 4);
    ctx.fillStyle = '#0e2a32';
    ctx.fill();
    ctx.fillStyle = '#ffd75a';
    ctx.beginPath();
    ctx.arc(cx, 113, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 132);
    ctx.lineTo(w - 14, 132);
    ctx.stroke();
  });
}

/** 두더지 (미니게임용, 정면) */
export function moleTexture(scene: Phaser.Scene, golden = false): string {
  return ensureTexture(scene, golden ? 'mole_gold' : 'mole', 100, 96, (ctx, w) => {
    const cx = w / 2;
    const body = golden ? '#e8b83a' : '#8a5a34';
    const belly = golden ? '#f8dc8a' : '#c09468';
    // 몸통
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, 58, 34, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 귀
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx - 24, 28, 9, 0, Math.PI * 2);
    ctx.arc(cx + 24, 28, 9, 0, Math.PI * 2);
    ctx.fill();
    // 배
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(cx, 68, 20, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // 눈
    ctx.fillStyle = '#141414';
    ctx.fillRect(cx - 15, 44, 6, 6);
    ctx.fillRect(cx + 9, 44, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 13, 45, 2, 2);
    ctx.fillRect(cx + 11, 45, 2, 2);
    // 코 + 수염
    ctx.fillStyle = '#e8848a';
    ctx.beginPath();
    ctx.ellipse(cx, 56, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 10, 56);
    ctx.lineTo(cx - 26, 52);
    ctx.moveTo(cx - 10, 60);
    ctx.lineTo(cx - 26, 62);
    ctx.moveTo(cx + 10, 56);
    ctx.lineTo(cx + 26, 52);
    ctx.moveTo(cx + 10, 60);
    ctx.lineTo(cx + 26, 62);
    ctx.stroke();
    // 앞니
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 4, 61, 4, 6);
    ctx.fillRect(cx + 0.5, 61, 4, 6);
    if (golden) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(cx - 22, 36, 3, 0, Math.PI * 2);
      ctx.arc(cx + 26, 70, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/* ---------- UI ---------- */

/** 라운드 버튼 — 플랫 + 하단 뎁스 (촌스러운 광택/굵은 테두리 제거) */
export function buttonTexture(scene: Phaser.Scene, w: number, h: number, color: string): string {
  const key = `btn_${color.replace('#', '')}_${w}x${h}`;
  return ensureTexture(scene, key, w, h, (ctx) => {
    const r = 8; // radius 토큰 고정 (docs/05-ui-style.md)
    const depth = 5;
    // 하단 뎁스 레이어
    rounded(ctx, 1, depth, w - 2, h - depth - 1, r);
    ctx.fillStyle = shade(color, -0.42);
    ctx.fill();
    // 본체 (광택·하이라이트 없음 — 뎁스 레이어만으로 충분)
    rounded(ctx, 1, 1, w - 2, h - depth - 1, r);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

/** 라운드 패널 — 플랫 다크 글래스 */
export function panelTexture(scene: Phaser.Scene, w: number, h: number, opts?: { border?: string; fill?: string }): string {
  const fill = opts?.fill ?? '#170d12';
  const border = opts?.border ?? '#e8a33d';
  const key = `panel_${fill.replace('#', '')}_${border.replace('#', '')}_${w}x${h}`;
  return ensureTexture(scene, key, w, h, (ctx) => {
    rounded(ctx, 1.5, 1.5, w - 3, h - 3, 14);
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 상단 미세 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 3);
    ctx.lineTo(w - 16, 3);
    ctx.stroke();
  });
}
