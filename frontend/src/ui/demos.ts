import type { Ctx } from '../app/ctx';
import { DEMOS, type Demo } from '../demos/catalog';
import { api } from '../engine/client';
import { Dialog } from './dialogs';
import { el, escapeHtml } from './dom';
import type { PopupEntry } from './popup';
import { toast } from './toast';

const THUMBS: Record<Demo['id'], string> = {
  queue: `<svg viewBox="0 0 160 90" aria-hidden="true"><rect x="10" y="10" width="140" height="16" rx="3" class="fe-demo-t-row"/><rect x="18" y="31" width="132" height="10" rx="2" class="fe-demo-t-sub"/><rect x="18" y="45" width="132" height="10" rx="2" class="fe-demo-t-sub"/><rect x="10" y="62" width="140" height="16" rx="3" class="fe-demo-t-row"/><rect x="14" y="14" width="22" height="8" rx="2" class="fe-demo-t-acc"/><rect x="14" y="66" width="22" height="8" rx="2" class="fe-demo-t-acc"/><rect x="22" y="33" width="16" height="6" rx="1.5" class="fe-demo-t-chip"/><rect x="22" y="47" width="16" height="6" rx="1.5" class="fe-demo-t-chip"/><rect x="122" y="34" width="22" height="4" rx="2" class="fe-demo-t-acc"/></svg>`,
  broadcast: `<svg viewBox="0 0 160 90" aria-hidden="true"><rect x="10" y="10" width="112" height="70" rx="3" class="fe-demo-t-row"/><rect x="14" y="14" width="30" height="6" rx="1.5" class="fe-demo-t-chip"/><rect x="40" y="42" width="52" height="7" rx="1.5" class="fe-demo-t-sub"/><rect x="30" y="66" width="72" height="8" rx="2" class="fe-demo-t-chip"/><rect x="130" y="10" width="8" height="70" rx="2" class="fe-demo-t-sub"/><rect x="130" y="34" width="8" height="46" rx="2" class="fe-demo-t-acc"/><rect x="142" y="10" width="8" height="70" rx="2" class="fe-demo-t-sub"/><rect x="142" y="40" width="8" height="40" rx="2" class="fe-demo-t-acc"/><line x1="128" y1="30" x2="152" y2="30" class="fe-demo-t-line"/></svg>`,
  inspect: `<svg viewBox="0 0 160 90" aria-hidden="true"><rect x="10" y="10" width="140" height="58" rx="3" class="fe-demo-t-row"/><rect x="10" y="10" width="70" height="58" rx="3" class="fe-demo-t-sub"/><line x1="80" y1="8" x2="80" y2="70" class="fe-demo-t-line"/><rect x="14" y="14" width="10" height="7" rx="1.5" class="fe-demo-t-acc"/><rect x="136" y="14" width="10" height="7" rx="1.5" class="fe-demo-t-chip"/><rect x="10" y="74" width="140" height="6" rx="3" class="fe-demo-t-sub"/><rect x="40" y="73" width="3" height="8" rx="1" class="fe-demo-t-acc"/><rect x="92" y="73" width="3" height="8" rx="1" class="fe-demo-t-acc"/></svg>`,
};

/** The Demos section: one card a demo, found by data-demo-open. */
export function demosHtml(): string {
  return `<section class="fe-demos" data-automation-id="demos">
    <div class="fe-demos-head"><span class="fe-demos-title">Demos</span><span class="fe-demos-note">Each opens as a new queue of real outputs with its own media; Undo brings your queue back</span></div>
    <div class="fe-demos-grid" role="list">${DEMOS.map((d) => `<button class="fe-demo-card" type="button" role="listitem" data-demo-open="${d.id}" data-automation-id="demo.${d.id}">
      <span class="fe-demo-thumb">${THUMBS[d.id]}</span>
      <span class="fe-demo-name">${escapeHtml(d.title)}</span>
      <span class="fe-demo-blurb">${escapeHtml(d.blurb)}</span>
    </button>`).join('')}</div>
  </section>`;
}

/** Help > Demos. */
export function demoMenuEntries(ctx: Ctx): PopupEntry[] {
  return [{ label: 'Demos', id: 'menu.demos', children: () => DEMOS.map((d) => ({ label: `${d.title} Demo`, id: `menu.demo.${d.id}`, run: () => void openDemo(ctx, d.id) })) }];
}

export function bindDemoCards(ctx: Ctx, root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-demo-open]');
    if (!card) return;
    e.stopPropagation();
    void openDemo(ctx, card.dataset.demoOpen ?? '');
  });
  root.addEventListener('dblclick', (e) => {
    if ((e.target as HTMLElement).closest('.fe-demos')) e.stopPropagation();
  });
}

function confirmReplace(demo: Demo, sources: number): Promise<boolean> {
  return new Promise((resolve) => {
    const d = new Dialog(`Open the ${demo.title} demo`, 460);
    d.scrim.dataset.automationId = 'demo.confirm';
    d.body.appendChild(el(`<p class="fx-note">The demo opens as a new queue in place of the ${sources} source${sources === 1 ? '' : 's'} queued now. Nothing is deleted: one Undo brings your queue back, or save it first with File > Save Queue.</p>`));
    let answered = false;
    const answer = (yes: boolean): void => {
      if (answered) return;
      answered = true;
      d.close();
      d.scrim.remove();
      resolve(yes);
    };
    d.onClose = () => answer(false);
    d.button('Cancel', 'ghost', () => answer(false));
    d.button('Open Demo', 'primary', () => answer(true));
    d.open();
  });
}

interface Entry {
  name: string;
  path: string;
  size: number;
}

/** Copies the demo's media from the interface build into the engine's imports folder once, under demo-<id>- names. */
async function stage(demo: Demo): Promise<Map<string, string>> {
  const files = await (await fetch(`/demos/${demo.id}/files.json`)).json() as string[];
  const sys = await api<{ dataDir: string }>('/api/system');
  const sep = sys.dataDir.includes('\\') ? '\\' : '/';
  const folder = `${sys.dataDir}${sep}imports`;
  let have: Entry[] = [];
  try {
    have = (await api<{ entries: Entry[] }>(`/api/fs/list?path=${encodeURIComponent(folder)}`)).entries;
  } catch {
    have = [];
  }
  const out = new Map<string, string>();
  const form = new FormData();
  const send: string[] = [];
  for (const f of files) {
    const res = await fetch(`/demos/${demo.id}/${f}`);
    if (!res.ok) throw new Error(`the build has no ${f} for this demo`);
    const blob = await res.blob();
    const name = `demo-${demo.id}-${f}`;
    const hit = have.find((e) => e.name === name && e.size === blob.size);
    if (hit) out.set(f, hit.path);
    else {
      form.append('files', blob, name);
      send.push(f);
    }
  }
  if (send.length) {
    const r = await api<{ paths: string[] }>('/api/fs/upload', { method: 'POST', body: form });
    send.forEach((f, i) => out.set(f, r.paths[i]));
  }
  return out;
}

let busy = false;

export async function openDemo(ctx: Ctx, id: string): Promise<boolean> {
  const demo = DEMOS.find((d) => d.id === id);
  if (!demo || busy) return false;
  const items = ctx.store.state?.items ?? [];
  if (items.length && !(await confirmReplace(demo, items.length))) return false;
  busy = true;
  try {
    toast(`Opening the ${demo.title} demo`);
    const paths = await stage(demo);
    const at = (f: string): string => {
      const p = paths.get(f);
      if (!p) throw new Error(`the demo has no ${f}`);
      return p;
    };
    const now = ctx.store.state?.items ?? [];
    const steps: Array<{ command: string; params: Record<string, unknown> }> = [];
    if (now.length) steps.push({ command: 'queue.remove', params: { refs: now.map((i) => i.id) } });
    for (const s of demo.sources) {
      const outputs = s.outputs.map((o) => {
        const settings = o.settings ? JSON.parse(JSON.stringify(o.settings)) as Record<string, unknown> : undefined;
        const cap = settings?.captions as { source?: string } | undefined;
        if (cap && s.captions && cap.source === s.captions) cap.source = at(s.captions);
        return { preset: o.preset, ...(settings ? { settings } : {}) };
      });
      steps.push({ command: 'queue.addSource', params: { paths: [at(s.file)], outputs, ...(s.frameRate ? { frameRate: s.frameRate } : {}) } });
    }
    await ctx.client.call('command.batch', { steps, label: `Open the ${demo.title} demo`, atomic: true });
    ctx.ui.emit('showPanel', 'queue');
    if (demo.panel !== 'queue') ctx.ui.emit('showPanel', demo.panel);
    ctx.ui.emit('inspect', { path: at(demo.sources[0].file) });
    toast(`Opened the ${demo.title} demo: press Start to encode it, Undo to go back`, 'ok');
    return true;
  } catch (e) {
    toast(`Could not open the demo: ${(e as Error).message}`, 'error');
    return false;
  } finally {
    busy = false;
  }
}
