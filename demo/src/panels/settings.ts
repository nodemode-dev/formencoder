import { Dialog } from '../../../frontend/src/ui/dialogs';
import { el, q, setHidden, setText } from '../../../frontend/src/ui/dom';
import { planFor, type Settings } from '../engine/encode';
import { AUDIO_TARGETS, PRESET_BY_ID, presetSize } from '../engine/presets';
import { store, type Item, type Output } from '../state';

interface Fields {
  size: HTMLSelectElement;
  fps: HTMLSelectElement;
  mbps: HTMLSelectElement;
  codec: HTMLSelectElement;
  audio: HTMLInputElement;
  lufs: HTMLSelectElement;
  start: HTMLInputElement;
  end: HTMLInputElement;
  summary: HTMLElement;
  rows: Record<string, HTMLElement>;
}

let dialog: Dialog | null = null;
let f: Fields;
let target: { item: Item; out: Output } | null = null;

function select(options: Array<[string, string]>): HTMLSelectElement {
  const s = el<HTMLSelectElement>('<select class="fx-select"></select>');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    s.appendChild(o);
  }
  return s;
}

function row(label: string, control: HTMLElement): HTMLElement {
  const r = el(`<div class="fe-field"><span></span><div class="fe-field-ctl"></div></div>`);
  setText(q(r, 'span'), label);
  q(r, '.fe-field-ctl').appendChild(control);
  return r;
}

function build(): Dialog {
  const d = new Dialog('Export Settings', 520);
  const size = select([['preset', 'Preset'], ['source', 'Match source'], ['320', '320 px wide'], ['480', '480 px wide'], ['640', '640 px wide'], ['854', '854 px wide'], ['1280', '1280 px wide']]);
  const fps = select([['', 'Preset or source'], ['12', '12'], ['15', '15'], ['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60']]);
  const mbps = select([['', 'Automatic'], ['0.5', '0.5 Mb/s'], ['1', '1 Mb/s'], ['2', '2 Mb/s'], ['4', '4 Mb/s'], ['8', '8 Mb/s']]);
  const codec = select([['auto', 'VP9, else VP8'], ['vp9', 'VP9'], ['vp8', 'VP8']]);
  const audio = el<HTMLInputElement>('<input type="checkbox" class="fx-check">');
  const lufs = select([['', 'Off'], ['-23', 'EBU R128, -23 LUFS'], ['-24', 'ATSC A/85, -24 LUFS'], ['-16', 'Podcast, -16 LUFS'], ['-14', 'Streaming, -14 LUFS']]);
  const start = el<HTMLInputElement>('<input class="cv-input fe-num" type="number" min="0" step="0.1">');
  const end = el<HTMLInputElement>('<input class="cv-input fe-num" type="number" min="0" step="0.1" placeholder="end">');
  const range = el('<div class="fe-field-ctl"></div>');
  range.appendChild(start);
  range.appendChild(el('<span class="fe-unit">to</span>'));
  range.appendChild(end);
  range.appendChild(el('<span class="fe-unit">seconds</span>'));
  const summary = el('<div class="fe-es-summary"></div>');
  const rows: Record<string, HTMLElement> = {
    size: row('Frame size', size),
    fps: row('Frame rate', fps),
    mbps: row('Bitrate', mbps),
    codec: row('Video codec', codec),
    audio: row('Include audio', audio),
    lufs: row('Loudness target', lufs),
    range: el('<div class="fe-field"><span>Range</span></div>'),
  };
  rows.range.appendChild(range);
  for (const r of Object.values(rows)) d.body.appendChild(r);
  d.body.appendChild(summary);
  f = { size, fps, mbps, codec, audio, lufs, start, end, summary, rows };
  const refresh = (): void => paintSummary();
  for (const c of [size, fps, mbps, codec, lufs, start, end, audio]) c.addEventListener('input', refresh);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('OK', 'primary', () => { apply(); d.close(); });
  return d;
}

function read(): Settings {
  const sizeVal = f.size.value;
  return {
    size: sizeVal === 'preset' || sizeVal === 'source' ? sizeVal : Number(sizeVal),
    fps: f.fps.value ? Number(f.fps.value) : null,
    mbps: f.mbps.value ? Number(f.mbps.value) : null,
    codec: f.codec.value as Settings['codec'],
    audio: f.audio.checked,
    lufs: f.lufs.value ? Number(f.lufs.value) : null,
    start: Math.max(0, Number(f.start.value) || 0),
    end: f.end.value ? Number(f.end.value) : null,
  };
}

function paintSummary(): void {
  if (!target) return;
  const preset = PRESET_BY_ID.get(target.out.presetId);
  if (!preset?.target) { setText(f.summary, 'This preset needs the desktop engine. The browser demo cannot write its format.'); return; }
  const s = read();
  const plan = planFor(target.item.source, preset, s);
  const dur = plan.end - plan.start;
  if (AUDIO_TARGETS.has(preset.target)) {
    setText(f.summary, `${preset.name}: ${dur.toFixed(2)} s of audio${s.lufs !== null ? `, normalised to ${s.lufs} LUFS` : ''}.`);
    return;
  }
  if (preset.target === 'png' || preset.target === 'jpeg') { setText(f.summary, `One still, ${plan.width}x${plan.height}, at ${plan.start.toFixed(2)} s.`); return; }
  const bits = [`${plan.width}x${plan.height}`, `${plan.fps} fps`, `${plan.frames} frames`];
  if (preset.target === 'webm') bits.push(`${plan.mbps.toFixed(1)} Mb/s`);
  setText(f.summary, `${bits.join(' · ')}${plan.capped ? ' · size capped in the browser demo' : ''}`);
}

function apply(): void {
  if (!target) return;
  target.out.settings = read();
  store.resetOutput(target.out);
  store.log(`Export Settings changed for ${target.out.fileName}`);
}

export function openSettings(outputId: string): void {
  const hit = store.outputOf(outputId);
  if (!hit) return;
  if (store.running) { store.log('Export Settings opens when the queue is idle'); return; }
  dialog ??= build();
  target = { item: hit.item, out: hit.output };
  const preset = PRESET_BY_ID.get(hit.output.presetId);
  const t = preset?.target ?? null;
  const s = hit.output.settings;
  dialog.setTitle(`Export Settings · ${preset?.name ?? ''}`);
  const sizeLabel = f.size.options[0];
  sizeLabel.textContent = preset && presetSize(preset) ? `Preset (${presetSize(preset)})` : 'Preset';
  f.size.value = typeof s.size === 'number' ? String(s.size) : s.size;
  if (f.size.value !== String(s.size) && typeof s.size === 'number') f.size.value = 'preset';
  f.fps.value = s.fps ? String(s.fps) : '';
  f.mbps.value = s.mbps ? String(s.mbps) : '';
  f.codec.value = s.codec;
  f.audio.checked = s.audio;
  f.lufs.value = s.lufs !== null ? String(s.lufs) : '';
  f.start.value = String(s.start);
  f.end.value = s.end !== null ? String(s.end) : '';
  const isAudio = t !== null && AUDIO_TARGETS.has(t);
  const hasAudioPath = isAudio || t === 'webm';
  setHidden(f.rows.size, isAudio || !t);
  setHidden(f.rows.fps, isAudio || !t || t === 'png' || t === 'jpeg');
  setHidden(f.rows.mbps, t !== 'webm');
  setHidden(f.rows.codec, t !== 'webm');
  setHidden(f.rows.audio, t !== 'webm');
  setHidden(f.rows.lufs, !hasAudioPath);
  setHidden(f.rows.range, !t);
  paintSummary();
  dialog.open(q(dialog.scrim, '.cv-btn-primary'));
}
