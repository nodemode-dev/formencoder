import type { ProbeInfo } from '../../../demo/src/engine/probe';
import type { Source } from '../../../demo/src/engine/source';
import type { GifInfo } from './lib/gifprobe';

export type Role = 'source' | 'output' | 'proxy';
export type Form = 'video' | 'sequence' | 'animation' | 'archive';
export type State = 'loading' | 'ready' | 'working' | 'failed';

export interface SeqInfo {
  pattern: string;
  first: number;
  last: number;
  count: number;
  gaps: number[];
  digits: number;
  ext: string;
}

export interface Expect {
  width: number;
  height: number;
  fps: number;
  duration: number;
  frames: number;
  codec: string;
  audio: boolean;
}

export interface Check {
  label: string;
  want: string;
  got: string;
  ok: boolean;
}

export interface Media {
  id: string;
  name: string;
  role: Role;
  form: Form;
  parent: string;
  origin: 'included' | 'browser';
  label: string;
  state: State;
  progress: number;
  message: string;
  blob: Blob | null;
  size: number;
  source: Source | null;
  probe: ProbeInfo | null;
  gif: GifInfo | null;
  seq: SeqInfo | null;
  frameBlobs: Blob[] | null;
  names: string[];
  thumb: string;
  md5: string;
  md5State: 'idle' | 'running' | 'done';
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  offset: number;
  expect: Expect | null;
  checks: Check[] | null;
  url: string;
}

export function blankMedia(id: string, name: string, role: Role, form: Form): Media {
  return {
    id, name, role, form, parent: '', origin: 'included', label: '', state: 'loading', progress: 0, message: '',
    blob: null, size: 0, source: null, probe: null, gif: null, seq: null, frameBlobs: null, names: [], thumb: '',
    md5: '', md5State: 'idle', width: 0, height: 0, fps: 0, frames: 0, duration: 0, offset: 0, expect: null, checks: null, url: '',
  };
}

export const stemOf = (name: string): string => name.replace(/\.[^.]+$/, '').replace(/_%0\dd$/, '');
export const playable = (m: Media): boolean => (m.form === 'video' || m.form === 'sequence') && !!m.source && m.state !== 'loading';
