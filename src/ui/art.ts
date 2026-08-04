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
  const W = 56;
  const H = tall ? 150 : 120;
  return ensureTexture(scene, key, W, H, (ctx, w, h) => {
    const cx = w / 2;
    const bodyW = 19;
    const neckW = 7;
    const capTop = 4;
    const neckTop = 18;
    const shoulderY = h * 0.34;
    const bodyTop = h * 0.44;
    const bottom = h - 6;

    // 실루엣
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

    const g = ctx.createLinearGradient(cx - bodyW, 0, cx + bodyW, 0);
    g.addColorStop(0, shade(liquid, 0.3));
    g.addColorStop(0.45, liquid);
    g.addColorStop(1, shade(liquid, -0.42));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 유리 반사
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rounded(ctx, cx - bodyW + 5, bodyTop + 4, 5, bottom - bodyTop - 16, 3);
    ctx.fill();

    // 라벨
    ctx.fillStyle = 'rgba(244,236,216,0.92)';
    rounded(ctx, cx - bodyW + 4, h * 0.58, bodyW * 2 - 8, h * 0.17, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.5)';
    ctx.lineWidth = 1.5;
    rounded(ctx, cx - bodyW + 6.5, h * 0.58 + 3, bodyW * 2 - 13, h * 0.17 - 6, 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,60,30,0.55)';
    ctx.fillRect(cx - bodyW + 9, h * 0.58 + h * 0.06, bodyW * 2 - 18, 2.5);
    ctx.fillRect(cx - bodyW + 12, h * 0.58 + h * 0.06 + 6, bodyW * 2 - 24, 2);

    // 캡
    ctx.fillStyle = '#2c2c34';
    rounded(ctx, cx - neckW - 1.5, capTop, neckW * 2 + 3, neckTop - capTop + 4, 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - neckW + 1, capTop + 2, 3, neckTop - capTop);
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
    if (glass === 'highball') {
      ctx.moveTo(cx - 48, 26);
      ctx.lineTo(cx - 48, h - 40);
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

/* ---------- UI ---------- */

/** 라운드 버튼 (그라데이션 + 하이라이트) */
export function buttonTexture(scene: Phaser.Scene, w: number, h: number, color: string): string {
  const key = `btn_${color.replace('#', '')}_${w}x${h}`;
  return ensureTexture(scene, key, w, h, (ctx) => {
    const r = Math.min(18, h / 3);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(color, 0.22));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.28));
    rounded(ctx, 2, 2, w - 4, h - 4, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 상단 하이라이트
    const hi = ctx.createLinearGradient(0, 2, 0, h * 0.45);
    hi.addColorStop(0, 'rgba(255,255,255,0.35)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    rounded(ctx, 5, 4, w - 10, h * 0.42, r * 0.8);
    ctx.fillStyle = hi;
    ctx.fill();
  });
}

/** 라운드 패널 */
export function panelTexture(scene: Phaser.Scene, w: number, h: number, opts?: { border?: string; fill?: string }): string {
  const fill = opts?.fill ?? '#1e1016';
  const border = opts?.border ?? '#e8a33d';
  const key = `panel_${fill.replace('#', '')}_${border.replace('#', '')}_${w}x${h}`;
  return ensureTexture(scene, key, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(fill, 0.1));
    g.addColorStop(1, shade(fill, -0.25));
    rounded(ctx, 2, 2, w - 4, h - 4, 14);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.97;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}
