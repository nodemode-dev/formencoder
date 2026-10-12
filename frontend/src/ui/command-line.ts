import type { CommandSpec } from '../engine/types';
import { toast } from './toast';

const PLAIN = /^[A-Za-z0-9_./:#@%+=,-]+$/;

function quote(v: string): string {
  return v !== '' && PLAIN.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`;
}

export function cliLine(spec: CommandSpec, params: Record<string, unknown>): string {
  const parts = ['./formencoder', spec.id];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      for (const x of v) parts.push(`--${k}`, quote(String(x)));
    } else if (typeof v === 'object') {
      parts.push(`--${k}`, quote(JSON.stringify(v)));
    } else if (v === true) {
      parts.push(`--${k}`);
    } else {
      parts.push(`--${k}`, quote(String(v)));
    }
  }
  return parts.join(' ');
}

export function mcpCall(spec: CommandSpec, params: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
  return `${spec.mcpName || spec.id} ${JSON.stringify(clean)}`;
}

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.className = 'fe-copy-buffer';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    if (!ok) {
      toast(`Could not copy the ${what}`, 'error');
      return;
    }
  }
  toast(`Copied the ${what}`, 'ok');
}
