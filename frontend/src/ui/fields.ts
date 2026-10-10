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

export function fieldControl(f: FieldSpec, onChange: (key: string, value: unknown) => void): FieldControl {
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
