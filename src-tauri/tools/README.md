# src-tauri/tools

`./formencoder install-tools --stage` fills this folder with the separate delivery programs formencoder drives, each built from a pinned source tag whose commit is checked before it builds:

| Tool | Version | Licence | Programs | Used for |
| --- | --- | --- | --- | --- |
| BBC bmx | v1.6 | BSD-3-Clause | bmxtranswrap, mxf2raw | AS-10, AS-11 OP1a, AS-11 D10 and P2 (OP-Atom) wrapping, and reading them back in Verify |
| asdcplib | rel_2_13_2 | BSD-3-Clause | asdcp-wrap, asdcp-info | DCP picture and sound track files, and the DCP checks in Verify |
| OpenJPEG | v2.5.3 | BSD-2-Clause | opj_compress | DCI cinema-profile JPEG 2000 frames for DCP |

The licence texts land in `licences/`. Tauri bundles the folder as the app's `tools` resource, and the desktop workflow stages it before `tauri build`.

In a clone this file is all it holds; `./formencoder install-tools` without `--stage` installs the same programs into the per-person data folder instead. formencoder looks for them in `FORMENCODER_TOOLS_DIR`, the per-person `tools/bin` folder, the app's own `tools` folder, this folder in a clone, then `PATH` (`tools.list` shows what it found).

The programs run as separate processes; none of them is linked into formencoder.
