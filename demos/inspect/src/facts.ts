import { fmtBytes, fmtDuration } from '../../../frontend/src/ui/format';
import { aspectLabel, rateLabel } from './lib/timecode';
import type { Check, Media } from './model';
import { store } from './store';

export interface Fact {
  key: string;
  label: string;
  value: string;
}

const mbps = (n: number | null | undefined): string => (n ? `${(n / 1e6).toFixed(2)} Mb/s` : '');

export function kindLabel(m: Media): string {
  if (m.form === 'sequence') return 'Image sequence';
  if (m.form === 'animation') return 'Animated GIF';
  if (m.form === 'archive') return 'Numbered frames (ZIP)';
  return m.role === 'proxy' ? 'Video, proxy' : 'Video';
}

export function factsOf(m: Media, loudness: string): Fact[] {
  const rows: Fact[] = [];
  const add = (key: string, label: string, value: string): void => { if (value) rows.push({ key, label, value }); };
  add('kind', 'Kind', kindLabel(m));
  const p = m.probe;
  if (m.form === 'sequence' && m.seq) {
    add('container', 'Container', `Numbered ${m.seq.ext.slice(1).toUpperCase()} files`);
    add('size', 'Size', fmtBytes(m.size));
    add('duration', 'Duration', fmtDuration(m.duration));
    add('vcodec', 'Video', m.seq.ext.slice(1).toUpperCase() === 'JPG' ? 'JPEG, intra only' : m.seq.ext.slice(1).toUpperCase());
    add('frame', 'Frame', `${m.width}x${m.height}`);
    add('shape', 'Shape', aspectLabel(m.width, m.height));
    add('rate', 'Rate', `${rateLabel(m.fps)} fps (set when added)`);
    add('frames', 'Frames', `${m.seq.count}, ${String(m.seq.first).padStart(m.seq.digits, '0')} to ${String(m.seq.last).padStart(m.seq.digits, '0')}${m.seq.gaps.length ? `, ${m.seq.gaps.length} missing` : ', no gaps'}`);
    add('audio', 'Audio', 'None');
  } else if (m.form === 'animation' && m.gif) {
    add('container', 'Container', 'GIF89a');
    add('size', 'Size', fmtBytes(m.size));
    add('duration', 'Duration', fmtDuration(m.gif.duration));
    add('vcodec', 'Video', 'GIF, 256 colours');
    add('frame', 'Frame', `${m.gif.width}x${m.gif.height}`);
    add('shape', 'Shape', aspectLabel(m.gif.width, m.gif.height));
    add('rate', 'Rate', m.gif.duration ? `${rateLabel(m.gif.frames / m.gif.duration)} fps` : '');
    add('frames', 'Frames', String(m.gif.frames));
    add('audio', 'Audio', 'None');
    add('loop', 'Loop', m.gif.loops ? 'Forever' : 'Once');
  } else if (m.form === 'archive') {
    add('container', 'Container', 'ZIP, stored');
    add('size', 'Size', fmtBytes(m.size));
    add('duration', 'Duration', fmtDuration(m.duration));
    add('vcodec', 'Video', m.seq?.ext.slice(1).toUpperCase() ?? '');
    add('frame', 'Frame', m.width ? `${m.width}x${m.height}` : '');
    add('shape', 'Shape', aspectLabel(m.width, m.height));
    add('rate', 'Rate', m.fps ? `${rateLabel(m.fps)} fps` : '');
    if (m.seq) add('frames', 'Frames', `${m.seq.count}, ${String(m.seq.first).padStart(m.seq.digits, '0')} to ${String(m.seq.last).padStart(m.seq.digits, '0')}${m.seq.gaps.length ? `, ${m.seq.gaps.length} missing` : ', no gaps'}`);
    add('audio', 'Audio', 'None');
  } else if (p) {
    add('container', 'Container', p.container);
    add('size', 'Size', fmtBytes(p.size));
    add('duration', 'Duration', fmtDuration(p.duration ?? m.duration));
    add('bitrate', 'Bit rate', mbps(p.bitrate));
    if (p.video) {
      add('vcodec', 'Video', [p.video.codec, p.video.profile].filter(Boolean).join(' '));
      add('frame', 'Frame', `${p.video.width}x${p.video.height}`);
      add('shape', 'Shape', aspectLabel(p.video.width, p.video.height));
      add('rate', 'Rate', p.video.fps ? `${rateLabel(p.video.fps)} fps` : '');
      add('frames', 'Frames', p.video.frames ? String(p.video.frames) : '');
      add('vbit', 'Video rate', mbps(p.video.bitrate));
    }
    const a = p.audio[0];
    add('audio', 'Audio', a ? [a.codec, a.sampleRate ? `${a.sampleRate} Hz` : '', a.channels ? `${a.channels} ch` : ''].filter(Boolean).join(', ') : 'None');
    add('loud', 'Loudness', loudness);
  }
  add('md5', 'MD5', m.md5 ? `${m.md5.slice(0, 12)}...` : m.md5State === 'running' ? 'Reading' : '');
  return rows;
}

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

export function verifyMedia(m: Media): Check[] {
  const e = m.expect;
  const checks: Check[] = [];
  if (!e) return checks;
  if (m.form === 'archive' && m.seq) {
    const sized = m.width === e.width && m.height === e.height;
    checks.push({ label: 'Frame count', want: String(e.frames), got: String(m.seq.count), ok: m.seq.count === e.frames });
    checks.push({ label: 'Numbers', want: `1 to ${e.frames}`, got: `${m.seq.first} to ${m.seq.last}`, ok: m.seq.first === 1 && m.seq.last === e.frames && m.seq.gaps.length === 0 });
    checks.push({ label: 'Frame size', want: `${e.width}x${e.height}`, got: `${m.width}x${m.height}`, ok: sized });
    return checks;
  }
  if (m.form === 'animation' && m.gif) {
    checks.push({ label: 'Frame size', want: `${e.width}x${e.height}`, got: `${m.gif.width}x${m.gif.height}`, ok: m.gif.width === e.width && m.gif.height === e.height });
    checks.push({ label: 'Frame rate', want: `${rateLabel(e.fps)}`, got: m.gif.duration ? `${rateLabel(m.gif.frames / m.gif.duration)}` : '', ok: m.gif.duration > 0 && near(m.gif.frames / m.gif.duration, e.fps, 1.6) });
    checks.push({ label: 'Duration', want: `${e.duration.toFixed(2)} s`, got: `${m.gif.duration.toFixed(2)} s`, ok: near(m.gif.duration, e.duration, Math.max(0.1, 1 / e.fps)) });
    return checks;
  }
  const v = m.probe?.video;
  if (!v) return checks;
  checks.push({ label: 'Frame size', want: `${e.width}x${e.height}`, got: `${v.width}x${v.height}`, ok: v.width === e.width && v.height === e.height });
  checks.push({ label: 'Frame rate', want: rateLabel(e.fps), got: v.fps ? rateLabel(v.fps) : '', ok: !!v.fps && near(v.fps, e.fps, 0.05) });
  const d = m.probe?.duration ?? m.duration;
  checks.push({ label: 'Duration', want: `${e.duration.toFixed(2)} s`, got: `${d.toFixed(2)} s`, ok: near(d, e.duration, Math.max(0.06, 1.5 / e.fps)) });
  checks.push({ label: 'Video codec', want: e.codec, got: v.codec, ok: v.codec.toLowerCase().replace(/\W/g, '').includes(e.codec.toLowerCase().replace(/\W/g, '')) });
  const hasAudio = (m.probe?.audio.length ?? 0) > 0;
  checks.push({ label: 'Audio', want: e.audio ? 'present' : 'none', got: hasAudio ? 'present' : 'none', ok: hasAudio === e.audio });
  if (v.frames && e.frames) checks.push({ label: 'Frames', want: String(e.frames), got: String(v.frames), ok: Math.abs(v.frames - e.frames) <= 1 });
  return checks;
}

export function relinkChecks(proxy: Media, parent: Media): Check[] {
  const pv = proxy.probe?.video;
  const sv = parent.probe?.video;
  if (!pv || !sv) return [];
  const pa = (proxy.probe?.audio.length ?? 0) > 0;
  const sa = (parent.probe?.audio.length ?? 0) > 0;
  const pf = pv.frames ?? Math.round((proxy.probe?.duration ?? proxy.duration) * (pv.fps ?? proxy.fps));
  const sf = sv.frames ?? Math.round((parent.probe?.duration ?? parent.duration) * (sv.fps ?? parent.fps));
  return [
    { label: 'Same frame rate', want: sv.fps ? rateLabel(sv.fps) : '', got: pv.fps ? rateLabel(pv.fps) : '', ok: !!pv.fps && !!sv.fps && near(pv.fps, sv.fps, 0.05) },
    { label: 'Same frame count', want: String(sf), got: String(pf), ok: !!pf && Math.abs(pf - sf) <= 1 },
    { label: 'Same duration', want: `${(parent.probe?.duration ?? parent.duration).toFixed(2)} s`, got: `${(proxy.probe?.duration ?? proxy.duration).toFixed(2)} s`, ok: near(proxy.probe?.duration ?? proxy.duration, parent.probe?.duration ?? parent.duration, 0.08) },
    { label: 'Same shape', want: aspectLabel(sv.width, sv.height), got: aspectLabel(pv.width, pv.height), ok: aspectLabel(sv.width, sv.height) === aspectLabel(pv.width, pv.height) },
    { label: 'Same audio', want: sa ? 'present' : 'none', got: pa ? 'present' : 'none', ok: pa === sa },
  ];
}

export function cardSummary(): string[] {
  const src = store.sources().filter((m) => m.state !== 'loading' && m.fps > 0);
  if (src.length < 2) return [];
  const rates = [...new Set(src.map((m) => rateLabel(m.fps)))];
  const shapes = [...new Set(src.map((m) => aspectLabel(m.width, m.height)))];
  const out: string[] = [];
  out.push(`${src.length} sources, ${rates.length} frame rate${rates.length === 1 ? '' : 's'} (${rates.join(', ')})`);
  out.push(`${shapes.length} frame shape${shapes.length === 1 ? '' : 's'} (${shapes.join(', ')})`);
  return out;
}
