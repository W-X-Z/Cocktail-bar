/**
 * 프레스&홀드 붓기 컨트롤러.
 * 누르고 있으면 병이 점점 깊게 기울고, 손을 떼도 병이 서서히 돌아오며
 * 그동안 액체가 조금 더 나온다(관성) — 오버슈트를 예측하는 것이 스킬.
 */
export class PourController {
  /** 이 각도부터 액체가 나온다 */
  static readonly START_DEG = 20;
  /** 최대 기울기 */
  static readonly MAX_DEG = 85;
  /** 누르는 동안 기울어지는 속도 (deg/s) */
  static readonly RAMP_UP = 70;
  /** 뗀 뒤 되돌아오는 속도 (deg/s) — 느릴수록 관성이 크다 */
  static readonly RAMP_DOWN = 110;

  angle = 0;
  pressing = false;

  update(dtSec: number): void {
    if (this.pressing) {
      this.angle = Math.min(PourController.MAX_DEG, this.angle + PourController.RAMP_UP * dtSec);
    } else if (this.angle > 0) {
      this.angle = Math.max(0, this.angle - PourController.RAMP_DOWN * dtSec);
    }
  }

  /** 현재 유량 배율 0~1 */
  get flow(): number {
    if (this.angle <= PourController.START_DEG) return 0;
    return (this.angle - PourController.START_DEG) / (PourController.MAX_DEG - PourController.START_DEG);
  }

  reset(): void {
    this.angle = 0;
    this.pressing = false;
  }
}
