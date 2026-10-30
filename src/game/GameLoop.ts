/**
 * Laço principal baseado em requestAnimationFrame, com limite opcional de FPS e medição real
 * do tempo de quadro. A simulação usa FixedTimestep separadamente (independente da taxa de quadros).
 */
export class GameLoop {
  running = false;
  /** 0 = sem limite (sincronizado com o monitor). */
  fpsLimit = 0;
  fps = 0;
  frameMs = 0;
  private raf = 0;
  private last = 0;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(private readonly onFrame: (dt: number, now: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const elapsed = now - this.last;
    if (this.fpsLimit > 0 && elapsed < 1000 / this.fpsLimit - 1.5) return;
    this.last = now;
    const dt = Math.min(elapsed / 1000, 0.25);
    const start = performance.now();
    this.onFrame(dt, now);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - start) * 0.1;
    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime >= 500) {
      this.fps = (this.fpsFrames * 1000) / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  };
}
