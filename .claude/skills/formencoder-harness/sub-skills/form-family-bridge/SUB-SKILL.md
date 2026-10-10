---
name: form-family-bridge
description: formencoder's bridge to the rest of the form family. Use when the media to encode lives in formcut (an edit), formvfx (a composition, over Dynamic Link), formwav (an audio session) or formvis (an image); when a formvfx .fvxlink file is dropped; when every formcut export should arrive in the queue on its own; when finished files should go back into formcut or formvfx; or when deciding which family app a file came from and where it should go next.
---

# form-family-bridge

formencoder is the family's delivery end. The other apps make the media; formencoder turns it into files for a destination. Each app is reached on this computer through its own local engine. The app does not have to be open: when formencoder needs one that is not running, it starts that app's engine headless (from the installed app, the PATH, or `FORMCUT_ENGINE` and its siblings), the way Media Encoder starts a headless Premiere, and stops it when formencoder quits. `discover` shows `canStart` for apps it could start.

| App | What it gives | How it arrives | Default port |
| --- | --- | --- | --- |
| formcut (video editor) | projects (sequences) | formcut renders the project through its own renderer at full quality, then formencoder encodes the result | 8040 |
| formvfx (motion graphics) | compositions | Dynamic Link: frames are pulled straight from formvfx's renderer with the comp's audio; nothing is rendered in formvfx first | 8230 |
| formwav (audio) | sessions | formwav mixes the session down, then formencoder encodes the mix | 8060 |
| formvis (images) | projects | the flattened image, as a still or the frames of a sequence | 8190 |

## The loop

1. `family {action: discover}`: which apps are running, where, and their versions. An app that is neither running nor installed cannot be reached; ask the person to install or open it.
2. `family {action: sources, app}`: its projects, compositions, sessions or images, with ids, names, durations and sizes.
3. `family {action: add, app, id (or name), preset, settings?, folder?, in?, out?, start?}` queues it. `in` and `out` are seconds in the app's own timeline. The output shows `preparing` while the app produces the media (a formcut render, a formvfx frame pull, a formwav mixdown), then `encoding`.
4. `wait` and `verify` as for any output.

A formvfx `.fvxlink` file (a Dynamic Link descriptor saved from formvfx) queues with `family {action: addLink, path}`.

## Receiving formcut exports

`family {action: linkFormcut, preset, folder?, start?}` registers formencoder with formcut's signed webhooks: every export finished in formcut then arrives in the queue and encodes with `preset` while the editor keeps working (Media Encoder's Send to Media Encoder). formencoder checks formcut's HMAC signature and the file's SHA-256 before it queues anything. `family {action: links}` shows the link and when it was made; `unlinkFormcut` removes the webhook from formcut. Turn it on only when the person asks, since every later export will encode.

## Sending files back

`family {action: send, app: formcut|formvfx, files, project?}` imports finished files into a running formcut (its media pool, or the named project) or formvfx (its project panel). Use it when the person's next step is in that app: proxies back to formcut, a rendered plate back to formvfx. formwav and formvis do not take files this way. A publish destination of type `family` does the same automatically after an encode (see `publish`).

## Which app the media came from

- An item added through `family` carries its app in `queue {action: list}`; re-encoding it re-pulls from the app, so changes made there since show up.
- A plain file may still have come from a family app: formcut renders, formvfx renders and formwav bounces land in those apps' render folders. When the person says "the edit", "the comp" or "the mix", prefer `family {action: sources}` over a file on disk, because the file may be stale.
- The Form Family presets (`system/family-formcut-mezzanine`, `system/family-formwav-audio`, `system/family-formvis-stills`) are the formats each app imports best; use them when the file goes back into the family.

## When it fails

- `formcut's export failed: ...` or `formwav did not return the session`: the app's own error; tell the person and suggest checking the project there.
- An app that stops answering mid-pull fails the output; `queue {action: resetStatus, refs}` retries after the app is back.
- Stopping the output also stops the app's render or the frame pull.
