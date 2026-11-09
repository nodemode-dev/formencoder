# In-app demo media credits

The files here are the sources of the three browser demos, decoded unchanged from the demos' JavaScript packs by `scripts/demo-media.py`. Help > Demos and the Queue's Demos section copy them into the engine's imports folder (as `demo-<demo>-<file>`) and queue them. Each source page was opened and its licence read when the browser demos were made; the full rows, with what was changed from the originals, are in the demos' own credits.

| Folder | File | Title | Author | Source page | Licence as stated on the page | Full row |
| --- | --- | --- | --- | --- | --- | --- |
| `queue/` | `open-water-1280x720-30fps.mp4` | Calm Ocean Waves in Bright Sunlight | Nui MALAMA | https://www.pexels.com/video/calm-ocean-waves-in-bright-sunlight-34964457/ | "Free" (the Pexels License) | `demo/CREDITS.md` |
| `queue/` | `coast-aerial-1280x720-25fps.mp4` | Aerial view of waves | Nadezhda Moryak | https://www.pexels.com/video/aerial-view-of-waves-9806390/ | "Free to use" (the Pexels License) | `demo/CREDITS.md` |
| `queue/` | `shoreline-vertical-404x720-60fps.mp4` | Dynamic Ocean Waves Crashing on Shore | Cagri KANMAZ | https://www.pexels.com/video/dynamic-ocean-waves-crashing-on-shore-30474731/ | "Free" (the Pexels License) | `demo/CREDITS.md` |
| `queue/` | `on-the-sea-reading.mp3` | On The Sea, by Ivan Turgenev, translated by Constance Garnett; LibriVox recording, reader Bruce Kachuk | LibriVox volunteers | https://archive.org/details/on_the_sea_1904.poem_librivox | "Public Domain Mark 1.0" | `demo/CREDITS.md` |
| `broadcast/` | `on-the-sea-programme.mp4` | Aerial view of waves (picture); On The Sea, LibriVox (sound) | Nadezhda Moryak; LibriVox volunteers | https://www.pexels.com/video/aerial-view-of-waves-9806390/ and https://archive.org/details/on_the_sea_1904.poem_librivox | "Free" (the Pexels License); "Public Domain Mark 1.0" | `demos/broadcast/CREDITS.md` |
| `broadcast/` | `on-the-sea-programme.srt` (a copy of `demos/broadcast/src/data/programme.srt`) | On the Sea, in Dream Tales and Prose Poems | Ivan Turgenev; Constance Garnett | https://www.gutenberg.org/ebooks/8935 | "Public domain in the USA." | `demos/broadcast/CREDITS.md` |
| `inspect/` | `autumn-stream.mp4` | Forest Stream Flowing through Mossy Rocks | I Am Sorin | https://www.pexels.com/video/forest-stream-flowing-through-mossy-rocks-8194489/ | "Free" (the Pexels License) | `demos/inspect/CREDITS.md` |
| `inspect/` | `waterfall.mp4` | Waterfall in the Forest | Peter Fowler | https://www.pexels.com/video/waterfall-in-the-forest-6394054/ | "Free" (the Pexels License) | `demos/inspect/CREDITS.md` |
| `inspect/` | `river-vertical.mp4` | Stream in Mountains | Rudi De Ceuster | https://www.pexels.com/video/stream-in-mountains-13279175/ | "Free" (the Pexels License) | `demos/inspect/CREDITS.md` |
| `inspect/` | `clouds_0001.jpg` to `clouds_0036.jpg` | Time Lapse of Moving Clouds over a Mountain Area | Luis Quintero | https://www.pexels.com/video/time-lapse-of-moving-clouds-over-a-mountain-area-16754231/ | "Free" (the Pexels License) | `demos/inspect/CREDITS.md` |

`files.json` in each folder lists the files the app copies. The inspect demo's ready-made outputs (the high and low bit rate encodes, the proxy and the GIF) are not shipped: in the app they are queued as outputs and encoded by the engine.
