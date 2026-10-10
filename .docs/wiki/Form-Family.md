# Form Family

formencoder is the family's delivery end. It finds the other apps running on the same computer (their engines on 8040, 8230, 8060 and 8190, or their discovery records) and treats their work as sources.

| App | Source | How it arrives |
| --- | --- | --- |
| formcut | a project | formcut renders it through its own renderer at full quality, then formencoder encodes the result |
| formvfx | a composition | Dynamic Link: frames and audio are pulled from formvfx's renderer, nothing is rendered in formvfx first; a `.fvxlink` file queues the same way |
| formwav | a session | formwav mixes it down, then formencoder encodes the mix |
| formvis | an image | the flattened image, as a still or the frames of a sequence |

The Family panel lists what each running app offers, each with a Queue button; agents use `family {action: add}`. A family output shows Preparing while the app produces the media, and re-encoding it pulls again, so changes made in the app show up.

Finished files go back the other way: Send to formcut or Send to formvfx (a finished output's menu in the Queue) imports them into the running app, and a publish destination of type family does it automatically after an encode. The Form Family presets are the formats each app imports best.
