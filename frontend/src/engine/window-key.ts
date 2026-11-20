export const WINDOW_KEY_HEADER = 'x-formencoder-window-key';
const STORE = 'formencoder-window-key';

function remembered(): string {
  try { return sessionStorage.getItem(STORE) ?? ''; } catch { return ''; }
}

function remember(value: string): void {
  try { sessionStorage.setItem(STORE, value); } catch { return; }
}

async function keyWorks(value: string): Promise<boolean> {
  try {
    const res = await fetch('/api/window/ticket', { method: 'POST', headers: { 'x-formencoder-local': '1', [WINDOW_KEY_HEADER]: value } });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadWindowKey(): Promise<string> {
  const holder = window as unknown as { __FORMENCODER_WINDOW_KEY?: unknown };
  const given = holder.__FORMENCODER_WINDOW_KEY;
  delete holder.__FORMENCODER_WINDOW_KEY;
  if (typeof given === 'string' && given) return given;
  const kept = remembered();
  if (kept && await keyWorks(kept)) return kept;
  try {
    const res = await fetch('/api/window/key', { method: 'POST', headers: { 'x-formencoder-local': '1' } });
    const body = res.ok ? await res.json() as { key?: unknown } : {};
    if (typeof body.key === 'string' && body.key) {
      remember(body.key);
      return body.key;
    }
  } catch {
    return remembered();
  }
  return remembered();
}
