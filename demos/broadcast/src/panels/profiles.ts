import type { Panel } from '../../../../frontend/src/ui/dock';
import { el, patchList, q, setClass, setText } from '../../../../frontend/src/ui/dom';
import { icon } from '../../../../frontend/src/ui/icons';
import { FORMAT_LABEL, PRESET_BY_ID, presetSize } from '../../../../demo/src/engine/presets';
import { PROFILES, STANDARD_BY_ID, type Profile } from '../engine/standards';
import { job } from '../job';

type Row = { kind: 'group'; name: string } | { kind: 'profile'; profile: Profile };

export class ProfilesPanel implements Panel {
  readonly id = 'profiles';
  readonly title = 'Delivery Profiles';
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor() {
    this.el = el(`<div class="fe-presets fb-profiles">
      <div class="fe-bar">
        <span class="fe-bar-title">${icon('preset', 14)}<span>Delivery Profiles</span></span>
        <span class="fx-flex"></span>
        <span class="fx-note">A profile sets loudness, captions, overlays and the output preset</span>
      </div>
      <div class="fe-p-list fb-prof-list" tabindex="0"></div>
      <div class="fb-spec"><div class="fb-spec-title"></div><div class="fe-kv"></div></div>
    </div>`);
    this.list = q(this.el, '.fb-prof-list');
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-profile]');
      if (row) job.applyProfile(row.dataset.profile as string);
    });
    job.on('profile', () => this.paint());
    job.on('settings', () => this.paintSpec());
    this.paint();
  }

  private rows(): Row[] {
    const out: Row[] = [];
    let group = '';
    for (const p of PROFILES) {
      if (p.group !== group) { group = p.group; out.push({ kind: 'group', name: group }); }
      out.push({ kind: 'profile', profile: p });
    }
    return out;
  }

  private paint(): void {
    patchList(this.list, this.rows(), {
      key: (r) => (r.kind === 'group' ? `g:${r.name}` : `p:${r.profile.id}`),
      create: (r) => (r.kind === 'group'
        ? el('<div class="fe-p-group fb-group"><span class="fe-p-gname"></span></div>')
        : el(`<div class="fb-prof" data-profile="${r.profile.id}"><div class="fb-prof-main"><span class="fb-prof-name"></span><span class="fb-prof-detail"></span></div><span class="fe-badge fb-prof-std"></span><span class="fe-badge fb-prof-run"></span></div>`)),
      update: (n, r) => {
        if (r.kind === 'group') { setText(q(n, '.fe-p-gname'), r.name); return; }
        const p = r.profile;
        setText(q(n, '.fb-prof-name'), PRESET_BY_ID.get(p.presetId)?.name ?? p.id);
        setText(q(n, '.fb-prof-detail'), p.detail);
        const std = STANDARD_BY_ID.get(p.standard);
        setText(q(n, '.fb-prof-std'), `${std?.short ?? ''} ${std?.target ?? ''}`);
        setText(q(n, '.fb-prof-run'), p.runs ? 'Runs here' : 'Desktop');
        setClass(n, 'is-selected', p.id === job.settings.profileId);
        setClass(n, 'is-desk', !p.runs);
      },
    });
    this.paintSpec();
  }

  private paintSpec(): void {
    const p = PROFILES.find((x) => x.id === job.settings.profileId);
    if (!p) return;
    const preset = PRESET_BY_ID.get(p.presetId);
    const s = job.settings;
    const std = STANDARD_BY_ID.get(s.loudness.standard);
    const cap = s.captions;
    const ov = Object.entries(s.overlays).filter(([, v]) => v.enabled).map(([k]) => ({ timecode: 'timecode', name: 'name', text: 'watermark', logo: 'logo' } as Record<string, string>)[k]);
    const rows: Array<[string, string]> = [
      ['Format', `${FORMAT_LABEL[preset?.format ?? ''] ?? preset?.format ?? ''}${preset && presetSize(preset) ? `, ${presetSize(preset)}` : ''}${preset?.fps ? `, ${preset.fps} fps` : ''}`],
      ['Loudness', s.loudness.enabled ? `${std?.label ?? ''}: ${s.loudness.target} LUFS ± ${s.loudness.tolerance} LU, true peak ${s.loudness.truePeak} dBTP${s.loudness.limiter ? ', limiter' : ''}` : 'Not normalised'],
      ['Captions', cap.mode === 'none' ? 'None' : cap.mode === 'burnin' ? 'Burned in' : cap.mode === 'sidecar' ? `Sidecar, ${cap.format.toUpperCase()}` : 'Embedded track'],
      ['Overlays', ov.length ? ov.join(', ') : 'None'],
      ['Levels', s.videoLimiter.enabled ? `Video limiter at ${s.videoLimiter.max} %` : 'Off'],
    ];
    setText(q(this.el, '.fb-spec-title'), `${preset?.name ?? ''}${p.runs ? '' : ' · desktop engine only'}`);
    patchList(q(this.el, '.fe-kv'), rows, {
      key: ([k]) => k,
      create: () => el('<div class="fe-kv-row"><span></span><span></span></div>'),
      update: (n, [k, v]) => { setText(n.children[0], k); setText(n.children[1], v); },
    });
  }
}
