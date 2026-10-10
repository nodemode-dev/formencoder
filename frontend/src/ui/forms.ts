import type { Ctx } from '../app/ctx';
import type { CommandSpec } from '../engine/types';
import { Dialog } from './dialogs';
import { el, escapeHtml } from './dom';
import { pickFiles } from './file-dialog';
import { icon } from './icons';

type Prop = Record<string, unknown> & { type?: string | string[]; enum?: unknown[]; description?: string; items?: Record<string, unknown> };
type Getter = () => unknown;

const PATHISH = /^(path|folder|destination|transcodeFolder|output|reportFolder)$/;

function typeOf(p: Prop): string {
  if (Array.isArray(p.enum)) return 'enum';
  const t = Array.isArray(p.type) ? p.type[0] : p.type;
  return t || 'string';
}

export async function schemaForm(spec: CommandSpec, initial: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown> | null> {
  const props = (spec.schema?.properties ?? {}) as Record<string, Prop>;
  const required = new Set(spec.schema?.required ?? []);
  const keys = Object.keys(props).sort((a, b) => Number(required.has(b)) - Number(required.has(a)));
  const dialog = new Dialog(spec.label.replace(/\.\.\.$/, ''), 520);
  dialog.scrim.dataset.automationId = `form.${spec.id}`;
  if (spec.doc) dialog.body.appendChild(el(`<p class="cv-note">${escapeHtml(spec.doc)}</p>`));
  const getters: Record<string, Getter> = {};
  const presets = keys.some((k) => /preset/i.test(String(props[k].description ?? '')) || k === 'preset') ? await ctx.presets().catch(() => []) : [];
  for (const k of keys) {
    const p = props[k];
    const t = typeOf(p);
    const v = initial[k];
    const label = `${k}${required.has(k) ? '' : ' (optional)'}`;
    if (k === 'preset' && presets.length) {
      const s = el<HTMLSelectElement>('<select class="fx-select"></select>');
      if (!required.has(k)) s.appendChild(el('<option value="">(none)</option>'));
      for (const pr of presets) s.appendChild(Object.assign(document.createElement('option'), { value: pr.id, textContent: `${pr.category} · ${pr.name}` }));
      if (typeof v === 'string') s.value = v;
      dialog.field(label, s);
      getters[k] = () => s.value || undefined;
      continue;
    }
    if (t === 'enum') {
      const s = el<HTMLSelectElement>('<select class="fx-select"></select>');
      if (!required.has(k)) s.appendChild(el('<option value="">(default)</option>'));
      for (const o of p.enum ?? []) s.appendChild(Object.assign(document.createElement('option'), { value: String(o), textContent: String(o) }));
      if (v !== undefined) s.value = String(v);
      dialog.field(label, s);
      getters[k] = () => s.value || undefined;
      continue;
    }
    if (t === 'boolean') {
      const c = el<HTMLInputElement>('<input type="checkbox" class="fx-check">');
      c.checked = v === true;
      dialog.field(label, c);
      getters[k] = () => (c.checked ? true : required.has(k) ? false : undefined);
      continue;
    }
    if (t === 'number' || t === 'integer') {
      const i = el<HTMLInputElement>(`<input class="cv-input" type="number" step="${t === 'integer' ? '1' : 'any'}">`);
      if (v !== undefined && v !== null) i.value = String(v);
      dialog.field(label, i);
      getters[k] = () => (i.value.trim() === '' ? undefined : Number(i.value));
      continue;
    }
    if (t === 'array' || t === 'object') {
      const area = el<HTMLTextAreaElement>('<textarea class="cv-input fe-json" rows="3" spellcheck="false"></textarea>');
      const strings = t === 'array' && (p.items as Prop | undefined)?.type === 'string';
      area.value = v === undefined ? '' : strings && Array.isArray(v) ? (v as string[]).join('\n') : JSON.stringify(v, null, 1);
      area.placeholder = strings ? 'one per line' : 'JSON';
      dialog.field(label, area);
      getters[k] = () => {
        const raw = area.value.trim();
        if (!raw) return undefined;
        if (strings && !raw.startsWith('[')) return raw.split('\n').map((x) => x.trim()).filter(Boolean);
        return JSON.parse(raw);
      };
      continue;
    }
    const wrap = el('<div class="fe-form-path"></div>');
    const i = el<HTMLInputElement>('<input class="cv-input" type="text" spellcheck="false">');
    if (v !== undefined && v !== null) i.value = String(v);
    wrap.appendChild(i);
    if (PATHISH.test(k)) {
      const b = el<HTMLButtonElement>(`<button class="cv-icon-btn" type="button" title="Browse">${icon('folder', 15)}</button>`);
      b.addEventListener('click', async () => {
        const got = await pickFiles({ title: k, mode: /folder|destination/i.test(k) ? 'folder' : 'open' });
        if (got?.length) i.value = got[0];
      });
      wrap.appendChild(b);
    }
    dialog.field(label, wrap);
    getters[k] = () => i.value.trim() || undefined;
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: Record<string, unknown> | null): void => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.scrim.remove();
      resolve(v);
    };
    dialog.onClose = () => finish(null);
    dialog.button('Cancel', 'ghost', () => finish(null));
    dialog.button(spec.label.replace(/\.\.\.$/, ''), 'primary', () => {
      const out: Record<string, unknown> = {};
      try {
        for (const [k, g] of Object.entries(getters)) {
          const val = g();
          if (val !== undefined) out[k] = val;
        }
      } catch (e) {
        dialog.setTitle(`Not JSON: ${(e as Error).message}`);
        return;
      }
      finish(out);
    });
    dialog.open();
  });
}
