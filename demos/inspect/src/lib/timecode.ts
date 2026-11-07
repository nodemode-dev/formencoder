export function isDrop(fps: number): boolean {
  return Math.abs(fps - 29.97) < 0.02 || Math.abs(fps - 59.94) < 0.03;
}

export function timecode(frame: number, fps: number): string {
  const nominal = Math.max(1, Math.round(fps));
  const drop = isDrop(fps) ? Math.round(nominal / 15) : 0;
  let f = Math.max(0, Math.floor(frame));
  if (drop) {
    const per10 = Math.round(fps * 600);
    const perMin = nominal * 60 - drop;
    const tens = Math.floor(f / per10);
    const rest = f % per10;
    f += drop * 9 * tens + (rest > drop ? drop * Math.floor((rest - drop) / perMin) : 0);
  }
  const ff = f % nominal;
  const total = Math.floor(f / nominal);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)}${drop ? ';' : ':'}${p(ff)}`;
}

export function rateLabel(fps: number): string {
  const known: Array<[number, string]> = [[23.976, '23.976'], [24, '24'], [25, '25'], [29.97, '29.97'], [30, '30'], [50, '50'], [59.94, '59.94'], [60, '60']];
  const hit = known.find(([v]) => Math.abs(v - fps) < 0.02);
  return hit ? hit[1] : String(Number(fps.toFixed(3)));
}

export function aspectLabel(w: number, h: number): string {
  if (!w || !h) return '';
  const r = w / h;
  const known: Array<[number, string]> = [[16 / 9, '16:9'], [2, '2:1'], [9 / 16, '9:16'], [4 / 3, '4:3'], [1, '1:1'], [3 / 4, '3:4'], [21 / 9, '21:9']];
  const hit = known.find(([v]) => Math.abs(v - r) / v < 0.01);
  return hit ? hit[1] : r.toFixed(2);
}
