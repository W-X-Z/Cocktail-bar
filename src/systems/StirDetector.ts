/**
 * 스터링(원형 드래그) 감지기.
 * 중심점 기준 포인터 각도 변화량을 누적하고,
 * 1회전(2π)을 스터링 1초로 환산한다.
 */
export class StirDetector {
  private static readonly RADIANS_PER_SECOND = Math.PI * 2; // 1바퀴 = 1초

  private centerX = 0;
  private centerY = 0;
  private lastAngle: number | null = null;
  /** 누적 스터링 시간(초) */
  activeSeconds = 0;
  /** 이번 프레임에 저은 정도 (연출용, 라디안) */
  lastDelta = 0;

  setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  pointerMove(x: number, y: number, isDown: boolean): void {
    this.lastDelta = 0;
    if (!isDown) {
      this.lastAngle = null;
      return;
    }
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    if (Math.hypot(dx, dy) < 20) return; // 중심에 너무 가까우면 각도 불안정
    const angle = Math.atan2(dy, dx);
    if (this.lastAngle !== null) {
      let d = angle - this.lastAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      const abs = Math.abs(d);
      if (abs < Math.PI / 2) {
        // 순간이동(반대편 점프)은 무시
        this.activeSeconds += abs / StirDetector.RADIANS_PER_SECOND;
        this.lastDelta = d;
      }
    }
    this.lastAngle = angle;
  }

  resetSession(): void {
    this.activeSeconds = 0;
    this.lastAngle = null;
    this.lastDelta = 0;
  }
}
