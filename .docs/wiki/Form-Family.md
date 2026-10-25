# Form Family

formencoder is the family's delivery end. It finds the other apps running on the same computer (their engines on 8040, 8250, 8060 and 8190, or their discovery records) and treats their work as sources.

| App | Source | How it arrives |
| --- | --- | --- |
| formcut | a project | formcut renders it through its own renderer at full quality, then formencoder encodes the result |
| formvfx | a composition | Live Link: frames and audio are pulled from formvfx's renderer, nothing is rendered in formvfx first; a `.fvxlink` file queues the same way |
| formwav | a session | formwav mixes it down, then formencoder encodes the mix |
| formvis | an image | the flattened image, as a still or the frames of a sequence |

The Family panel lists what each running app offers, each with a Queue button; agents use `family {action: add}`. A family output shows Preparing while the app produces the media, and re-encoding it pulls again, so changes made in the app show up.

An app does not have to be open. When formencoder needs one that is not running, it starts that app's engine headless (its `formcut-engine`, `formvfx-engine` and so on, from the installed app or the PATH, or `FORMCUT_ENGINE` and its siblings), renders through it, and stops it when formencoder quits, the way Media Encoder starts a headless Premiere.

Receive Exports on formcut's row (or `family {action: linkFormcut, preset}`) registers formencoder with formcut's signed webhooks: every export finished in formcut arrives in the queue and encodes with that preset while the editor keeps working. formencoder checks formcut's signature and the file's SHA-256 before it queues anything. Stop Receiving removes the webhook from formcut.

Finished files go back the other way: Send to formcut or Send to formvfx (a finished output's menu in the Queue) imports them into the running app, and a publish destination of type family does it automatically after an encode. The Form Family presets are the formats each app imports best.
