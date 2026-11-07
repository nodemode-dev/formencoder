import type { Cue } from './captions';

export type Position = 'topLeft' | 'topCenter' | 'topRight' | 'centerLeft' | 'center' | 'centerRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';

export const POSITIONS: Array<[Position, string]> = [
  ['topLeft', 'Top left'], ['topCenter', 'Top center'], ['topRight', 'Top right'],
  ['centerLeft', 'Center left'], ['center', 'Center'], ['centerRight', 'Center right'],
  ['bottomLeft', 'Bottom left'], ['bottomCenter', 'Bottom center'], ['bottomRight', 'Bottom right'],
];

export interface TextStyle {
  enabled: boolean;
  position: Position;
  size: number;
  background: number;
}

export interface OverlaySettings {
  timecode: TextStyle & { start: string; drop: boolean };
  name: TextStyle & { prefix: string };
  text: TextStyle & { text: string };
  logo: { enabled: boolean; position: Position; size: number; opacity: number };
}

export interface CaptionStyle {
  burn: boolean;
  size: number;
  color: string;
  background: number;
  position: 'bottom' | 'top';
}

export interface OverlayInput {
  overlays: OverlaySettings;
  captions: CaptionStyle;
  cues: Cue[];
  fps: number;
  name: string;
  logo: CanvasImageSource | null;
}

export function parseTimecode(s: string): number {
  const m = /^(\d+):(\d\d):(\d\d)[:;.](\d\d)$/.exec(s.trim());
  if (!m) return 0;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 30 + Number(m[4]);
}

export function timecode(frame: number, fps: number, startText: string, drop: boolean): string {
  const nominal = Math.round(fps);
  const m = /^(\d+):(\d\d):(\d\d)[:;.](\d\d)$/.exec(startText.trim());
  const start = m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * nominal + Number(m[4]) : 0;
  let n = start + frame;
  if (drop && (nominal === 30 || nominal === 60)) {
    const k = nominal / 30;
    const per10 = 17982 * k;
    const per1 = 1798 * k;
    const d = Math.floor(n / per10);
    const r = n % per10;
    n += 18 * k * d + (r > 2 * k ? 2 * k * Math.floor((r - 2 * k) / per1) : 0);
  }
  const f = n % nominal;
  const s = Math.floor(n / nominal) % 60;
  const mi = Math.floor(n / (nominal * 60)) % 60;
  const h = Math.floor(n / (nominal * 3600));
  const p = (v: number): string => String(v).padStart(2, '0');
  return `${p(h)}:${p(mi)}:${p(s)}${drop ? ';' : ':'}${p(f)}`;
}

function anchor(pos: Position, w: number, h: number, bw: number, bh: number, margin: number): [number, number] {
  const x = pos.endsWith('Left') ? margin : pos.endsWith('Right') ? w - bw - margin : (w - bw) / 2;
  const y = pos.startsWith('top') ? margin : pos.startsWith('bottom') ? h - bh - margin : (h - bh) / 2;
  return [x, y];
}

function badge(g: CanvasRenderingContext2D, text: string, st: TextStyle, w: number, h: number, mono: boolean): void {
  const px = Math.max(10, Math.round((h * st.size) / 100));
  g.font = `${mono ? 500 : 600} ${px}px ${mono ? "'JetBrains Mono', ui-monospace, Menlo, monospace" : "Inter, system-ui, sans-serif"}`;
  g.textBaseline = 'middle';
  const padX = px * 0.55;
  const bw = g.measureText(text).width + padX * 2;
  const bh = px * 1.6;
  const [x, y] = anchor(st.position, w, h, bw, bh, Math.round(h * 0.035));
  if (st.background > 0) {
    g.fillStyle = `rgba(0, 0, 0, ${st.background / 100})`;
    g.beginPath();
    g.roundRect(x, y, bw, bh, px * 0.28);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.fillText(text, x + padX, y + bh / 2 + px * 0.04);
}

export function activeCue(cues: Cue[], t: number): Cue | null {
  for (const c of cues) if (t >= c.start && t < c.end) return c;
  return null;
}

function drawCaption(g: CanvasRenderingContext2D, cue: Cue, st: CaptionStyle, w: number, h: number): void {
  const px = Math.max(12, Math.round((h * st.size) / 100));
  g.font = `600 ${px}px Inter, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const rows = cue.text.split('\n');
  const lineH = px * 1.5;
  const total = rows.length * lineH;
  const top = st.position === 'bottom' ? h - total - h * 0.07 : h * 0.07;
  rows.forEach((row, i) => {
    const bw = g.measureText(row).width + px * 0.9;
    const cy = top + i * lineH + lineH / 2;
    if (st.background > 0) {
      g.fillStyle = `rgba(0, 0, 0, ${st.background / 100})`;
      g.fillRect(w / 2 - bw / 2, cy - lineH / 2, bw, lineH);
    }
    g.fillStyle = st.color;
    g.fillText(row, w / 2, cy + px * 0.04);
  });
  g.textAlign = 'left';
}

export function drawOverlays(g: CanvasRenderingContext2D, w: number, h: number, t: number, input: OverlayInput): void {
  const o = input.overlays;
  const frame = Math.floor(t * input.fps + 1e-6);
  g.save();
  if (o.logo.enabled && input.logo) {
    const lw = (h * o.logo.size) / 100;
    const [x, y] = anchor(o.logo.position, w, h, lw, lw, Math.round(h * 0.035));
    g.globalAlpha = o.logo.opacity / 100;
    g.drawImage(input.logo, x, y, lw, lw);
    g.globalAlpha = 1;
  }
  if (o.timecode.enabled) badge(g, timecode(frame, input.fps, o.timecode.start, o.timecode.drop), o.timecode, w, h, true);
  if (o.name.enabled) badge(g, `${o.name.prefix}${input.name}`, o.name, w, h, false);
  if (o.text.enabled && o.text.text) badge(g, o.text.text, o.text, w, h, false);
  if (input.captions.burn) {
    const cue = activeCue(input.cues, t);
    if (cue) drawCaption(g, cue, input.captions, w, h);
  }
  g.restore();
}
