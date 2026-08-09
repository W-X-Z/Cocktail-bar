/**
 * WebAudio 절차 생성 BGM — 느긋한 재즈 루프 (에셋 0바이트).
 * 브라우저 자동재생 정책 때문에 첫 사용자 입력(pointerdown)에서 start()를 불러야 한다.
 * Phaser 비의존.
 */

const MUTE_KEY = 'paradise-bgm-muted';
const BPM = 84;
const STEPS_PER_BAR = 8; // 스윙 8분음표
const MASTER_GAIN = 0.32;

/** 코드 진행 (1마디씩): Dm9 → G13 → Cmaj9 → Am7 */
const PROGRESSION: Array<{ bass: number; chord: number[] }> = [
  { bass: 38, chord: [50, 57, 60, 65, 64] }, // D2 · D3 A3 C4 F4 E4
  { bass: 43, chord: [55, 59, 62, 65, 64] }, // G2 · G3 B3 D4 F4 E4
  { bass: 36, chord: [55, 59, 60, 64, 62] }, // C2 · G3 B3 C4 E4 D4
  { bass: 33, chord: [57, 60, 64, 67] }, //     A1 · A3 C4 E4 G4
];

const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

class BgmPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private step = 0;
  private nextTime = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }

  /** 사용자 제스처 안에서 호출 (반복 호출 안전) */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    setInterval(() => this.schedule(), 90);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.05);
    }
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* 무시 */
    }
    return this.muted;
  }

  /** 룩어헤드 스케줄러: 0.35초 앞까지 예약 */
  private schedule(): void {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.35) {
      this.playStep(this.step, this.nextTime);
      const beat = 60 / BPM;
      this.nextTime += beat * (this.step % 2 === 0 ? 0.58 : 0.42); // 스윙
      this.step = (this.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const { bass, chord } = PROGRESSION[bar]!;
    const nextBass = PROGRESSION[(bar + 1) % PROGRESSION.length]!.bass;

    // 라이드 느낌 틱: 모든 8분, 정박이 조금 큼
    this.tick(t, inBar % 2 === 0 ? 0.16 : 0.07);

    // 베이스: 1박 루트, 3박 5도, 마지막 8분에 다음 코드로 반음 접근 (짝수 마디)
    if (inBar === 0) this.bass(bass, t, 0.9);
    else if (inBar === 4) this.bass(bass + 7, t, 0.7);
    else if (inBar === 7 && bar % 2 === 1) this.bass(nextBass + 1, t, 0.5);

    // EP 코드: 마디 머리 길게, 홀수 마디 4박 뒤 짧게 리허트
    if (inBar === 0) this.epChord(chord, t, 1.7, 0.16);
    else if (inBar === 5 && bar % 2 === 1) this.epChord(chord, t, 0.9, 0.09);
  }

  private epChord(notes: number[], t: number, decay: number, vel: number): void {
    for (const n of notes) this.ep(n, t + Math.random() * 0.02, decay, vel);
  }

  private ep(midi: number, t: number, decay: number, vel: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq(midi);
    const sub = this.ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = freq(midi);
    sub.detune.value = 5;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    sub.start(t);
    osc.stop(t + decay + 0.05);
    sub.stop(t + decay + 0.05);
  }

  private bass(midi: number, t: number, vel: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  private tick(t: number, vel: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6200;
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.1);
  }
}

export const Bgm = new BgmPlayer();
