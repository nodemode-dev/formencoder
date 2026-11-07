import { Dialog } from '../../../frontend/src/ui/dialogs';
import { el, q, setText } from '../../../frontend/src/ui/dom';
import { toast } from '../../../frontend/src/ui/toast';
import { store } from '../state';

let dialog: Dialog | null = null;
let stage: HTMLElement;
let caption: HTMLElement;
let current = '';

function build(): Dialog {
  const d = new Dialog('Preview', 760);
  stage = el('<div class="fd-stage"></div>');
  caption = el('<p class="cv-note fd-caption"></p>');
  d.body.appendChild(stage);
  d.body.appendChild(caption);
  d.button('Save', 'ghost', () => { if (current) saveOutput(current); });
  d.button('Close', 'primary', () => d.close());
  d.onClose = () => {
    stage.replaceChildren();
    current = '';
  };
  return d;
}

export function saveOutput(id: string): void {
  const hit = store.outputOf(id);
  if (!hit?.output.blob) { toast('This output has not been encoded yet'); return; }
  const url = URL.createObjectURL(hit.output.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = hit.output.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function previewOutput(id: string): void {
  const hit = store.outputOf(id);
  if (!hit?.output.blob) { toast('This output has not been encoded yet'); return; }
  dialog ??= build();
  const { output } = hit;
  const url = URL.createObjectURL(hit.output.blob);
  let node: HTMLElement;
  if (output.mime.startsWith('video/')) {
    node = el<HTMLVideoElement>('<video class="fd-media" controls playsinline></video>');
    (node as HTMLVideoElement).src = url;
  } else if (output.mime.startsWith('audio/')) {
    node = el<HTMLAudioElement>('<audio class="fd-audio" controls></audio>');
    (node as HTMLAudioElement).src = url;
  } else {
    node = el<HTMLImageElement>('<img class="fd-media" alt="">');
    (node as HTMLImageElement).src = url;
  }
  stage.replaceChildren(node);
  current = id;
  dialog.setTitle(output.fileName);
  setText(caption, [output.encoder, output.note].filter(Boolean).join('. '));
  dialog.open(q(dialog.scrim, '.cv-btn-primary'));
}
