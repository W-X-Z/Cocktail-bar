/**
 * 기울기 붓기 감지기.
 * - 모바일: deviceorientation — 붓기 모드 진입 시점의 자세를 기준(0°)으로 잡고,
 *   기기를 기울인 각도(합성)를 붓는 세기로 사용
 * - 폴백(데스크톱/권한 거부): 포인터를 누른 채 아래로 드래그한 거리를 기울기로 환산
 * 씬은 tiltDeg(0~90)만 읽는다. 임계각을 넘으면 붓기 시작, 각도가 클수록 빠르게 나온다.
 */
export class TiltDetector {
  /** 이 각도부터 액체가 나오기 시작 */
  static readonly START_DEG = 22;
  /** 이 각도에서 최대 유량 */
  static readonly MAX_DEG = 65;

  private beta0: number | null = null;
  private gamma0: number | null = null;
  private sensorDeg = 0;
  private hasSensor = false;

  private pointerDeg = 0;
  private dragStartY: number | null = null;

  private orientationHandler = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    this.hasSensor = true;
    if (this.beta0 === null || this.gamma0 === null) {
      // 첫 이벤트를 기준 자세로
      this.beta0 = e.beta;
      this.gamma0 = e.gamma;
    }
    const db = e.beta - this.beta0;
    const dg = e.gamma - this.gamma0;
    this.sensorDeg = Math.min(90, Math.hypot(db, dg));
  };

  /** iOS 13+ 권한 요청 포함. 유저 제스처 컨텍스트에서 호출할 것 */
  async start(): Promise<void> {
    this.resetBaseline();
    type PermissionFn = () => Promise<'granted' | 'denied'>;
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn })
      .requestPermission;
    if (typeof req === 'function') {
      try {
        const res = await req();
        if (res !== 'granted') return; // 거부 시 포인터 폴백만 사용
      } catch {
        return;
      }
    }
    window.addEventListener('deviceorientation', this.orientationHandler);
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.orientationHandler);
    this.resetBaseline();
  }

  /** 모드 재진입 시 현재 자세를 다시 0°로 */
  resetBaseline(): void {
    this.beta0 = null;
    this.gamma0 = null;
    this.sensorDeg = 0;
    this.pointerDeg = 0;
    this.dragStartY = null;
  }

  /** 폴백 입력: 씬의 pointer 이벤트에서 호출. 누른 채 아래로 끌수록 기울기 증가 */
  pointerMove(y: number, isDown: boolean): void {
    if (!isDown) {
      this.dragStartY = null;
      this.pointerDeg = 0;
      return;
    }
    if (this.dragStartY === null) this.dragStartY = y;
    const drag = Math.max(0, y - this.dragStartY);
    this.pointerDeg = Math.min(90, (drag / 300) * 90);
  }

  /** 현재 기울기 (0~90°). 센서가 있으면 센서, 없으면 포인터 폴백 */
  get tiltDeg(): number {
    return this.hasSensor ? this.sensorDeg : this.pointerDeg;
  }

  /** 현재 유량 배율 (0~1). START_DEG 이하 0, MAX_DEG 이상 1 */
  get flowRate(): number {
    const d = this.tiltDeg;
    if (d <= TiltDetector.START_DEG) return 0;
    if (d >= TiltDetector.MAX_DEG) return 1;
    return (d - TiltDetector.START_DEG) / (TiltDetector.MAX_DEG - TiltDetector.START_DEG);
  }
}
