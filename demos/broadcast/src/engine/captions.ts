export interface Cue {
  start: number;
  end: number;
  text: string;
}

export type CaptionFormat = 'srt' | 'vtt' | 'ttml' | 'scc';

export const CAPTION_EXT: Record<CaptionFormat, string> = { srt: 'srt', vtt: 'vtt', ttml: 'ttml', scc: 'scc' };
export const CAPTION_MIME: Record<CaptionFormat, string> = { srt: 'application/x-subrip', vtt: 'text/vtt', ttml: 'application/ttml+xml', scc: 'text/plain' };

function stamp(t: string): number {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d{1,3})/.exec(t.trim());
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

export function parseCues(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length);
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = stamp(a);
    const end = stamp(b.trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const body = lines.slice(at + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');

function clock(t: number, sep: string): string {
  const ms = Math.round(t * 1000);
  return `${pad(ms / 3600000)}:${pad((ms / 60000) % 60)}:${pad((ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
}

export function writeSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${clock(c.start, ',')} --> ${clock(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function writeVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${clock(c.start, '.')} --> ${clock(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function writeTtml(cues: Cue[], language: string): string {
  const ps = cues.map((c) => `      <p begin="${clock(c.start, '.')}" end="${clock(c.end, '.')}">${c.text.split('\n').map(esc).join('<br/>')}</p>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xml:lang="${language}">\n  <head>\n    <styling>\n      <style xml:id="s1" tts:textAlign="center" tts:color="white"/>\n    </styling>\n  </head>\n  <body>\n    <div style="s1">\n${ps}\n    </div>\n  </body>\n</tt>\n`;
}

function odd(b: number): number {
  let ones = 0;
  for (let v = b & 0x7f; v; v >>= 1) ones += v & 1;
  return ones % 2 === 0 ? (b | 0x80) : (b & 0x7f);
}

const hex = (a: number, b: number): string => odd(a).toString(16).padStart(2, '0') + odd(b).toString(16).padStart(2, '0');

const PAC_ROW: Record<number, [number, number]> = {
  11: [0x10, 0x40], 12: [0x13, 0x40], 13: [0x13, 0x60], 14: [0x14, 0x40], 15: [0x14, 0x60],
};

function pac(row: number, indent: number): string {
  const [a, b] = PAC_ROW[row];
  return hex(a, b + 0x10 + (indent >> 2) * 2);
}

function tc(frame: number): string {
  const per10 = 17982;
  const d = Math.floor(frame / per10);
  const m = frame % per10;
  const adj = frame + 18 * d + (m > 1 ? 2 * Math.floor((m - 2) / 1798) : 0);
  const f = adj % 30;
  const s = Math.floor(adj / 30) % 60;
  const mi = Math.floor(adj / 1800) % 60;
  const h = Math.floor(adj / 108000);
  return `${pad(h)}:${pad(mi)}:${pad(s)};${pad(f)}`;
}

export function writeScc(cues: Cue[], startFrames = 0): string {
  const rate = 30000 / 1001;
  const lines: Array<{ at: number; text: string }> = [];
  let floor = 0;
  for (const c of cues) {
    const rows = c.text.split('\n').slice(0, 2);
    const codes: string[] = [hex(0x14, 0x20), hex(0x14, 0x20), hex(0x14, 0x2e), hex(0x14, 0x2e)];
    const first = rows.length === 2 ? 14 : 15;
    rows.forEach((row, i) => {
      const clean = row.replace(/[^\x20-\x7e]/g, '').slice(0, 32);
      const indent = Math.max(0, Math.min(28, ((32 - clean.length) >> 1) & ~3));
      const p = pac(first + i, indent);
      codes.push(p, p);
      for (let k = 0; k < clean.length; k += 2) codes.push(hex(clean.charCodeAt(k), k + 1 < clean.length ? clean.charCodeAt(k + 1) : 0));
    });
    codes.push(hex(0x14, 0x2f), hex(0x14, 0x2f));
    const startFrame = Math.round(c.start * rate) + startFrames;
    const at = Math.max(floor, startFrame - codes.length);
    lines.push({ at, text: codes.join(' ') });
    floor = at + codes.length + 1;
    const endFrame = Math.round(c.end * rate) + startFrames;
    if (endFrame > floor + 2) {
      lines.push({ at: endFrame, text: `${hex(0x14, 0x2c)} ${hex(0x14, 0x2c)}` });
      floor = Math.max(floor, endFrame + 3);
    }
  }
  lines.sort((a, b) => a.at - b.at);
  return `Scenarist_SCC V1.0\n\n${lines.map((l) => `${tc(l.at)}\t${l.text}`).join('\n\n')}\n`;
}

export function writeCaptions(cues: Cue[], format: CaptionFormat, startFrames: number): string {
  if (format === 'vtt') return writeVtt(cues);
  if (format === 'ttml') return writeTtml(cues, 'en');
  if (format === 'scc') return writeScc(cues, startFrames);
  return writeSrt(cues);
}

export interface CaptionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export const MAX_CPS = 17;
export const MAX_CHARS = 42;

export function cps(c: Cue): number {
  return c.text.replace(/\n/g, '').length / Math.max(0.001, c.end - c.start);
}

export function checkCues(cues: Cue[], fps: number): CaptionCheck[] {
  if (!cues.length) return [{ label: 'Captions', ok: false, detail: 'No cues' }];
  const fast = cues.filter((c) => cps(c) > MAX_CPS).length;
  const wide = cues.filter((c) => c.text.split('\n').some((l) => l.length > MAX_CHARS)).length;
  const tall = cues.filter((c) => c.text.split('\n').length > 2).length;
  const short = cues.filter((c) => c.end - c.start < 1).length;
  const gap = 2 / fps;
  const tight = cues.filter((c, i) => i > 0 && c.start - cues[i - 1].end < gap && c.start >= cues[i - 1].end).length;
  const overlap = cues.filter((c, i) => i > 0 && c.start < cues[i - 1].end).length;
  const rows: CaptionCheck[] = [
    { label: 'Cues', ok: true, detail: `${cues.length} cues, first at ${cues[0].start.toFixed(2)} s, last ends ${cues[cues.length - 1].end.toFixed(2)} s` },
    { label: `Reading speed`, ok: fast === 0, detail: fast ? `${fast} cue${fast > 1 ? 's' : ''} above ${MAX_CPS} characters per second` : `all cues at or under ${MAX_CPS} characters per second` },
    { label: 'Line length', ok: wide === 0, detail: wide ? `${wide} cue${wide > 1 ? 's' : ''} with a line over ${MAX_CHARS} characters` : `no line over ${MAX_CHARS} characters` },
    { label: 'Lines per cue', ok: tall === 0, detail: tall ? `${tall} cue${tall > 1 ? 's' : ''} with more than two lines` : 'two lines at most' },
    { label: 'Duration', ok: short === 0, detail: short ? `${short} cue${short > 1 ? 's' : ''} shorter than one second` : 'no cue shorter than one second' },
    { label: 'Gaps', ok: overlap === 0 && tight === 0, detail: overlap ? `${overlap} overlapping` : tight ? `${tight} gap${tight > 1 ? 's' : ''} under two frames` : 'no overlap, gaps of two frames or more' },
  ];
  return rows;
}
