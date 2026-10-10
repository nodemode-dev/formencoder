import { Dialog } from './dialogs';
import { el } from './dom';
import { toast } from './toast';

export function report(title: string, text: string): void {
  const d = new Dialog(title, 720);
  const pre = el('<pre class="fx-report"></pre>');
  pre.textContent = text;
  d.body.appendChild(pre);
  d.button('Copy', 'ghost', () => void navigator.clipboard?.writeText(text).then(() => toast('Copied')));
  d.button('Close', 'primary', () => {
    d.close();
    d.scrim.remove();
  });
  d.onClose = () => d.scrim.remove();
  d.open();
}
