# demos/inspect · HASHOUT_LOG

Living context for demo 3, the inspect and convert demo. The code carries almost no comments; the reasoning lives here. Demo 1 (`../../demo/HASHOUT_LOG.md`) explains the shared approach: the real interface from `frontend/src/` over a small browser engine, a classic IIFE build so `file://` works, media as JavaScript data packs.

## Focus and why

Demo 1 is the Queue and the Preset Browser; demo 2 is delivery specs. This one is the looking side of the app: what is in a file, how two files differ, which frame is which, and whether a copy is faithful. The features it maps to exist in the repo: Media Info and `media.probe`, the Source, Output and Compare views of Export Settings, `contact_sheet` and `preview_frame`, `encode.verify`, numbered image sequences added with a frame rate (`queue.addSource`), `proxy.create` and the `proxy-h264-540` preset, GIF as an output format, and `ingest.copy` with `verify` of size, MD5 or bit-for-bit.

Left out on purpose: Fit Tuning and any adjacent-frame luminance statistic (the repo's CLAUDE.md declines them), so there is no scene detection or change graph; ProRes, DNxHR, CineForm and MXF files, which a page cannot write; animated PNG, which is not an app format (GIF is the animated output).

## Build

`vite.config.mjs` builds `src/main.ts` to one IIFE (`assets/inspect.js`) and `assets/inspect.css`, `emptyOutDir` false, output inside this folder. Run from this folder with the interface's installed Vite (see `README.md`). `index.html` is hand-written with the pre-paint theme script. The dev server is `host: false` on port 5281. `src/styles/fonts.css` imports the latin subsets only, inlined by the build, so there are no font requests.

## Reuse

Imported by path, read only: `frontend/src` styles and `ui/*`, and from demo 1 `engine/probe` (container parsing), `engine/source` (the seekable video reader), `engine/encode` (WebM, GIF, stills), `engine/presets`. New in this folder: MD5, a store-only ZIP writer, timecode, a GIF probe, the sequence source, the contact sheet, the verify chips and the ingest. Nothing from `demo/` is copied.

## Decisions

- **The shoot.** A hike: a stream (the A and B pair, proxy and GIF come from it), a waterfall (2:1), a vertical river at 60 fps and a cloud time-lapse delivered as a numbered JPEG sequence, so one card shows 29.97, 23.976, 60 and 24 fps and three frame shapes. The outputs were made with FFmpeg before shipping and are labelled "made with FFmpeg"; everything made by Convert in the page is labelled "Made in this page".
- **Frame accuracy.** The viewer steps by frame number, not by seconds: it asks the reader for the middle of frame n (`(n + 0.5) / fps`) so rounding cannot land on a neighbour. Timecode is drop frame at 29.97 and 59.94 and non-drop elsewhere; an output cut from the middle of a source carries its offset, so A and B show the same timecode for the same picture. Compare steps both sides together.
- **Probe.** Media Info reads the bytes (demo 1's probe), and marks a row when A and B differ: size, duration, rate, frame count and loudness for the encodes, nothing for equal rows. The card summary lists the mixed rates and shapes.
- **Checks.** Each output carries verify chips (size, duration, frame size, rate, codecs) computed from a fresh probe of the output, as `encode.verify` does from the output's own settings.
- **Sequences.** A set of numbered files is recognised by its pattern; first and last number, count and gaps are reported, and the frame rate is "set when added", as in the app. Convert writes frames as PNG or JPEG into a ZIP with numbered names (the page cannot write a folder).
- **Checksums.** MD5 is a small incremental implementation hashed in slices so the page stays responsive; it agrees with `md5sum` on the shipped packs. Ingest copies bytes in memory and verifies by size, by MD5 or by comparing every byte. The damage switch flips one bit of the first copy so the failure state can be seen; it is labelled as a test.
- **Zero flash.** Packs load by script tag into rows that are already in the browser card (the thumbnails fill in place); Media Info, Outputs and Checksums use `patchList` and `setText`; the stage canvases have fixed boxes. Checked under 4x CPU and a throttled network: shell not rebuilt, layout shift under 0.0002.

## Not done

Scene and change analysis (declined), proxies in ProRes or CineForm, MXF, real folders for a sequence, animated PNG.
