export interface Source {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  sample: boolean;
  size: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  frame(t: number): Promise<CanvasImageSource>;
  audio(): Promise<AudioBuffer | null>;
  dispose(): void;
}

let counter = 0;
const nextId = (): string => `src${++counter}`;

export const SAMPLE_RATE = 48000;

function once(target: EventTarget, ok: string, bad: string, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(`timed out waiting for ${ok}`)); }, ms);
    const good = (): void => { cleanup(); resolve(); };
    const fail = (): void => { cleanup(); reject(new Error('the browser cannot decode this file')); };
    const cleanup = (): void => {
      window.clearTimeout(timer);
      target.removeEventListener(ok, good);
      target.removeEventListener(bad, fail);
    };
    target.addEventListener(ok, good);
    target.addEventListener(bad, fail);
  });
}

async function mediaDuration(v: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(v.duration)) return v.duration;
  v.currentTime = 1e101;
  await once(v, 'durationchange', 'error', 4000).catch(() => undefined);
  const d = Number.isFinite(v.duration) ? v.duration : 0;
  v.currentTime = 0;
  return d;
}

async function measureFps(v: HTMLVideoElement): Promise<number> {
  const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(v);
  if (!rvfc) return 30;
  const times: number[] = [];
  return new Promise<number>((resolve) => {
    const finish = (): void => {
      v.pause();
      v.currentTime = 0;
      const d: number[] = [];
      for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) d.push(times[i] - times[i - 1]);
      d.sort((a, b) => a - b);
      const med = d.length ? d[d.length >> 1] : 1 / 30;
      const fps = 1 / med;
      const known = [12, 15, 23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
      const near = known.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
      resolve(Math.abs(near - fps) / near < 0.04 ? near : Math.round(fps * 100) / 100);
    };
    const tick = (_now: number, meta: { mediaTime: number }): void => {
      times.push(meta.mediaTime);
      if (times.length >= 14) finish();
      else rvfc(tick);
    };
    rvfc(tick);
    v.muted = true;
    void v.play().catch(() => finish());
    window.setTimeout(() => { if (times.length < 14) finish(); }, 1500);
  });
}

export async function openFile(file: File, knownFps: number | null): Promise<Source> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = url;
  try {
    await once(video, 'loadedmetadata', 'error');
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const duration = await mediaDuration(video);
  const hasPicture = video.videoWidth > 0 && video.videoHeight > 0;
  const fps = hasPicture ? knownFps ?? (await measureFps(video)) : 0;
  if (hasPicture) await seek(video, 0);
  let audioPromise: Promise<AudioBuffer | null> | null = null;
  return {
    id: nextId(),
    name: file.name,
    kind: hasPicture ? 'video' : 'audio',
    sample: false,
    size: file.size,
    width: video.videoWidth,
    height: video.videoHeight,
    fps,
    duration,
    async frame(t: number): Promise<CanvasImageSource> {
      await seek(video, Math.max(0, Math.min(t, Math.max(0, duration - 0.001))));
      return video;
    },
    audio(): Promise<AudioBuffer | null> {
      if (!audioPromise) {
        audioPromise = (async () => {
          if (file.size > 600 * 1024 * 1024) return null;
          try {
            const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
            return await ctx.decodeAudioData(await file.arrayBuffer());
          } catch {
            return null;
          }
        })();
      }
      return audioPromise;
    },
    dispose(): void {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

async function seek(v: HTMLVideoElement, t: number): Promise<void> {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return;
  const done = once(v, 'seeked', 'error', 6000);
  v.currentTime = t;
  await done;
}

const SAMPLE_W = 640;
const SAMPLE_H = 360;
const SAMPLE_FPS = 24;
const SAMPLE_SECONDS = 8;

function sampleAudio(): AudioBuffer {
  const n = SAMPLE_RATE * SAMPLE_SECONDS;
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23];
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const step = Math.floor(t * 4);
    const local = t * 4 - step;
    const f = notes[step % notes.length];
    const env = Math.exp(-local * 3.2) * Math.min(1, local * 120);
    const tone = (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.2 * Math.sin(6 * Math.PI * f * t)) * env;
    const beat = t % 1;
    const kick = Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-beat * 18)) * beat) * Math.exp(-beat * 9);
    const hat = (t + 0.5) % 1 < 0.04 ? rnd() * Math.exp(-((t + 0.5) % 1) * 90) : 0;
    const swell = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / SAMPLE_SECONDS - 1.2);
    const pan = 0.5 + 0.35 * Math.sin(2 * Math.PI * t * 0.25);
    const mono = (tone * 0.22 + kick * 0.3 + hat * 0.12) * swell * 0.55;
    l[i] = mono * (1 - pan) * 1.6;
    r[i] = mono * pan * 1.6;
  }
  return buf;
}

function drawSample(ctx: CanvasRenderingContext2D, t: number): void {
  const w = SAMPLE_W, h = SAMPLE_H;
  const hue = (t * 22) % 360;
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, `hsl(${hue}, 55%, 16%)`);
  bg.addColorStop(1, `hsl(${(hue + 70) % 360}, 60%, 28%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];
  bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((w / bars.length) * i, 0, w / bars.length + 1, 34); });
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let x = (-(t * 40) % 40); x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 34; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const cx = w / 2 + Math.sin(t * 1.7) * 190;
  const cy = 190 + Math.cos(t * 2.3) * 70;
  for (let k = 8; k >= 0; k--) {
    const tt = t - k * 0.035;
    const x = w / 2 + Math.sin(tt * 1.7) * 190;
    const y = 190 + Math.cos(tt * 2.3) * 70;
    ctx.fillStyle = `rgba(242, 84, 91, ${0.9 - k * 0.09})`;
    ctx.beginPath();
    ctx.arc(x, y, 26 - k * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, t * 3, t * 3 + Math.PI * 1.3);
  ctx.stroke();
  const level = 0.5 + 0.5 * Math.sin(t * 6);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(18, 300, 604, 14);
  ctx.fillStyle = '#f2545b';
  ctx.fillRect(18, 300, 604 * (t / SAMPLE_SECONDS), 14);
  ctx.fillStyle = `rgba(255,255,255,${0.5 + level * 0.4})`;
  ctx.fillRect(18 + 604 * (t / SAMPLE_SECONDS) - 2, 296, 4, 22);
  const total = Math.floor(t * SAMPLE_FPS);
  const s = Math.floor(total / SAMPLE_FPS);
  const f = total % SAMPLE_FPS;
  ctx.fillStyle = '#fff';
  ctx.font = '600 44px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`, 20, 96);
  ctx.font = '500 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('formencoder sample · generated in this page · 640x360 · 24 fps', 20, 344);
}

export function createSample(): Source {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D;
  let audio: AudioBuffer | null = null;
  return {
    id: nextId(),
    name: 'formencoder-sample',
    kind: 'video',
    sample: true,
    size: 0,
    width: SAMPLE_W,
    height: SAMPLE_H,
    fps: SAMPLE_FPS,
    duration: SAMPLE_SECONDS,
    async frame(t: number): Promise<CanvasImageSource> {
      drawSample(ctx, Math.max(0, Math.min(t, SAMPLE_SECONDS)));
      return canvas;
    },
    async audio(): Promise<AudioBuffer | null> {
      if (!audio) audio = sampleAudio();
      return audio;
    },
    dispose(): void {
      audio = null;
    },
  };
}
