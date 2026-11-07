import { job } from './job';

export type ListenMode = 'source' | 'delivery';

class Player {
  time = 0;
  playing = false;
  mode: ListenMode = 'source';
  private ctx: AudioContext | null = null;
  private node: AudioBufferSourceNode | null = null;
  private raf = 0;
  private startedAt = 0;
  private startedTime = 0;
  private readonly listeners = new Set<() => void>();

  on(fn: () => void): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private stopAudio(): void {
    try { this.node?.stop(); } catch { this.node = null; }
    this.node?.disconnect();
    this.node = null;
  }

  private startAudio(t: number): void {
    this.stopAudio();
    const delivery = this.mode === 'delivery' && job.processedBuffer;
    const buf = delivery ? job.processedBuffer : job.buffer;
    if (!buf) return;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    const offset = delivery ? t - job.processedOffset : t;
    const when = this.ctx.currentTime + Math.max(0, -offset) + 0.02;
    node.start(when, Math.max(0, offset));
    this.node = node;
    this.startedAt = this.ctx.currentTime + 0.02;
    this.startedTime = t;
  }

  seek(t: number): void {
    this.time = Math.max(0, Math.min(job.duration, t));
    if (job.video && Math.abs(job.video.currentTime - this.time) > 1e-3) job.video.currentTime = this.time;
    if (this.playing) this.startAudio(this.time);
    this.emit();
  }

  setMode(mode: ListenMode): void {
    this.mode = mode;
    if (this.playing) this.startAudio(this.time);
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    if (!job.ready) return;
    if (this.time >= job.duration - 0.05) this.time = 0;
    this.playing = true;
    if (job.video) {
      job.video.currentTime = this.time;
      void job.video.play().catch(() => undefined);
    }
    this.startAudio(this.time);
    const tick = (): void => {
      if (!this.playing) return;
      if (job.video) this.time = job.video.currentTime;
      else if (this.ctx) this.time = this.startedTime + (this.ctx.currentTime - this.startedAt);
      if (this.time >= job.duration - 0.02) { this.pause(); this.time = job.duration; this.emit(); return; }
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.emit();
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    job.video?.pause();
    this.stopAudio();
    this.emit();
  }
}

export const player = new Player();
