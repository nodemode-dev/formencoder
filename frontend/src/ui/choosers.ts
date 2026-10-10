import type { Ctx } from '../app/ctx';
import type { PresetRow } from '../engine/types';
import type { PopupEntry } from './popup';

export interface FormatRow {
  id: string;
  label: string;
  group: string;
  ext: string;
  image: boolean;
  audioOnly: boolean;
}

let formatCache: FormatRow[] | null = null;

export async function formats(ctx: Ctx): Promise<FormatRow[]> {
  if (!formatCache) {
    const r = await ctx.client.exec<{ formats: FormatRow[] }>('format.list', {});
    formatCache = r.formats;
  }
  return formatCache;
}

export async function formatEntries(ctx: Ctx, current: string, run: (id: string) => void): Promise<PopupEntry[]> {
  const rows = await formats(ctx);
  const groups = new Map<string, FormatRow[]>();
  for (const f of rows) {
    const g = f.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)?.push(f);
  }
  return [...groups.entries()].map(([g, list]) => ({
    label: g,
    children: list.map((f) => ({ label: f.label, checked: f.id === current, run: () => run(f.id) })),
  }));
}

export function groupPresets(rows: PresetRow[]): Map<string, PresetRow[]> {
  const out = new Map<string, PresetRow[]>();
  for (const p of rows) {
    const g = p.system ? p.category || 'System' : `User · ${p.group || 'Presets'}`;
    if (!out.has(g)) out.set(g, []);
    out.get(g)?.push(p);
  }
  return out;
}

export async function presetEntries(ctx: Ctx, current: string | null, run: (id: string) => void, kind: 'encode' | 'ingest' = 'encode', format?: string): Promise<PopupEntry[]> {
  const rows = (await ctx.presets()).filter((p) => p.kind === kind && (!format || p.format === format));
  const groups = groupPresets(rows);
  const out: PopupEntry[] = [];
  if (format && rows.length <= 18) {
    for (const p of rows) out.push({ label: p.system ? p.name : `${p.name} (user)`, checked: p.id === current, run: () => run(p.id) });
    return out;
  }
  for (const [g, list] of groups) out.push({ label: g, children: list.map((p) => ({ label: p.name, checked: p.id === current, run: () => run(p.id) })) });
  return out;
}
