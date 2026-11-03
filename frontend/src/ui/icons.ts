const S = (body: string, fill = false): string =>
  fill
    ? `<svg viewBox="0 0 24 24" fill="currentColor">${body}</svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<string, string> = {
  agent: S('<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5"/>'),
  check: S('<path d="M5 12.5l4.2 4.2L19 7"/>'),
  chevronRight: S('<path d="M9.5 6l6 6-6 6"/>'),
  chevronLeft: S('<path d="M14.5 6l-6 6 6 6"/>'),
  chevronUp: S('<path d="M6 14.5l6-6 6 6"/>'),
  chevronDown: S('<path d="M6 9.5l6 6 6-6"/>'),
  close: S('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  folder: S('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>'),
  folderOpen: S('<path d="M3.5 17.5V7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H18a1.5 1.5 0 0 1 1.5 1.5V11"/><path d="M3.5 17.5L6 11.5h15l-2.6 6.6a1.5 1.5 0 0 1-1.4.9H5a1.5 1.5 0 0 1-1.5-1.5z"/>'),
  history: S('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 2"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  more3: S('<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>', true),
  refresh: S('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>'),
  terminal: S('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>'),
  undo: S('<path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2"/>'),
  redo: S('<path d="M15 7l4.5 4.5L15 16"/><path d="M19.5 11.5H10a5.5 5.5 0 0 0 0 11h2"/>'),
  play: S('<path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8a.8.8 0 0 0-1.2.7z"/>', true),
  pause: S('<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>', true),
  stop: S('<rect x="6" y="6" width="12" height="12" rx="2"/>', true),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  minus: S('<path d="M5 12h14"/>'),
  trash: S('<path d="M4.5 7h15M10 4h4M6.5 7l.9 11.6A1.5 1.5 0 0 0 8.9 20h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 10.5v6M14 10.5v6"/>'),
  duplicate: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  film: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>'),
  audio: S('<path d="M4 12h1.5M7 8.5v7M10 5.5v13M13 8v8M16 10v4M19 11.5v1"/>'),
  image: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>'),
  sequence: S('<rect x="3" y="7" width="12" height="10" rx="1.6"/><path d="M18 8.5v7M21 10v4"/>'),
  preset: S('<path d="M5 5.5h9.5L20 11l-9 9-6-6z"/><circle cx="9.5" cy="9.5" r="1.4"/>'),
  watch: S('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M8 13.5c1.2-1.6 2.5-2.4 4-2.4s2.8.8 4 2.4c-1.2 1.6-2.5 2.4-4 2.4s-2.8-.8-4-2.4z"/><circle cx="12" cy="13.5" r=".9"/>'),
  sliders: S('<path d="M5 6h8M17 6h2M5 12h2M11 12h8M5 18h10"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  family: S('<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.3 8.2l7.4 7.6M15.7 8.2l-7.4 7.6"/>'),
  log: S('<path d="M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01"/>'),
  info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5h.01"/>'),
  upload: S('<path d="M12 16V4.5M7.5 9L12 4.5 16.5 9M4.5 15.5v2.5A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>'),
  link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>'),
  file: S('<path d="M6.5 3.5h7l4.5 4.5v11A1.5 1.5 0 0 1 16.5 20.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8H18"/>'),
  warning: S('<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17h.01"/>'),
  okCircle: S('<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>'),
  errorCircle: S('<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  cpu: S('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M10 10h4v4h-4zM9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>'),
  layers: S('<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>'),
  ingest: S('<rect x="4.5" y="3.5" width="9" height="12" rx="1.5"/><path d="M7 3.5V6M9 3.5V6M11 3.5V6M17 10v8.5M13.5 15L17 18.5 20.5 15"/>'),
  scissors: S('<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4L19.5 17M8.6 15.6L19.5 7"/>'),
  eye: S('<path d="M3 12c2.5-4 5.5-6 9-6s6.5 2 9 6c-2.5 4-5.5 6-9 6s-6.5-2-9-6z"/><circle cx="12" cy="12" r="2.6"/>'),
  compare: S('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 3.5v17"/>'),
  grip: S('<circle cx="9" cy="6.5" r="1.2"/><circle cx="15" cy="6.5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17.5" r="1.2"/><circle cx="15" cy="17.5" r="1.2"/>', true),
  queue: S('<rect x="4" y="4.5" width="16" height="4" rx="1.2"/><rect x="4" y="10" width="16" height="4" rx="1.2"/><rect x="4" y="15.5" width="10" height="4" rx="1.2"/>'),
  skip: S('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  analyze: S('<path d="M4 19.5h16M6.5 16l3.5-5 3 3 4.5-7"/>'),
  captions: S('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10.5 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>'),
};

export function icon(name: string, size = 16): string {
  const svg = ICONS[name] ?? ICONS.info;
  return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>`;
}

export function brandMark(size = 20): string {
  return `<img class="fx-mark" src="/favicon.png" width="${size}" height="${size}" alt="" draggable="false">`;
}
