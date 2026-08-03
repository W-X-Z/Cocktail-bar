/**
 * 셰이크 입력 통합 감지기.
 * - 모바일: devicemotion 가속도 크기가 임계값을 넘으면 "흔드는 중"
 * - 폴백(데스크톱/권한 거부): 포인터를 빠르게 왕복 드래그하면 흔드는 중으로 인정
 * 씬은 update(dt)를 호출하고 isShaking / activeSeconds만 읽는다.
 */
export class ShakeDetector {
  private static readonly ACCEL_THRESHOLD = 12; // m/s^2, 중력 제외
  private static readonly HOLD_MS = 300; // 마지막 틱 이후 이 시간까지 "흔드는 중" 유지

  private lastTickAt = -Infinity;
  private now = 0;
  /** 누적 셰이킹 시간(초) */
  activeSeconds = 0;

  private motionHandler = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    let mag = 0;
    if (a && (a.x !== null || a.y !== null || a.z !== null)) {
      mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    } else if (e.accelerationIncludingGravity) {
      const g = e.accelerationIncludingGravity;
      mag = Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81);
    }
    if (mag > ShakeDetector.ACCEL_THRESHOLD) this.lastTickAt = this.now;
  };

  // 포인터 폴백: 이동 방향이 자주 뒤집히는 빠른 드래그
  private lastPointerX = 0;
  private lastDir = 0;

  /** iOS 13+ 권한 요청 포함. 유저 제스처 컨텍스트에서 호출할 것 */
  async start(): Promise<void> {
    type PermissionFn = () => Promise<'granted' | 'denied'>;
    const req = (DeviceMotionEvent as unknown as { requestPermission?: PermissionFn })
      .requestPermission;
    if (typeof req === 'function') {
      try {
        const res = await req();
        if (res !== 'granted') return; // 거부 시 포인터 폴백만 사용
      } catch {
        return;
      }
    }
    window.addEventListener('devicemotion', this.motionHandler);
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.motionHandler);
  }

  /** 폴백 입력: 씬의 pointermove에서 호출 */
  pointerMove(x: number, isDown: boolean): void {
    if (!isDown) {
      this.lastDir = 0;
      this.lastPointerX = x;
      return;
    }
    const dx = x - this.lastPointerX;
    if (Math.abs(dx) > 6) {
      const dir = Math.sign(dx);
      if (this.lastDir !== 0 && dir !== this.lastDir) {
        this.lastTickAt = this.now; // 방향 반전 = 흔들기 틱
      }
      this.lastDir = dir;
      this.lastPointerX = x;
    }
  }

  get isShaking(): boolean {
    return this.now - this.lastTickAt < ShakeDetector.HOLD_MS;
  }

  update(deltaMs: number): void {
    this.now += deltaMs;
    if (this.isShaking) this.activeSeconds += deltaMs / 1000;
  }

  resetSession(): void {
    this.activeSeconds = 0;
    this.lastTickAt = -Infinity;
    this.lastDir = 0;
  }
}
