# Demo media credits

The demo opens on four real files, shipped as JavaScript data packs in `demo/media/` (the packs carry the files base64-encoded, because a page opened from `file://` cannot fetch local files). Each source page was opened and its licence read before the file was downloaded. The licence column quotes what the page states.

| File in the demo | Title | Author | Source page | Licence as stated on the page | What was changed |
| --- | --- | --- | --- | --- | --- |
| `open-water-1280x720-30fps.mp4` (`media/open-water.js`) | Calm Ocean Waves in Bright Sunlight | Nui MALAMA | https://www.pexels.com/video/calm-ocean-waves-in-bright-sunlight-34964457/ | "Free" (the Pexels License, https://www.pexels.com/license/: free to use and modify, attribution not required) | Trimmed to 8 s (1 s to 9 s of the clip), scaled from 2560x1440 to 1280x720, re-encoded H.264 (`-preset veryfast -crf 24`), frame rate kept at 29.97 fps |
| `coast-aerial-1280x720-25fps.mp4` (`media/coast-aerial.js`) | Aerial view of waves | Nadezhda Moryak | https://www.pexels.com/video/aerial-view-of-waves-9806390/ | "Free to use" (the Pexels License) | Trimmed to 7 s (3 s to 10 s), scaled from 2560x1440 to 1280x720, re-encoded H.264 (`-crf 24`), 25 fps kept |
| `shoreline-vertical-404x720-60fps.mp4` (`media/shoreline-vertical.js`) | Dynamic Ocean Waves Crashing on Shore | Cagri KANMAZ | https://www.pexels.com/video/dynamic-ocean-waves-crashing-on-shore-30474731/ | "Free" (the Pexels License) | Whole 7.9 s clip, scaled from 1080x1920 to 404x720, re-encoded H.264 (`-crf 23`), 59.94 fps kept |
| `on-the-sea-reading.mp3` (`media/on-the-sea-reading.js`) | On The Sea, by Ivan Turgenev, translated by Constance Garnett; LibriVox recording, reader BK (Bruce Kachuk) | LibriVox volunteers; reader Bruce Kachuk | https://archive.org/details/on_the_sea_1904.poem_librivox | "Public Domain Mark 1.0" (licence URL http://creativecommons.org/publicdomain/mark/1.0/) | Excerpt of 21.1 s (22.6 s to 43.7 s of `onthesea_turgenev_bk_128kb.mp3`, cut at pauses between sentences), mixed to mono, re-encoded MP3 at 80 kb/s; loudness left as recorded (-23.8 LUFS integrated) |

The Pexels clips carry no audio track. They show water only: no people, brands or artwork.
