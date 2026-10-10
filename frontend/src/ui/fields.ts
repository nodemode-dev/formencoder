import type { FieldSpec } from '../engine/types';
import { el, q, setChecked, setValue } from './dom';
import { pickFiles } from './file-dialog';
import { icon } from './icons';

export interface FieldControl {
  row: HTMLElement;
  set(value: unknown): void;
  setDisabled(on: boolean): void;
}

const enc = (v: unknown): string => JSON.stringify(v ?? null);

export interface FieldContext {
  sources?: () => Array<{ channels?: number }>;
}

interface RouteChannel { track: number; channel: number; gain?: number }
interface RouteTrack { layout: string; channels: Array<RouteChannel | null> }

const LAYOUT_CHANNELS: Record<string, string[]> = {
  mono: ['M'],
  stereo: ['L', 'R'],
  quad: ['FL', 'FR', 'BL', 'BR'],
  '5.1': ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'],
  '7.1': ['L', 'R', 'C', 'LFE', 'Lss', 'Rss', 'Lrs', 'Rrs'],
};

function routingControl(f: FieldSpec, onChange: (key: string, value: unknown) => void, ctx: FieldContext): FieldControl {
  const row = el(`<div class="fe-field fe-field-wide"><span class="fe-field-label"></span><div class="fe-route"><div class="fe-route-tracks"></div><button class="cv-btn fe-route-add" type="button">${icon('plus', 12)}Add Output Track</button></div></div>`);
  row.dataset.field = f.key;
  q(row, '.fe-field-label').textContent = f.label;
  const list = q(row, '.fe-route-tracks');
  const addBtn = q<HTMLButtonElement>(row, '.fe-route-add');
  let value: RouteTrack[] = [];
  const emit = (): void => onChange(f.key, value);
  const sourceOptions = (): Array<[string, string]> => {
    const out: Array<[string, string]> = [['', 'Silence']];
    (ctx.sources?.() ?? []).forEach((t, ti) => {
      const n = Math.max(1, Number(t.channels) || 1);
      for (let c = 0; c < n; c++) out.push([`${ti}:${c}`, `Source track ${ti + 1}, channel ${c + 1}`]);
    });
    return out;
  };
  const fillSelect = (s: HTMLSelectElement, opts: Array<[string, string]>): void => {
    const sig = opts.map((o) => o[0]).join(',');
    if (s.dataset.sig === sig) return;
    s.dataset.sig = sig;
    s.replaceChildren(...opts.map(([v, label]) => Object.assign(document.createElement('option'), { value: v, textContent: label })));
  };
  const trackNode = (): HTMLElement => {
    const t = el(`<div class="fe-route-track"><div class="fe-route-head"><span class="fe-route-name"></span><select class="fx-select fe-route-layout"></select><span class="fx-flex"></span><button class="cv-icon-btn fe-route-del" type="button" title="Remove this track">${icon('close', 12)}</button></div><div class="fe-route-chans"></div></div>`);
    const layout = q<HTMLSelectElement>(t, '.fe-route-layout');
    const layouts = (f as FieldSpec & { layouts?: string[] }).layouts ?? Object.keys(LAYOUT_CHANNELS);
    for (const l of layouts) layout.appendChild(Object.assign(document.createElement('option'), { value: l, textContent: l === 'quad' ? 'Quad' : l.charAt(0).toUpperCase() + l.slice(1) }));
    layout.addEventListener('change', () => {
      const i = [...list.children].indexOf(t);
      const n = (LAYOUT_CHANNELS[layout.value] ?? ['L', 'R']).length;
      const prev = value[i]?.channels ?? [];
      value = value.map((x, k) => (k === i ? { layout: layout.value, channels: Array.from({ length: n }, (_, c) => prev[c] ?? null) } : x));
      emit();
    });
    q(t, '.fe-route-del').addEventListener('click', () => {
      const i = [...list.children].indexOf(t);
      value = value.filter((_, k) => k !== i);
      emit();
    });
    return t;
  };
  const chanNode = (): HTMLElement => {
    const r = el(`<div class="fe-route-chan"><span class="fe-route-label"></span><select class="fx-select fe-route-src"></select><input class="cv-input fe-num fe-route-gain" type="number" step="0.5" min="-96" max="24" title="Gain (dB)"><span class="fe-unit">dB</span></div>`);
    const src = q<HTMLSelectElement>(r, '.fe-route-src');
    const gain = q<HTMLInputElement>(r, '.fe-route-gain');
    const where = (): [number, number] => {
      const t = r.closest('.fe-route-track') as HTMLElement;
      return [[...list.children].indexOf(t), [...(r.parentElement as HTMLElement).children].indexOf(r)];
    };
    const write = (): void => {
      const [ti, ci] = where();
      const [a, b] = src.value.split(':');
      const next: RouteChannel | null = src.value ? { track: Number(a), channel: Number(b), gain: Number(gain.value) || 0 } : null;
      value = value.map((x, k) => (k === ti ? { ...x, channels: x.channels.map((c, j) => (j === ci ? next : c)) } : x));
      emit();
    };
    src.addEventListener('change', write);
    gain.addEventListener('change', write);
    return r;
  };
  const sync = (n: number, host: HTMLElement, make: () => HTMLElement): void => {
    while (host.childElementCount > n) (host.lastElementChild as HTMLElement).remove();
    while (host.childElementCount < n) host.appendChild(make());
  };
  addBtn.addEventListener('click', () => {
    const srcs = ctx.sources?.() ?? [];
    const first = Math.max(1, Number(srcs[0]?.channels) || 2);
    value = [...value, { layout: first >= 2 ? 'stereo' : 'mono', channels: first >= 2 ? [{ track: 0, channel: 0 }, { track: 0, channel: 1 }] : [{ track: 0, channel: 0 }] }];
    emit();
  });
  return {
    row,
    set: (v) => {
      value = Array.isArray(v) ? (v as RouteTrack[]) : [];
      const opts = sourceOptions();
      sync(value.length, list, trackNode);
      value.forEach((t, ti) => {
        const node = list.children[ti] as HTMLElement;
        q(node, '.fe-route-name').textContent = `Track ${ti + 1}`;
        setValue(q<HTMLSelectElement>(node, '.fe-route-layout'), t.layout);
        const labels = LAYOUT_CHANNELS[t.layout] ?? [];
        const chans = q(node, '.fe-route-chans');
        sync(t.channels.length, chans, chanNode);
        t.channels.forEach((c, ci) => {
          const r = chans.children[ci] as HTMLElement;
          q(r, '.fe-route-label').textContent = labels[ci] ?? `Ch ${ci + 1}`;
          const s = q<HTMLSelectElement>(r, '.fe-route-src');
          fillSelect(s, opts);
          setValue(s, c ? `${c.track}:${c.channel}` : '');
          setValue(q<HTMLInputElement>(r, '.fe-route-gain'), c ? String(c.gain ?? 0) : '0');
          q<HTMLInputElement>(r, '.fe-route-gain').disabled = !c;
        });
      });
    },
    setDisabled: (on) => {
      addBtn.disabled = on;
      for (const x of Array.from(row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('select, input, button'))) x.disabled = on;
    },
  };
}

export function fieldControl(f: FieldSpec, onChange: (key: string, value: unknown) => void, ctx: FieldContext = {}): FieldControl {
  if (f.type === 'routing') return routingControl(f, onChange, ctx);
  const row = el(`<div class="fe-field"><span class="fe-field-label"></span><span class="fe-field-ctl"></span></div>`);
  row.dataset.field = f.key;
  q(row, '.fe-field-label').textContent = f.label;
  const ctl = q(row, '.fe-field-ctl');
  if (f.type === 'bool') {
    const c = el<HTMLInputElement>('<input type="checkbox" class="fx-check">');
    c.addEventListener('change', () => onChange(f.key, c.checked));
    ctl.appendChild(c);
    return { row, set: (v) => setChecked(c, v === true), setDisabled: (on) => { c.disabled = on; } };
  }
  if (f.type === 'select') {
    const s = el<HTMLSelectElement>('<select class="fx-select"></select>');
    for (const [v, label] of f.options ?? []) s.appendChild(Object.assign(document.createElement('option'), { value: enc(v), textContent: label }));
    s.addEventListener('change', () => onChange(f.key, JSON.parse(s.value)));
    ctl.appendChild(s);
    return {
      row,
      set: (v) => {
        const want = enc(v);
        if (![...s.options].some((o) => o.value === want)) s.appendChild(Object.assign(document.createElement('option'), { value: want, textContent: String(v ?? 'Default') }));
        setValue(s, want);
      },
      setDisabled: (on) => { s.disabled = on; },
    };
  }
  if (f.type === 'int' || f.type === 'number') {
    const i = el<HTMLInputElement>(`<input class="cv-input fe-num" type="number">`);
    i.step = String(f.step ?? (f.type === 'int' ? 1 : 0.1));
    if (f.min !== undefined) i.min = String(f.min);
    if (f.max !== undefined) i.max = String(f.max);
    if (f.nullable) i.placeholder = 'Auto';
    i.addEventListener('change', () => {
      const raw = i.value.trim();
      if (raw === '') {
        onChange(f.key, f.nullable ? null : f.min ?? 0);
        return;
      }
      let n = Number(raw);
      if (f.min !== undefined) n = Math.max(f.min, n);
      if (f.max !== undefined) n = Math.min(f.max, n);
      onChange(f.key, f.type === 'int' ? Math.round(n) : n);
    });
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') i.blur();
    });
    ctl.appendChild(i);
    if (f.unit) ctl.appendChild(el(`<span class="fe-unit">${f.unit}</span>`));
    return { row, set: (v) => setValue(i, v === null || v === undefined ? '' : String(v)), setDisabled: (on) => { i.disabled = on; } };
  }
  if (f.type === 'color') {
    const c = el<HTMLInputElement>('<input type="color" class="fx-color">');
    c.addEventListener('change', () => onChange(f.key, c.value));
    ctl.appendChild(c);
    return { row, set: (v) => setValue(c, typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'), setDisabled: (on) => { c.disabled = on; } };
  }
  const i = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false">');
  if (f.nullable) i.placeholder = 'Auto';
  i.addEventListener('change', () => onChange(f.key, i.value === '' && f.nullable ? null : i.value));
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') i.blur();
  });
  ctl.appendChild(i);
  let browse: HTMLButtonElement | null = null;
  if (f.type === 'path') {
    browse = el<HTMLButtonElement>(`<button class="cv-icon-btn" type="button" title="Browse">${icon('folder', 14)}</button>`);
    browse.addEventListener('click', async () => {
      const folder = /folder/i.test(f.key);
      const got = await pickFiles({ title: f.label, mode: folder ? 'folder' : 'open', extensions: f.options?.map(([v]) => String(v)) });
      if (got?.length) onChange(f.key, got[0]);
    });
    ctl.appendChild(browse);
  }
  return {
    row,
    set: (v) => setValue(i, v === null || v === undefined ? '' : String(v)),
    setDisabled: (on) => {
      i.disabled = on;
      if (browse) browse.disabled = on;
    },
  };
}

export function showIf(cond: string | undefined, get: (key: string) => unknown): boolean {
  if (!cond) return true;
  const m = /^([\w.]+)(!?=)(.*)$/.exec(cond);
  if (!m) return true;
  const val = String(get(m[1]));
  const hit = m[3].split('|').includes(val);
  return m[2] === '=' ? hit : !hit;
}
